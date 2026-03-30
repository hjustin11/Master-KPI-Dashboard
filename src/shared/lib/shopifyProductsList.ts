import { flexGet } from "@/shared/lib/flexMarketplaceApiClient";
import type { FlexIntegrationConfig } from "@/shared/lib/flexMarketplaceApiClient";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

function parseShopifyNextPath(linkHeader: string | null, baseUrlRaw: string): string | null {
  if (!linkHeader?.trim()) return null;
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrlRaw.replace(/\/+$/, "")).origin;
  } catch {
    return null;
  }
  for (const segment of linkHeader.split(",")) {
    const m = segment.trim().match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (!m?.[1]) continue;
    try {
      const u = new URL(m[1].trim());
      if (u.origin !== baseOrigin) continue;
      return u.pathname + u.search;
    } catch {
      continue;
    }
  }
  return null;
}

function mapShopifyProduct(p: Record<string, unknown>): MarketplaceProductListRow {
  const id = String(p.id ?? "");
  const title = String(p.title ?? "").trim();
  const status = String(p.status ?? "").trim().toLowerCase();
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const first = variants[0] as Record<string, unknown> | undefined;
  const sku = String(first?.sku ?? "").trim();
  const isActive = status === "active";
  const rawPrice = first?.price;
  let priceEur: number | null = null;
  if (typeof rawPrice === "string") {
    const n = Number(rawPrice);
    if (Number.isFinite(n) && n > 0) priceEur = Number(n.toFixed(2));
  } else if (typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0) {
    priceEur = Number(rawPrice.toFixed(2));
  }
  return {
    sku: sku || `—`,
    secondaryId: id || "—",
    title: title || "—",
    statusLabel: status || "—",
    isActive,
    priceEur,
  };
}

const MAX_PAGES = 40;

export async function fetchShopifyProductRows(
  config: FlexIntegrationConfig,
  productsPath: string
): Promise<MarketplaceProductListRow[]> {
  const pathBase = productsPath.startsWith("/") ? productsPath : `/${productsPath}`;
  const sep = pathBase.includes("?") ? "&" : "?";
  let nextPath: string | null = `${pathBase}${sep}limit=250`;
  const out: MarketplaceProductListRow[] = [];

  for (let page = 0; page < MAX_PAGES && nextPath; page += 1) {
    const res = await flexGet(config, nextPath);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json || typeof json !== "object") {
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 280);
      throw new Error(`Shopify products (HTTP ${res.status}). ${preview}`);
    }
    const rec = json as Record<string, unknown>;
    const products = Array.isArray(rec.products) ? rec.products : [];
    for (const p of products) {
      out.push(mapShopifyProduct(p as Record<string, unknown>));
    }
    nextPath = parseShopifyNextPath(res.headers.get("Link"), config.baseUrl);
  }

  return out;
}
