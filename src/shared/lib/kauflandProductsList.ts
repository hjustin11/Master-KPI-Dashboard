import { kauflandSignedFetch } from "@/shared/lib/kauflandApiClient";
import type { KauflandIntegrationConfig } from "@/shared/lib/kauflandApiClient";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

type UnitsPayload = {
  data?: Array<Record<string, unknown>>;
  pagination?: { offset?: number; limit?: number; total?: number };
};

function pickString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** id_product / id_unit kommen in der API oft als Zahl. */
function pickId(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function pickNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractTitleFromUnit(u: Record<string, unknown>): string {
  const candidates: unknown[] = [
    u.title,
    u.product_title,
    u.productTitle,
    u.product_name,
    u.productName,
    u.name,
    u.article_name,
    u.articleName,
    u.listing_title,
    u.listingTitle,
  ];
  for (const c of candidates) {
    const s = pickString(c);
    if (s) return s;
  }
  const product = u.product;
  if (product && typeof product === "object" && !Array.isArray(product)) {
    const p = product as Record<string, unknown>;
    const nested: unknown[] = [p.title, p.name, p.product_name, p.productName];
    for (const n of nested) {
      const s = pickString(n);
      if (s) return s;
    }
  }
  const listing = u.listing;
  if (listing && typeof listing === "object" && !Array.isArray(listing)) {
    const l = listing as Record<string, unknown>;
    const s = pickString(l.title ?? l.name);
    if (s) return s;
  }
  return "";
}

function mapKauflandUnit(u: Record<string, unknown>): MarketplaceProductListRow {
  const idOffer = pickString(u.id_offer ?? u.idOffer);
  const idUnit = pickId(u.id_unit ?? u.idUnit);
  const idProduct = pickId(u.id_product ?? u.idProduct);
  const skuFromFields = pickString(u.sku ?? u.id_sku ?? u.supplier_sku);
  const sku = skuFromFields || idOffer || idUnit || "—";
  const secondaryId = idProduct || idOffer || idUnit || "—";
  const rawTitle = extractTitleFromUnit(u);
  const title = rawTitle || "—";
  const status = pickString(u.status ?? u.unit_status ?? "");
  const isActive = !/inactive|deleted|blocked|cancelled/i.test(status);
  const priceRaw = u.price ?? u.fixed_price;
  const priceNum = pickNumber(priceRaw);
  const priceEur = priceNum > 0 ? Number((priceNum / 100).toFixed(2)) : null;
  const stockRaw =
    u.amount ??
    u.quantity ??
    u.stock ??
    u.available_quantity ??
    u.availableQuantity;
  const stockNum = pickNumber(stockRaw);
  const extras: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && !v.trim()) return;
    extras[k] = v;
  };
  put("id_offer", u.id_offer ?? u.idOffer);
  put("id_unit", u.id_unit ?? u.idUnit);
  put("id_product", u.id_product ?? u.idProduct);
  put("unit_status", u.unit_status ?? u.unitStatus);
  put("listing_status", u.listing_status ?? u.listingStatus);
  put("fixed_price_raw", u.fixed_price ?? u.price);

  return {
    sku,
    secondaryId,
    title,
    statusLabel: status || "—",
    isActive,
    priceEur,
    stockQty: Number.isFinite(stockNum) ? stockNum : null,
    ...(Object.keys(extras).length > 0 ? { extras } : {}),
  };
}

const PRODUCT_TITLE_FETCH_CONCURRENCY = 8;

async function fetchKauflandProductTitle(
  config: KauflandIntegrationConfig,
  idProduct: string
): Promise<string> {
  if (!idProduct) return "";
  const path = `/v2/products/${encodeURIComponent(idProduct)}?storefront=${encodeURIComponent(config.storefront)}`;
  const res = await kauflandSignedFetch(config, path);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json || typeof json !== "object") return "";
  const root = json as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    const t = pickString(d.title);
    if (t) return t;
  }
  return pickString(root.title);
}

