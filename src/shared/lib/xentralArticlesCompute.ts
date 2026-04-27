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
import { aggregateShopifySkuSales } from "@/shared/lib/shopifySkuSalesAggregator";

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
  /** JSON:API-ID — benötigt für Detail-Fetch `/api/v1/products/{id}`. */
  xentralProductId: string | null;
  /** Gesamt verkaufte Menge (API-Felder oder Summe der Projektspalten). */
  totalSold: number;
  /** Verkaufsmengen je Projektname — Basis für dynamische Tabellenspalten. */
  soldByProject: Record<string, number>;
  /** EAN/GTIN aus Stammdaten, falls von der Xentral-API geliefert. */
  ean: string | null;
  /** Marke/Hersteller, falls in Xentral hinterlegt. */
  brand: string | null;
  /** Länge in Zentimetern (normalisiert). */
  dimL: number | null;
  /** Breite in Zentimetern. */
  dimW: number | null;
  /** Höhe in Zentimetern. */
  dimH: number | null;
  /** Gewicht in Kilogramm. */
  weight: number | null;
  /** Kategorie/Warengruppen-Pfad, falls in Xentral gepflegt. */
  category: string | null;
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
  brand: string | null;
  dimL: number | null;
  dimW: number | null;
  dimH: number | null;
  weight: number | null;
  category: string | null;
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

/** Versucht eine Zahl aus verschiedenen Formaten zu ziehen (plain number, string, { value }). */
function coerceNumeric(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const inner of ["value", "amount", "wert", "betrag"]) {
      const nested = obj[inner];
      const out = coerceNumeric(nested);
      if (out != null) return out;
    }
  }
  return null;
}

function pickNumericValue(
  a: Record<string, unknown>,
  raw: Record<string, unknown>,
  keys: readonly string[]
): number | null {
  // 1) Flache Attribute + Raw
  for (const k of keys) {
    const v = coerceNumeric(a[k] ?? raw[k]);
    if (v != null) return v;
  }
  // 2) Verschachtelte Container (Xentral v2 nested sometimes)
  // Xentral v1 API nutzt insbesondere `measurements` mit Unterobjekten
  // `{weight, length, width, height}` und Werten `{value, unit}`.
  const containers = [
    a.measurements,
    a.dimensions,
    a.abmessungen,
    a.packageDimensions,
    a.packaging,
    a.verpackung,
    a.package,
    (a.weight as unknown) as Record<string, unknown> | undefined,
    (a.gewicht as unknown) as Record<string, unknown> | undefined,
    raw.measurements,
    raw.dimensions,
    raw.abmessungen,
    raw.packageDimensions,
  ];
  for (const container of containers) {
    if (!container || typeof container !== "object") continue;
    const obj = container as Record<string, unknown>;
    for (const k of keys) {
      const v = coerceNumeric(obj[k]);
      if (v != null) return v;
    }
  }
  return null;
}

/**
 * Xentral liefert Längen häufig in mm und Gewicht in g, aber nicht immer.
 * Heuristik: bei Länge > 500 nehmen wir mm an (teilen durch 10),
 * bei Gewicht > 50 nehmen wir g an (teilen durch 1000).
 */
function normalizeLengthCm(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  if (value > 500) return +(value / 10).toFixed(2); // mm → cm
  return +value.toFixed(2);
}
function normalizeWeightKg(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  if (value > 50) return +(value / 1000).toFixed(3); // g → kg
  return +value.toFixed(3);
}

