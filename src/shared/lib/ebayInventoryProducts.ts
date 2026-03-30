import { flexGet } from "@/shared/lib/flexMarketplaceApiClient";
import type { FlexIntegrationConfig } from "@/shared/lib/flexMarketplaceApiClient";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

function inventoryPriceEur(item: Record<string, unknown>): number | null {
  const pkg = item.packageWeightAndSize as Record<string, unknown> | undefined;
  const pricing =
    (item.pricingSummary as Record<string, unknown> | undefined) ??
    (item.pricing as Record<string, unknown> | undefined);
  const raw =
    pricing?.price ??
    (pricing?.auctionStartPrice as Record<string, unknown> | undefined)?.value ??
    item.price;
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Number(raw.toFixed(2));
  if (typeof raw === "object" && raw !== null) {
    const v = (raw as Record<string, unknown>).value;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return Number(n.toFixed(2));
    }
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Number(v.toFixed(2));
  }
  return null;
}

function mapInventoryItem(item: Record<string, unknown>): MarketplaceProductListRow {
  const sku = String(item.sku ?? "").trim();
  const product = (item.product as Record<string, unknown>) || {};
  const title = String(product.title ?? "").trim();
  const availability = String(item.availability ?? "").trim();
  const isActive = availability ? !/out_of_stock|deleted/i.test(availability) : true;
  return {
    sku: sku || "—",
    secondaryId: sku || "—",
    title: title || "—",
    statusLabel: availability || "—",
    isActive,
    priceEur: inventoryPriceEur(item),
  };
}

const LIMIT = 100;
const MAX_PAGES = 25;

export async function fetchEbayInventoryProductPage(
  config: FlexIntegrationConfig,
  listPath: string,
  limit: number,
  offset: number
): Promise<{ items: MarketplaceProductListRow[]; totalCount: number }> {
  const base = listPath.startsWith("/") ? listPath : `/${listPath}`;
  const sep = base.includes("?") ? "&" : "?";
  const path = `${base}${sep}limit=${limit}&offset=${offset}`;
  const res = await flexGet(config, path);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 280);
    throw new Error(`eBay inventory (HTTP ${res.status}). ${preview}`);
  }
  if (!json || typeof json !== "object") {
    return { items: [], totalCount: 0 };
  }
  const rec = json as Record<string, unknown>;
  const items = Array.isArray(rec.inventoryItems)
    ? rec.inventoryItems
    : Array.isArray(rec.items)
      ? rec.items
      : [];
  const rows = items.map((it) => mapInventoryItem(it as Record<string, unknown>));
  const total = typeof rec.total === "number" ? rec.total : Number(rec.total ?? rows.length);
  const totalCount = Number.isFinite(total) ? total : rows.length;
  return { items: rows, totalCount };
}

export async function fetchEbayInventoryProductRows(
  config: FlexIntegrationConfig,
  listPath: string
): Promise<MarketplaceProductListRow[]> {
  const out: MarketplaceProductListRow[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { items, totalCount } = await fetchEbayInventoryProductPage(config, listPath, LIMIT, offset);
    out.push(...items);
    offset += items.length;
    if (items.length === 0 || offset >= totalCount || items.length < LIMIT) break;
  }

  return out;
}
