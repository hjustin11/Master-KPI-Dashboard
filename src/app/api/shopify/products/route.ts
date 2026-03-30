import { NextResponse } from "next/server";
import { getShopifyIntegrationConfig, shopifyMissingKeysForConfig } from "@/shared/lib/shopifyApiClient";
import { fetchShopifyProductRows } from "@/shared/lib/shopifyProductsList";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function resolveShopifyProductsPath(): string {
  const fromEnv = env("SHOPIFY_PRODUCTS_PATH");
  if (fromEnv) return fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
  const orders = env("SHOPIFY_ORDERS_PATH") || "/admin/api/2024-10/orders.json";
  if (/\/orders\.json$/i.test(orders)) {
    return orders.replace(/\/orders\.json$/i, "/products.json");
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
    const productsPath = resolveShopifyProductsPath();
    const items = await fetchShopifyProductRows(config, productsPath);
    return NextResponse.json({ items } satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, items: [] } satisfies MarketplaceProductsListResponse, {
      status: 502,
    });
  }
}
