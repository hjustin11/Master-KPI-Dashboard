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

function pickNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapKauflandUnit(u: Record<string, unknown>): MarketplaceProductListRow {
  const idOffer = pickString(u.id_offer ?? u.idOffer);
  const idUnit = pickString(u.id_unit ?? u.idUnit);
  const idProduct = pickString(u.id_product ?? u.idProduct);
  const skuFromFields = pickString(u.sku ?? u.id_sku ?? u.supplier_sku);
  const sku = skuFromFields || idOffer || idUnit || "—";
  const secondaryId = idProduct || idOffer || idUnit || "—";
  const title =
    pickString(u.title) ||
    pickString((u.product as Record<string, unknown> | undefined)?.title) ||
    "—";
  const status = pickString(u.status ?? u.unit_status ?? "");
  const isActive = !/inactive|deleted|blocked|cancelled/i.test(status);
  const priceRaw = u.price ?? u.fixed_price;
  const priceNum = pickNumber(priceRaw);
  const priceEur = priceNum > 0 ? Number((priceNum / 100).toFixed(2)) : null;
  return {
    sku,
    secondaryId,
    title,
    statusLabel: status || "—",
    isActive,
    priceEur,
  };
}

const DEFAULT_PAGE = 100;
const MAX_PAGES = 40;

export async function fetchKauflandProductPage(
  config: KauflandIntegrationConfig,
  limit: number,
  offset: number
): Promise<{ items: MarketplaceProductListRow[]; totalCount: number }> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("storefront", config.storefront);
  const path = `/v2/units?${params.toString()}`;
  const res = await kauflandSignedFetch(config, path);
  const text = await res.text();
  let json: UnitsPayload | null = null;
  try {
    json = text ? (JSON.parse(text) as UnitsPayload) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 280);
    throw new Error(`Kaufland units (HTTP ${res.status}). ${preview}`);
  }
  const chunk = Array.isArray(json.data) ? json.data : [];
  const items = chunk.map((row) => mapKauflandUnit(row as Record<string, unknown>));
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
