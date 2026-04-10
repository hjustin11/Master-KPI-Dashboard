import {
  normalizeArticleForecastProjectLabel,
  clampForecastDateRange,
} from "@/shared/lib/xentralArticleForecastProject";
import {
  extractAttributes,
  fetchXentralProjectByIdLookup,
  joinUrl,
  pickFirstString,
} from "@/shared/lib/xentralProjectLookup";
import { aggregateSkuSalesWithFileCache } from "@/shared/lib/xentralDeliverySalesCache";

export type XentralArticle = {
  sku: string;
  name: string;
  stock: number;
  /** Bestand je Lagerplatz/Standort, falls die API eine Aufschlüsselung liefert; sonst leer. */
  stockByLocation: Record<string, number>;
  /** Verkaufspreis aus Xentral, falls im API-Objekt vorhanden (Referenz für Preisgleichheit). */
  price: number | null;
  /** Verkaufswert-Basis (VK/UVP etc.) für KPI "Verkaufswert gesamt". */
  salesPrice: number | null;
  /** Xentral-Projekt-ID, falls am Artikel gesetzt. */
  projectId: string | null;
  /** Aufgelöster Projekt-/Marktplatzname (wie bei Bestellungen). */
  projectDisplay: string;
  /** Gesamt verkaufte Menge (API-Felder oder Summe der Projektspalten). */
  totalSold: number;
  /** Verkaufsmengen je Projektname — Basis für dynamische Tabellenspalten. */
  soldByProject: Record<string, number>;
  /** EAN/GTIN aus Stammdaten, falls von der Xentral-API geliefert. */
  ean: string | null;
};

type XentralArticleRaw = {
  sku: string;
  name: string;
  stock: number;
  stockByLocation: Record<string, number>;
  price: number | null;
  salesPrice: number | null;
  /** JSON:API `data[].id` — für Join mit GET /api/v1/purchasePrices */
  xentralProductId: string | null;
  projectId: string | null;
  totalSold: number;
  soldByProjectRaw: Record<string, number>;
  ean: string | null;
};

export type XentralArticlesApiPayload = {
  items: XentralArticle[];
  totalCount: number;
  meta?: Record<string, unknown>;
};

export class XentralArticlesPayloadError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super("XentralArticlesPayloadError");
    this.name = "XentralArticlesPayloadError";
  }
}

export type XentralArticlesComputeArgs = {
  baseUrl: string;
  token: string;
  query: string;
  fetchAll: boolean;
  includePrices: boolean;
  includeSales: boolean;
  pageSize: number;
  pageNumber: number;
  salesFromYmd: string | null;
  salesToYmd: string | null;
};

const EXCLUDED_NAME_TERMS = [
  "Versandtasche",
  "Versandkarton",
  "B-Ware",
  "Ersatzteil",
  "Volkswagen",
  // Messestand / Zubehör (Beispiele aus deinem Export)
  "Messestand",
  "Kabeltrommel",
  "Mehrfachsteckdose",
  "Beachflag",
  "Pixlip",
  "Staubsauger",
  "Cubes",
  "Schwerlastwagen",
  "Hubwagen",
  "Fernseher",
  "Tablet",
];

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // Xentral liefert Zahlen oft als String (z.B. "3,35 €" oder "1.234,56").
    // Wir versuchen robuste Normalisierung auf JS-kompatibles Dezimalformat.
    let s = value.trim();
    // remove currency symbols / spaces
    s = s.replace(/[\u00A0\s€$]/g, "");
    // remove any non-numeric except separators and minus
    s = s.replace(/[^0-9.,-]/g, "");

    // Both separators: assume "." thousand and "," decimal (e.g. 1.234,56)
    const hasComma = s.includes(",");
    const hasDot = s.includes(".");
    if (hasComma && hasDot) {
      // remove thousand dots
      s = s.replace(/\./g, "");
      // replace decimal comma with dot
      s = s.replace(",", ".");
    } else if (hasComma && !hasDot) {
      // only comma: treat as decimal separator
      s = s.replace(",", ".");
    } else if (!hasComma && hasDot) {
      // only dot: treat as decimal separator (already JS-compatible)
    }

    // Decimal comma -> dot already normalized above; parseFloat tolerates "1." / trailing separators.
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Xentral liefert Geldwerte häufig als Objekt: { currency: "EUR", amount: "3.3500" }.
 * Diese Helferfunktion liest sowohl flache Zahlen/Strings als auch amount-basierte Objekte.
 */
