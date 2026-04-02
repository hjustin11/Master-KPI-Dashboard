import { NextResponse } from "next/server";
import { getShopifyIntegrationConfig, shopifyMissingKeysForConfig } from "@/shared/lib/shopifyApiClient";

/** Vercel: viele Produktseiten brauchen länger als 10s (Hobby-Default). */
export const maxDuration = 60;
import { fetchShopifyProductRows } from "@/shared/lib/shopifyProductsList";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

/** Pfad ohne Query (Orders-Pfad darf z. B. `.../orders.json?foo` sein). */
function shopifyAdminPathnameOnly(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).pathname;
    } catch {
      return t.split("?")[0] ?? "";
    }
  }
  return t.split("?")[0] ?? "";
}

async function resolveShopifyProductsPath(): Promise<string> {
  const fromSecret = (await getIntegrationSecretValue("SHOPIFY_PRODUCTS_PATH")).trim();
  if (fromSecret) {
    const t = fromSecret.trim();
    if (/^https?:\/\//i.test(t)) {
      try {
        const u = new URL(t);
        const pq = `${u.pathname}${u.search}`;
        return pq.startsWith("/") ? pq : `/${pq}`;
      } catch {
        /* relative fallback */
      }
    }
    return fromSecret.startsWith("/") ? fromSecret : `/${fromSecret}`;
  }
  const ordersDefault = "/admin/api/2024-10/orders.json";
  const ordersRaw =
    (await getIntegrationSecretValue("SHOPIFY_ORDERS_PATH")).trim() || ordersDefault;
  const ordersPath = shopifyAdminPathnameOnly(ordersRaw) || ordersDefault;
  if (/\/orders\.json$/i.test(ordersPath)) {
    return ordersPath.replace(/\/orders\.json$/i, "/products.json");
  }
  return "/admin/api/2024-10/products.json";
}

export async function GET() {
  try {
    const config = await getShopifyIntegrationConfig();
    const missing = shopifyMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Shopify API ist nicht vollständig konfiguriert.",
          missingKeys: missing.map((m) => m.key),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }
    const productsPath = await resolveShopifyProductsPath();
    const items = await fetchShopifyProductRows(config, productsPath);
    return NextResponse.json({ items } satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, items: [] } satisfies MarketplaceProductsListResponse, {
      status: 502,
    });
  }
}
