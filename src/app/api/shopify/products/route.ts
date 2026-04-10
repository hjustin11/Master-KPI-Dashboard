import { NextResponse } from "next/server";
import { getShopifyIntegrationConfig, shopifyMissingKeysForConfig } from "@/shared/lib/shopifyApiClient";
import { fetchShopifyProductRows } from "@/shared/lib/shopifyProductsList";
import { loadMarketplaceProductListCached } from "@/shared/lib/marketplaceProductsListCache";
import { resolveShopifyProductsPathForCache } from "@/shared/lib/shopifyProductsPathResolve";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

/** Vercel: viele Produktseiten brauchen länger als 10s (Hobby-Default). */
export const maxDuration = 60;

export async function GET(request: Request) {
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
    const productsPath = await resolveShopifyProductsPathForCache();
    const payload = await loadMarketplaceProductListCached({
      marketplaceSlug: "shopify",
      variant: "full",
      fingerprintParts: [config.baseUrl, productsPath],
      forceRefresh: false,
      loader: async () => {
        const items = await fetchShopifyProductRows(config, productsPath);
        return { items };
      },
    });
    return NextResponse.json(payload satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, items: [] } satisfies MarketplaceProductsListResponse, {
      status: 502,
    });
  }
}