function asMoneyAmount(value: unknown): number | null {
  const direct = asNumber(value);
  if (direct != null) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  return (
    asNumber(rec.amount) ??
    asNumber(rec.value) ??
    asNumber(rec.net) ??
    asNumber(rec.gross) ??
    null
  );
}

function isNumericOnly(value: string) {
  return /^[0-9]+$/.test(value.trim());
}

function shouldExcludeArticle(args: { sku: string; name: string }) {
  const name = args.name.trim().toLowerCase();
  const sku = args.sku.trim();

  // Messestand-SKUs (z.B. MS-...) generell ausblenden
  if (/^MS-/i.test(sku)) return true;

  if (sku && isNumericOnly(sku)) return true;

  for (const term of EXCLUDED_NAME_TERMS) {
    if (name.includes(term.toLowerCase())) return true;
  }

  return false;
}

function extractSoldByProjectRaw(a: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const blobs: unknown[] = [
    a.salesByChannel,
    a.projectSales,
    a.salesPerProject,
    a.salesByProject,
    (a.statistics as Record<string, unknown> | undefined)?.byProject,
    (a.statistics as Record<string, unknown> | undefined)?.salesByProject,
  ];
  for (const raw of blobs) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const n = asNumber(v);
        if (n != null && Number.isFinite(n)) {
          out[k] = (out[k] ?? 0) + n;
        }
      }
    }
  }
  return out;
}

/**
 * Versucht, Bestände je Lagerplatz/Standort aus typischen Xentral-/JSON:API-Feldern zu lesen.
 * Schlüssel sind Anzeigenamen (roh aus der API); die UI normalisiert die Beschriftung.
 */
function extractStockByLocation(a: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};

  const add = (label: string | null, qty: number | null) => {
    if (!label?.trim() || qty == null || !Number.isFinite(qty)) return;
    const k = label.trim();
    out[k] = (out[k] ?? 0) + qty;
  };

  const collectFromRowish = (row: unknown) => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    const ra = extractAttributes(r);
    const storageLoc = ra.storageLocation ?? r.storageLocation;
    const storageNameFromRef =
      storageLoc && typeof storageLoc === "object"
        ? pickFirstString(
            extractAttributes(storageLoc as Record<string, unknown>).name
          ) ?? pickFirstString((storageLoc as Record<string, unknown>).name)
        : null;
    const lagerplatzRef = ra.lagerplatz ?? r.lagerplatz;
    const lagerplatzName =
      lagerplatzRef && typeof lagerplatzRef === "object"
        ? pickFirstString(
            extractAttributes(lagerplatzRef as Record<string, unknown>).name
          ) ??
          pickFirstString(
            extractAttributes(lagerplatzRef as Record<string, unknown>).bezeichnung
          )
        : null;

    const label =
      pickFirstString(ra.name) ??
      pickFirstString(ra.label) ??
      pickFirstString(ra.title) ??
      pickFirstString(ra.storageLocationName) ??
      pickFirstString(ra.lagerplatzName) ??
      (typeof ra.lagerplatz === "string" ? ra.lagerplatz : null) ??
      lagerplatzName ??
      storageNameFromRef ??
      pickFirstString(ra.locationName) ??
      pickFirstString(ra.binName) ??
      pickFirstString(ra.warehouseName) ??
      null;

    const qty =
      asNumber(ra.quantity) ??
      asNumber(ra.stock) ??
      asNumber(ra.count) ??
      asNumber(ra.bestand) ??
      asNumber(ra.availableCount) ??
      asNumber(ra.amount) ??
      asNumber(ra.quantityAvailable);

    add(label, qty);
  };

  const walkArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) collectFromRowish(it);
  };

  walkArray(a.stockPositions);
  walkArray(a.stocks);
  walkArray(a.storageStocks);
  walkArray(a.warehouseStocks);
  walkArray(a.lagerplaetze);
  walkArray(a.stockAllocations);
  walkArray(a.inventoryPositions);

  const stats = a.stockStats;
  if (stats && typeof stats === "object" && !Array.isArray(stats)) {
    const s = stats as Record<string, unknown>;
    walkArray(s.locations);
    walkArray(s.storageLocations);
    walkArray(s.positions);
    walkArray(s.stocks);
    for (const ob of [s.byLocation, s.byStorageLocation, s.perLocation, s.byWarehouse]) {
      if (ob && typeof ob === "object" && !Array.isArray(ob)) {
        for (const [k, v] of Object.entries(ob as Record<string, unknown>)) {
          add(k, asNumber(v));
        }
      }
    }
  }

  return out;
}