function extractBrandFromArticle(
  a: Record<string, unknown>,
  raw: Record<string, unknown>
): string | null {
  const keys = ["brand", "marke", "hersteller", "manufacturer", "Marke", "Hersteller"];
  for (const k of keys) {
    const v = a[k] ?? raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractCategoryFromArticle(
  a: Record<string, unknown>,
  raw: Record<string, unknown>
): string | null {
  const keys = ["kategorie", "category", "warengruppe", "Kategorie", "productCategory", "categoryPath"];
  for (const k of keys) {
    const v = a[k] ?? raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractDimensionsFromArticle(
  a: Record<string, unknown>,
  raw: Record<string, unknown>
): { dimL: number | null; dimW: number | null; dimH: number | null; weight: number | null } {
  const dimLRaw = pickNumericValue(a, raw, [
    "laenge", "länge", "length", "Länge", "lengthMm", "lengthCm",
    "tiefe", "depth", "Tiefe", "long",
  ]);
  const dimWRaw = pickNumericValue(a, raw, [
    "breite", "width", "Breite", "widthMm", "widthCm",
  ]);
  const dimHRaw = pickNumericValue(a, raw, [
    "hoehe", "höhe", "height", "Höhe", "heightMm", "heightCm",
  ]);
  const weightRaw = pickNumericValue(a, raw, [
    "gewicht", "weight", "Gewicht", "weightKg", "weightG",
    "bruttogewicht", "grossWeight", "nettogewicht", "netWeight",
    "massGrams", "massKg", "mass",
  ]);
  return {
    dimL: normalizeLengthCm(dimLRaw),
    dimW: normalizeLengthCm(dimWRaw),
    dimH: normalizeLengthCm(dimHRaw),
    weight: normalizeWeightKg(weightRaw),
  };
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
    const brand = extractBrandFromArticle(a, raw);
    const category = extractCategoryFromArticle(a, raw);
    const dims = extractDimensionsFromArticle(a, raw);

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
      brand,
      category,
      dimL: dims.dimL,
      dimW: dims.dimW,
      dimH: dims.dimH,
      weight: dims.weight,
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
      xentralProductId: r.xentralProductId,
      totalSold,
      soldByProject,
      ean: r.ean,
      brand: r.brand,
      dimL: r.dimL,
      dimW: r.dimW,
      dimH: r.dimH,
      weight: r.weight,
      category: r.category,
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

  // Xentral v1 limitiert page[size] auf 10..150 — bei 200 meldet der Server 400.
  const clampedPageSize = Math.max(10, Math.min(150, pageSize));

  async function fetchPage(page: number) {
    const url = new URL(joinUrl(baseUrl, "api/v1/products"));
    url.searchParams.set("page[number]", String(page));
    url.searchParams.set("page[size]", String(clampedPageSize));
    if (query) {
      // Xentral v1 erlaubt je nach Filter-Key nur bestimmte Operatoren.
      // `search` akzeptiert kein `equals` (gibt "Operator equals is not supported in filter key of type search").
      // Wir nutzen deshalb `number` (Artikelnummer/SKU) + `equals` für exakte SKU-Suche.
      url.searchParams.set("filter[0][key]", "number");
      url.searchParams.set("filter[0][op]", "equals");
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
    const [agg, shopifyBySku] = await Promise.all([
      aggregateSkuSalesWithFileCache({
        baseUrl,
        token,
        projectById,
        fromYmd,
        toYmd,
      }),
      aggregateShopifySkuSales({ fromYmd, toYmd }).catch((e) => {
        console.error("[shopify-sku-split] aggregation failed:", e instanceof Error ? e.message : e);
        return new Map<string, number>();
      }),
    ]);
    const next = items.map((row) => {
      const hit = agg.bySku.get(row.sku.trim().toLowerCase());
      if (hit) {
        const sold = { ...hit.soldByProject };
        // Split "AstroPet.de" → "Shopify" + "AP Sonstige" using Shopify API data
        const apTotal = sold["AstroPet.de"] ?? 0;
        if (apTotal > 0) {
          const shopifyQty = shopifyBySku.get(row.sku.trim().toLowerCase()) ?? 0;
          const shopifyActual = Math.min(shopifyQty, apTotal);
          const apOther = apTotal - shopifyActual;
          delete sold["AstroPet.de"];
          if (shopifyActual > 0) sold["Shopify"] = shopifyActual;
          if (apOther > 0) sold["AP Sonstige"] = apOther;
        }
        return {
          ...row,
          soldByProject: sold,
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

/**
 * Detail-Fetch eines einzelnen Xentral-Produkts.
 * Die Liste `/api/v1/products` liefert oft nur Grunddaten; EAN + Dimensionen
 * leben im Detail-Payload unter `attributes.*` bzw. in verschachtelten
 * Ressourcen. Diese Funktion wird als Fallback aufgerufen wenn einzelne
 * Felder in der Liste fehlen.
 */
async function fetchXentralJson(
  baseUrl: string,
  token: string,
  path: string
): Promise<unknown> {
  const url = new URL(joinUrl(baseUrl, path));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const text = await res.text();
  try {
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (json && typeof json === "object") {
      const root = json as Record<string, unknown>;
      return root.data ?? root;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Iteriert Objekt oder Array; ruft den Extractor auf jedem Eintrag bis ein
 * nicht-leerer Wert gefunden wird. */
function firstNonEmpty<T>(
  input: unknown,
  extractor: (obj: Record<string, unknown>) => T,
  isEmpty: (v: T) => boolean
): T | null {
  const visit = (v: unknown): T | null => {
    if (!v) return null;
    if (Array.isArray(v)) {
      for (const item of v) {
        const out = visit(item);
        if (out != null && !isEmpty(out)) return out;
      }
      return null;
    }
    if (typeof v === "object") {
      const r = v as Record<string, unknown>;
      const out = extractor(r);
      if (!isEmpty(out)) return out;
    }
    return null;
  };
  return visit(input);
}

export async function fetchXentralProductDetail(args: {
  baseUrl: string;
  token: string;
  productId: string;
}): Promise<{
  ean: string | null;
  brand: string | null;
  dimL: number | null;
  dimW: number | null;
  dimH: number | null;
  weight: number | null;
  category: string | null;
}> {
  // Xentral v1 REST trennt Stammdaten zwischen mehreren Sub-Resources:
  //   /api/v1/products/{id}                      → Haupt-Attribute (Name, SKU, …)
  //   /api/v1/products/{id}/stocksettings        → Lager/Abmessungen (Länge, Breite, Höhe, Gewicht)
  //   /api/v1/products/{id}/manufacturerinformation → Hersteller-Tab (EAN, Marke, Hersteller)
  // Wir fetchen alle parallel; Fehler in einem Resource-Call bricht nicht das Ganze.
  const [main, stocksettings, manufacturer] = await Promise.all([
    fetchXentralJson(args.baseUrl, args.token, `api/v1/products/${encodeURIComponent(args.productId)}`),
    fetchXentralJson(
      args.baseUrl,
      args.token,
      `api/v1/products/${encodeURIComponent(args.productId)}/stocksettings`
    ),
    fetchXentralJson(
      args.baseUrl,
      args.token,
      `api/v1/products/${encodeURIComponent(args.productId)}/manufacturerinformation`
    ),
  ]);

  // EAN: zuerst Hersteller-Info (im Xentral-UI „Hersteller"-Tab), dann Main-Attribute.
  const isEmptyStr = (s: string | null) => !s || !s.trim();
  const ean =
    firstNonEmpty<string | null>(
      manufacturer,
      (o) => extractEanFromProductAttributes(extractAttributes(o), o),
      isEmptyStr
    ) ??
    firstNonEmpty<string | null>(
      main,
      (o) => extractEanFromProductAttributes(extractAttributes(o), o),
      isEmptyStr
    );
  const brand =
    firstNonEmpty<string | null>(
      manufacturer,
      (o) => extractBrandFromArticle(extractAttributes(o), o),
      isEmptyStr
    ) ??
    firstNonEmpty<string | null>(main, (o) => extractBrandFromArticle(extractAttributes(o), o), isEmptyStr);
  const category = firstNonEmpty<string | null>(
    main,
    (o) => extractCategoryFromArticle(extractAttributes(o), o),
    isEmptyStr
  );
  // Dimensionen: zuerst aus stocksettings-Sub-Resource (Xentral „Lager/Abmessungen"-Tab),
  // dann Main-Attribute. Iteriert über alle Array-Einträge.
  type Dims = { dimL: number | null; dimW: number | null; dimH: number | null; weight: number | null };
  const isEmptyDims = (d: Dims) =>
    d.dimL == null && d.dimW == null && d.dimH == null && d.weight == null;
  const extractDims = (o: Record<string, unknown>): Dims =>
    extractDimensionsFromArticle(extractAttributes(o), o);
  const dims =
    firstNonEmpty<Dims>(stocksettings, extractDims, isEmptyDims) ??
    firstNonEmpty<Dims>(main, extractDims, isEmptyDims) ??
    ({ dimL: null, dimW: null, dimH: null, weight: null } as Dims);
  return {
    ean,
    brand,
    dimL: dims.dimL,
    dimW: dims.dimW,
    dimH: dims.dimH,
    weight: dims.weight,
    category,
  };
}