async function resolveKauflandProductTitles(
  config: KauflandIntegrationConfig,
  ids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += PRODUCT_TITLE_FETCH_CONCURRENCY) {
    const batch = unique.slice(i, i + PRODUCT_TITLE_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (id) => {
        const title = await fetchKauflandProductTitle(config, id);
        return { id, title } as const;
      })
    );
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      const { id, title } = s.value;
      if (title) out.set(id, title);
    }
  }
  return out;
}

/** Fehlende Artikelnamen: Units-Liste liefert oft keinen Titel — `GET /v2/products/{id}` nutzen. */
async function enrichMissingTitles(
  config: KauflandIntegrationConfig,
  rawRows: Array<Record<string, unknown>>,
  items: MarketplaceProductListRow[]
): Promise<MarketplaceProductListRow[]> {
  const needIds: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const row = items[i];
    const raw = rawRows[i];
    if (!row || !raw) continue;
    const missing = !row.title || row.title === "—";
    if (!missing) continue;
    const pid = pickId(raw.id_product ?? raw.idProduct);
    if (pid) needIds.push(pid);
  }
  if (needIds.length === 0) return items;
  const titles = await resolveKauflandProductTitles(config, needIds);
  return items.map((row, i) => {
    const raw = rawRows[i];
    const pid = raw ? pickId(raw.id_product ?? raw.idProduct) : "";
    const t = pid ? titles.get(pid) : undefined;
    if (t && (!row.title || row.title === "—")) {
      return { ...row, title: t };
    }
    return row;
  });
}

const DEFAULT_PAGE = 100;
const MAX_PAGES = 40;

async function fetchKauflandUnitsPagePayload(
  config: KauflandIntegrationConfig,
  limit: number,
  offset: number,
  useEmbeddedProduct: boolean
): Promise<{ res: Response; text: string; json: UnitsPayload | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("storefront", config.storefront);
  /** Einige Konten liefern eingebettete Produktdaten (Titel) — nicht alle API-Versionen unterstützen den Parameter. */
  if (useEmbeddedProduct) params.append("embedded", "product");
  const path = `/v2/units?${params.toString()}`;
  const res = await kauflandSignedFetch(config, path);
  const text = await res.text();
  let json: UnitsPayload | null = null;
  try {
    json = text ? (JSON.parse(text) as UnitsPayload) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

export async function fetchKauflandProductPage(
  config: KauflandIntegrationConfig,
  limit: number,
  offset: number
): Promise<{ items: MarketplaceProductListRow[]; totalCount: number }> {
  let { res, text, json } = await fetchKauflandUnitsPagePayload(config, limit, offset, true);
  if (!res.ok && res.status === 400) {
    ({ res, text, json } = await fetchKauflandUnitsPagePayload(config, limit, offset, false));
  }
  if (!res.ok || !json) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 280);
    throw new Error(`Kaufland units (HTTP ${res.status}). ${preview}`);
  }
  const chunk = Array.isArray(json.data) ? json.data : [];
  const rawRows = chunk.map((row) => row as Record<string, unknown>);
  let items = rawRows.map((row) => mapKauflandUnit(row));
  items = await enrichMissingTitles(config, rawRows, items);
  const totalCount = json.pagination?.total ?? items.length;
  return { items, totalCount };
}

/** Alle Seiten laden (z. B. Analytics / Preisabgleich). */
export async function fetchKauflandProductRows(
  config: KauflandIntegrationConfig
): Promise<MarketplaceProductListRow[]> {
  const out: MarketplaceProductListRow[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { items, totalCount } = await fetchKauflandProductPage(config, DEFAULT_PAGE, offset);
    out.push(...items);
    offset += items.length;
    if (items.length === 0 || offset >= totalCount || items.length < DEFAULT_PAGE) break;
  }
  return out;
}