function extractTotalSold(a: Record<string, unknown>, soldByProjectRaw: Record<string, number>): number {
  const direct =
    asNumber(a.soldQuantity) ??
    asNumber(a.totalSold) ??
    asNumber(a.salesQuantity) ??
    asNumber(a.verkauft) ??
    asNumber(a.lifetimeSales) ??
    asNumber((a.statistics as Record<string, unknown> | undefined)?.sold) ??
    asNumber((a.statistics as Record<string, unknown> | undefined)?.totalSold) ??
    asNumber((a.statistics as Record<string, unknown> | undefined)?.quantitySold) ??
    null;
  if (direct != null && Number.isFinite(direct) && direct > 0) return direct;
  const sum = Object.values(soldByProjectRaw).reduce((x, y) => x + y, 0);
  return sum > 0 ? sum : 0;
}

function parseProductIdFromPurchasePriceItem(obj: Record<string, unknown>): string | null {
  const rel = obj.relationships as Record<string, unknown> | undefined;
  const tryProductRel = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const pr = node as Record<string, unknown>;
    const data = pr.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const id = pickFirstString((data as Record<string, unknown>).id);
      if (id) return id;
    }
    if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
      const id = pickFirstString((data[0] as Record<string, unknown>).id);
      if (id) return id;
    }
    return null;
  };

  if (rel) {
    const fromSingular = tryProductRel(rel.product);
    if (fromSingular) return fromSingular;
    const fromPlural = tryProductRel(rel.products);
    if (fromPlural) return fromPlural;
  }
  const a = extractAttributes(obj) as Record<string, unknown>;
  const pref = a.product;
  if (typeof pref === "string") return pref.trim() || null;
  if (pref && typeof pref === "object" && !Array.isArray(pref)) {
    const id = pickFirstString((pref as Record<string, unknown>).id);
    if (id) return id;
  }
  return pickFirstString(a.productId) ?? pickFirstString(a.product_id) ?? null;
}

function parsePriceFromPurchasePriceItem(obj: Record<string, unknown>): number | null {
  const a = extractAttributes(obj) as Record<string, unknown>;
  return (
    asMoneyAmount(a.price) ??
    asNumber(a.preis) ??
    asMoneyAmount(a.netPrice) ??
    asNumber(a.net_price) ??
    asMoneyAmount(a.grossPrice) ??
    asMoneyAmount(a.amount) ??
    null
  );
}

function parseFromQuantityFromPurchasePriceItem(obj: Record<string, unknown>): number | null {
  const a = extractAttributes(obj) as Record<string, unknown>;
  return asNumber(a.fromQuantity) ?? asNumber(a.from_quantity) ?? asNumber(a.minQuantity) ?? null;
}

/**
 * Einkaufspreise liegen in Xentral oft nicht flach am Produkt, sondern unter
 * GET /api/v1/purchasePrices (Relationship `product`). Pro Produkt-ID einen Preis wählen
 * (niedrigste Staffelmenge bevorzugt).
 */
