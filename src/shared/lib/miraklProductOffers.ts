import type { FlexIntegrationConfig } from "@/shared/lib/flexMarketplaceApiClient";
import { flexGet } from "@/shared/lib/flexMarketplaceApiClient";
import type { FressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import { fressnapfGet } from "@/shared/lib/fressnapfApiClient";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

const PAGE_SIZE = 100;
const MAX_PAGES = 40;

function offerPriceEur(o: Record<string, unknown>): number | null {
  const raw =
    o.price ??
    o.total_price ??
    o.shop_price ??
    (o.all_prices as Record<string, unknown> | undefined)?.price;
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Number(raw.toFixed(2));
  if (typeof raw === "object" && raw !== null) {
    const amt = (raw as Record<string, unknown>).amount;
    if (typeof amt === "number" && Number.isFinite(amt) && amt > 0) return Number(amt.toFixed(2));
  }
  return null;
}

function miraklOfferQuantity(o: Record<string, unknown>): number | null {
  const raw =
    o.quantity ??
    o.available_quantity ??
    o.availableQuantity ??
    o.offer_quantity ??
    o.offerQuantity ??
    o.quantity_max ??
    o.max_quantity;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim().replace(",", "."));
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function miraklExtras(o: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && !v.trim()) return;
    out[k] = v;
  };
  put("category_label", o.category_label ?? o.categoryLabel ?? o.category_code);
  put("leadtime_to_ship", o.leadtime_to_ship ?? o.leadtimeToShip);
  const minShip = o.min_shipping_price ?? o.minShippingPrice;
  if (minShip && typeof minShip === "object" && minShip !== null) {
    const m = minShip as Record<string, unknown>;
    const amt = m.amount;
    if (typeof amt === "number" && Number.isFinite(amt)) put("min_shipping_price_amount", amt);
    else if (typeof amt === "string" && Number.isFinite(Number(amt))) put("min_shipping_price_amount", Number(amt));
  }
  put("state", o.state ?? o.activity_status);
  const rawDesc = String(o.description ?? o.offer_description ?? "").trim();
  if (rawDesc) {
    out.description_excerpt = rawDesc.length > 220 ? `${rawDesc.slice(0, 217)}…` : rawDesc;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapMiraklOffer(o: Record<string, unknown>): MarketplaceProductListRow {
  const sku = String(o.shop_sku ?? o.shopSku ?? "").trim();
  const offerId = String(o.offer_id ?? o.id ?? "").trim();
  const product = (o.product as Record<string, unknown>) || {};
  const title = String(
    o.product_title ?? product.title ?? product.product_title ?? product.name ?? ""
  ).trim();
  const active =
    o.active === true ||
    String(o.state ?? "").toUpperCase() === "ACTIVE" ||
    String(o.activity_status ?? "").toUpperCase() === "ACTIVE";
  const stateLabel = String(o.state ?? o.activity_status ?? o.state_code ?? (active ? "ACTIVE" : "INACTIVE"));
  const skuOut = sku || offerId;
  const extras = miraklExtras(o);
  return {
    sku: skuOut || "—",
    secondaryId: offerId || skuOut || "—",
    title: title || "—",
    statusLabel: stateLabel,
    isActive: active,
    priceEur: offerPriceEur(o),
    stockQty: miraklOfferQuantity(o),
    ...(extras ? { extras } : {}),
  };
}

function extractOffers(json: unknown): unknown[] {
  if (!json || typeof json !== "object") return [];
  const rec = json as Record<string, unknown>;
  if (Array.isArray(rec.offers)) return rec.offers;
  if (Array.isArray(rec.data)) return rec.data;
  return [];
}

function totalCount(json: unknown): number {
  if (!json || typeof json !== "object") return 0;
  const rec = json as Record<string, unknown>;
  const t = rec.total_count ?? rec.totalCount;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

export async function fetchMiraklProductRowsFressnapf(
  config: FressnapfIntegrationConfig
): Promise<MarketplaceProductListRow[]> {
  const out: MarketplaceProductListRow[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path = `/api/offers?max=${PAGE_SIZE}&offset=${offset}`;
    const res = await fressnapfGet(config, path);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 280);
      throw new Error(`Mirakl Offers (HTTP ${res.status}). ${preview}`);
    }
    const rawOffers = extractOffers(json);
    for (const r of rawOffers) {
      out.push(mapMiraklOffer(r as Record<string, unknown>));
    }
    const chunkLen = rawOffers.length;
    const total = totalCount(json);
    offset += chunkLen;
    if (chunkLen === 0 || offset >= total || chunkLen < PAGE_SIZE) break;
  }
  return out;
}

export async function fetchMiraklProductRowsFlex(
  config: FlexIntegrationConfig
): Promise<MarketplaceProductListRow[]> {
  const out: MarketplaceProductListRow[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path = `/api/offers?max=${PAGE_SIZE}&offset=${offset}`;
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
      throw new Error(`Mirakl Offers (HTTP ${res.status}). ${preview}`);
    }
    const rawOffers = extractOffers(json);
    for (const r of rawOffers) {
      out.push(mapMiraklOffer(r as Record<string, unknown>));
    }
    const chunkLen = rawOffers.length;
    const total = totalCount(json);
    offset += chunkLen;
    if (chunkLen === 0 || offset >= total || chunkLen < PAGE_SIZE) break;
  }
  return out;
}
