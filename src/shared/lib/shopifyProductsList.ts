import {
  flexGetWith429Retry,
  type FlexIntegrationConfig,
} from "@/shared/lib/flexMarketplaceApiClient";
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
  const rawStock =
    first?.inventory_quantity ??
    first?.inventoryQuantity ??
    first?.old_inventory_quantity ??
    first?.oldInventoryQuantity ??
    first?.available ??
    first?.availableForSale;
  let priceEur: number | null = null;
  if (typeof rawPrice === "string") {
    const n = Number(rawPrice);
    if (Number.isFinite(n) && n > 0) priceEur = Number(n.toFixed(2));
  } else if (typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0) {
    priceEur = Number(rawPrice.toFixed(2));
  }
  let stockQty: number | null = null;
  if (typeof rawStock === "number" && Number.isFinite(rawStock)) {
    stockQty = rawStock;
  } else if (typeof rawStock === "string" && Number.isFinite(Number(rawStock))) {
    stockQty = Number(rawStock);
  }
  return {
    sku: sku || `—`,
    secondaryId: id || "—",
    title: title || "—",
    statusLabel: status || "—",
    isActive,
    priceEur,
    stockQty,
  };
}

const MAX_PAGES = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shopifyProductsErrorMessage(rec: Record<string, unknown>): string | null {
  const err = rec.errors;
  if (err == null) return null;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (typeof err === "object") {
    try {
      const s = JSON.stringify(err);
      if (s !== "{}" && s !== "[]") return s;
    } catch {
      return String(err);
    }
  }
  return null;
}

export async function fetchShopifyProductRows(
  config: FlexIntegrationConfig,
  productsPath: string
): Promise<MarketplaceProductListRow[]> {
  const pathBase = productsPath.startsWith("/") ? productsPath : `/${productsPath}`;
  const sep = pathBase.includes("?") ? "&" : "?";
  let nextPath: string | null = `${pathBase}${sep}limit=250`;
  const out: MarketplaceProductListRow[] = [];
  const delayMs = Math.max(0, config.paginationDelayMs || 0);

  for (let page = 0; page < MAX_PAGES && nextPath; page += 1) {
    if (page > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    const { res, text } = await flexGetWith429Retry(config, nextPath);
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
    const apiErr = shopifyProductsErrorMessage(rec);
    if (apiErr && products.length === 0) {
      throw new Error(`Shopify products: ${apiErr}`);
    }
    for (const p of products) {
      out.push(mapShopifyProduct(p as Record<string, unknown>));
    }
    nextPath = parseShopifyNextPath(res.headers.get("Link"), config.baseUrl);
  }

  return out;
}