async function fetchPurchasePriceByProductIdMap(args: {
  baseUrl: string;
  token: string;
}): Promise<Map<string, number>> {
  const best = new Map<string, { price: number; fromQ: number }>();
  const paths = ["api/v1/purchasePrices", "api/v2/purchasePrices"];

  for (const path of paths) {
    let pathWorked = false;
    for (let page = 1; page <= 500; page++) {
      const url = new URL(joinUrl(args.baseUrl, path));
      url.searchParams.set("page[number]", String(page));
      url.searchParams.set("page[size]", String(100));

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${args.token}`,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        if (page === 1 && (res.status === 404 || res.status === 405)) break;
        break;
      }
      pathWorked = true;

      let json: unknown;
      try {
        json = (await res.json()) as unknown;
      } catch {
        break;
      }
      const root = json as Record<string, unknown>;
      const data = Array.isArray(root?.data) ? (root.data as unknown[]) : [];
      if (!data.length) break;

      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const productId = parseProductIdFromPurchasePriceItem(obj);
        const price = parsePriceFromPurchasePriceItem(obj);
        if (!productId || price == null || !Number.isFinite(price)) continue;
        const fromQRaw = parseFromQuantityFromPurchasePriceItem(obj);
        const fromQ = fromQRaw != null && Number.isFinite(fromQRaw) ? fromQRaw : 1e9;

        const prev = best.get(productId);
        if (!prev || fromQ < prev.fromQ) {
          best.set(productId, { price, fromQ });
        }
      }

      if (data.length < 100) break;
    }
    if (pathWorked) break;
  }

  const out = new Map<string, number>();
  for (const [id, { price }] of best) {
    out.set(id, price);
  }
  return out;
}

/** Erste plausibel EAN/GTIN (8–14 Ziffern) aus flachen Attributen. */
function extractEanFromProductAttributes(a: Record<string, unknown>, raw: Record<string, unknown>): string | null {
  const tryVal = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      const s = String(Math.abs(Math.trunc(value)));
      return /^\d{8,14}$/.test(s) ? s : null;
    }
    if (typeof value === "string") {
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 14) return digits;
    }
    return null;
  };

  const keys = [
    "ean",
    "EAN",
    "gtin",
    "GTIN",
    "barcode",
    "Barcode",
    "barCode",
    "manufacturerEan",
    "manufacturer_ean",
    "articleEan",
    "article_ean",
    "externeIdentifikation",
    "externalIdentification",
    "upc",
    "UPC",
  ];
  for (const k of keys) {
    const v = tryVal(a[k] ?? raw[k]);
    if (v) return v;
  }
  return null;
}

function mapToArticlesRaw(payload: unknown): XentralArticleRaw[] | null {
  const root = payload as Record<string, unknown> | null;
  const candidates: unknown[] =
    Array.isArray(payload) ? payload : Array.isArray(root?.data) ? (root?.data as unknown[]) : [];
  if (!Array.isArray(candidates) || !candidates.length) return [];

  const rows: XentralArticleRaw[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const a = extractAttributes(obj);
    const xentralProductId = pickFirstString(obj.id) ?? null;

    const sku =
      pickFirstString(a.sku) ??
      pickFirstString(a.SKU) ??
      pickFirstString(obj.sku) ??
      pickFirstString(obj.SKU) ??
      pickFirstString(a.number) ??
      pickFirstString(a.nummer) ??
      pickFirstString(a.articleNumber) ??
      pickFirstString(a.artikelnummer) ??
      "";

    const name =
      pickFirstString(a.name) ??
      pickFirstString(a.bezeichnung) ??
      pickFirstString(a.titel) ??
      pickFirstString(a.artikelname) ??
      pickFirstString(obj.name) ??
      "";

    const stockByLocation = extractStockByLocation(a);
    const sumByLocation = Object.values(stockByLocation).reduce((x, y) => x + y, 0);

    const aggregateStock =
      asNumber(a.stock) ??
      asNumber(a.bestand) ??
      asNumber(a.lagerbestand) ??
      asNumber(a.availableCount) ??
      asNumber((a.stockStats as Record<string, unknown> | undefined)?.availableCount) ??
      asNumber((a.stockStats as Record<string, unknown> | undefined)?.totalCount) ??
      asNumber(a.stockCount) ??
      asNumber(a.on_hand) ??
      asNumber(obj.stock) ??
      0;

    const stock =
      Object.keys(stockByLocation).length > 0 ? sumByLocation : aggregateStock;

    const raw = a as unknown as Record<string, unknown>;

    const readPriceFromMaybeEinkauf = (value: unknown): number | null => {
      const tryObj = (o: unknown): number | null => {
        if (!o || typeof o !== "object") return null;
        const rec = o as Record<string, unknown>;
        return (
          asNumber(rec.preis) ??
          asNumber(rec.Preis) ??
          asNumber(rec.price) ??
          asNumber(rec.Price) ??
          asNumber(rec.einkaufpreis) ??
          asNumber(rec.einkaufspreis) ??
          asNumber(rec.einstandspreis) ??
          asNumber(rec.costPrice) ??
          asNumber(rec.costprice) ??
          asNumber(rec.purchasePrice) ??
          null
        );
      };

      if (Array.isArray(value)) {
        for (const it of value) {
          const v = tryObj(it);
          if (v != null) return v;
        }
        return null;
      }

      // Normalfall: Einkauf ist ein Objekt mit Feldern wie „Preis“/„preis“.
      return tryObj(value);
    };

    const ekPrice =
      readPriceFromMaybeEinkauf((raw as Record<string, unknown>).einkauf) ??
      readPriceFromMaybeEinkauf((raw as Record<string, unknown>).Einkauf) ??
      // Fallbacks auf flache Felder (falls Xentral keine verschachtelte Struktur liefert)
      asNumber(raw.einkaufpreis) ??
      asNumber(raw.einkaufspreis) ??
      asNumber(raw.einstandspreis) ??
      asNumber(raw.costPrice) ??
      asNumber(raw.costprice) ??
      asMoneyAmount(raw.purchasePrice) ??
      asMoneyAmount(raw.purchasePriceNet) ??
      asMoneyAmount(raw.purchasePriceGross) ??
      asMoneyAmount((raw.calculatedPurchasePrice as Record<string, unknown> | undefined)?.price) ??
      null;

    const salesPrice =
      asNumber((raw as Record<string, unknown>).verkaufspreis) ??
      asNumber(raw.salesPrice) ??
      asNumber((raw.sales as Record<string, unknown> | undefined)?.price) ??
      asNumber(raw.listPrice) ??
      asNumber(raw.listprice) ??
      asNumber(raw.uvp) ??
      asNumber(raw.bruttopreis) ??
      asNumber(raw.nettopreis) ??
      asNumber(raw.unitPrice) ??
      asNumber((raw.pricing as Record<string, unknown> | undefined)?.gross) ??
      asMoneyAmount(raw.salesPriceNet) ??
      asMoneyAmount(raw.salesPriceGross) ??
      null;

    // In der UI nutzen wir dieses Feld als EK-Preis.
    // Falls Xentral keinen eindeutigen EK liefert, fallbacken wir auf price/raw.price.
    const price = ekPrice ?? asNumber(raw.price) ?? salesPrice;

    const projectRef = a.project;
    const projectIdFromRef =
      projectRef && typeof projectRef === "object"
        ? pickFirstString((projectRef as Record<string, unknown>).id)
        : null;
    const projectIdFlat =
      pickFirstString(a.projectId) ??
      pickFirstString(a.project_id) ??
      pickFirstString(a.projekt) ??
      null;
    const projectId = projectIdFromRef ?? projectIdFlat ?? null;

    const soldByProjectRaw = extractSoldByProjectRaw(a);
    const totalSold = extractTotalSold(a, soldByProjectRaw);
    const ean = extractEanFromProductAttributes(a, raw);

    if (!sku && !name) continue;
    if (shouldExcludeArticle({ sku, name })) continue;
    rows.push({
      sku,
      name,
      stock,
      stockByLocation,
      price,
      salesPrice,
      xentralProductId,
      projectId,
      totalSold,
      soldByProjectRaw,
      ean,
    });
  }

  return rows;
}

function enrichArticles(
  rows: XentralArticleRaw[],
  projectById: Map<string, string>,
  purchasePriceByProductId?: Map<string, number>
): XentralArticle[] {
  return rows.map((r) => {
    let price = r.price;
    if (
      (price == null || !Number.isFinite(price)) &&
      r.xentralProductId &&
      purchasePriceByProductId?.size
    ) {
      const p = purchasePriceByProductId.get(r.xentralProductId);
      if (p != null && Number.isFinite(p)) price = p;
    }
    const salesPrice = r.salesPrice ?? r.price;

    let projectDisplay = "—";
    if (r.projectId) {
      const mapped = projectById.get(r.projectId);
      projectDisplay = normalizeArticleForecastProjectLabel((mapped ?? r.projectId).trim() || "—");
    }

    const soldByProject: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.soldByProjectRaw)) {
      const keyTrim = k.trim();
      const isNumericKey = /^[0-9]+$/.test(keyTrim);
      const label =
        isNumericKey && projectById.has(keyTrim)
          ? normalizeArticleForecastProjectLabel(projectById.get(keyTrim)!)
          : normalizeArticleForecastProjectLabel(k);
      soldByProject[label] = (soldByProject[label] ?? 0) + v;
    }

    if (Object.keys(soldByProject).length === 0 && r.totalSold > 0 && projectDisplay !== "—") {
      soldByProject[projectDisplay] = r.totalSold;
    }

    const sumCols = Object.values(soldByProject).reduce((acc, n) => acc + n, 0);
    const totalSold = sumCols > 0 ? sumCols : r.totalSold;

    return {
      sku: r.sku,
      name: r.name,
      stock: r.stock,
      stockByLocation: { ...r.stockByLocation },
      price,
      salesPrice,
      projectId: r.projectId,
      projectDisplay,
      totalSold,
      soldByProject,
      ean: r.ean,
    };
  });
}

function parseTotalCount(payload: unknown): number | null {
  const root = payload as Record<string, unknown> | null;
  const extra = (root?.extra as Record<string, unknown> | undefined) ?? undefined;
  const totalCount = extra?.totalCount;
  return asNumber(totalCount);
}

export async function computeXentralArticlesPayload(
  args: XentralArticlesComputeArgs
): Promise<XentralArticlesApiPayload> {
  const {
    baseUrl,
    token,
    query,
    fetchAll,
    includePrices,
    includeSales,
    pageSize,
    pageNumber,
    salesFromYmd,
    salesToYmd,
  } = args;

  async function fetchPage(page: number) {
    const url = new URL(joinUrl(baseUrl, "api/v1/products"));
    url.searchParams.set("page[number]", String(page));
    url.searchParams.set("page[size]", String(pageSize));
    if (query) {
      url.searchParams.set("filter[0][key]", "search");
      url.searchParams.set("filter[0][value]", query);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }

    return { res, text, json, url: url.toString() };
  }

  const first = await fetchPage(pageNumber);
  if (!first.res.ok || !first.json) {
    throw new XentralArticlesPayloadError(502, {
      error:
        first.res.status === 401
          ? "Xentral API: Unauthorized (401). Bitte Personal Access Token (PAT) in .env.local setzen."
          : "Xentral API konnte nicht gelesen werden. Token/Endpoint prüfen.",
      status: first.res.status,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              baseUrl,
              hasToken: Boolean(token),
              tokenLength: token.length,
              tokenHasPipe: token.includes("|"),
              pageNumber,
              pageSize,
              url: first.url,
            }
          : undefined,
      preview: (first.text ?? "").slice(0, 240),
    });
  }

  const [projectById, purchasePriceByProductId] = await Promise.all([
    fetchXentralProjectByIdLookup({ baseUrl, token }),
    includePrices ? fetchPurchasePriceByProductIdMap({ baseUrl, token }) : Promise.resolve(undefined),
  ]);
  const firstRaw = mapToArticlesRaw(first.json) ?? [];
  const firstItems = enrichArticles(firstRaw, projectById, purchasePriceByProductId);
  const totalCount = parseTotalCount(first.json) ?? firstItems.length;

  async function withOptionalSalesWindow(items: XentralArticle[]): Promise<{
    items: XentralArticle[];
    meta?: Record<string, unknown>;
  }> {
    if (!includeSales) return { items };
    if (!salesFromYmd || !salesToYmd) return { items };
    const { fromYmd, toYmd } = clampForecastDateRange(salesFromYmd, salesToYmd);
    const agg = await aggregateSkuSalesWithFileCache({
      baseUrl,
      token,
      projectById,
      fromYmd,
      toYmd,
    });
    const next = items.map((row) => {
      const hit = agg.bySku.get(row.sku.trim().toLowerCase());
      if (hit) {
        return {
          ...row,
          soldByProject: hit.soldByProject,
          totalSold: hit.totalSold,
        };
      }
      return { ...row, soldByProject: {}, totalSold: 0 };
    });
    return {
      items: next,
      meta: {
        salesWindow: {
          fromYmd,
          toYmd,
          deliveryNotesInWindow: agg.meta.deliveryNotesInWindow,
          lineItemsParsed: agg.meta.lineItemsParsed,
          pagesFetched: agg.meta.pagesFetched,
          stoppedEarly: agg.meta.stoppedEarly,
          hitSalesPageCap: agg.meta.hitSalesPageCap,
          listOk: agg.meta.listOk,
          listStatus: agg.meta.listStatus,
          source: agg.meta.source,
          cacheDaysUsed: agg.meta.cacheDaysUsed,
          liveWindowFromYmd: agg.meta.liveWindowFromYmd,
          liveWindowToYmd: agg.meta.liveWindowToYmd,
        },
      },
    };
  }

  if (!fetchAll) {
    const { items, meta } = await withOptionalSalesWindow(firstItems);
    return { items, totalCount, meta } satisfies XentralArticlesApiPayload;
  }

  const rawAccum: XentralArticleRaw[] = [...firstRaw];
  const maxItems = 20_000;
  const maxPages = 400;
  let page = pageNumber + 1;
  while (rawAccum.length < totalCount && rawAccum.length < maxItems && page <= maxPages) {
    const next = await fetchPage(page);
    if (!next.res.ok || !next.json) break;
    const nextRaw = mapToArticlesRaw(next.json) ?? [];
    if (!nextRaw.length) break;
    rawAccum.push(...nextRaw);
    page += 1;
  }

  const enriched = enrichArticles(rawAccum, projectById, purchasePriceByProductId);
  const { items, meta } = await withOptionalSalesWindow(enriched);
  return { items, totalCount, meta } satisfies XentralArticlesApiPayload;
}

