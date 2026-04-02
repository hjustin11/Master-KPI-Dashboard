import { NextResponse } from "next/server";
import { getEbayIntegrationConfig, ebayMissingKeysForConfig } from "@/shared/lib/ebayApiClient";
import {
  fetchEbayInventoryProductPage,
  fetchEbayInventoryProductRows,
} from "@/shared/lib/ebayInventoryProducts";
import {
  loadMarketplaceProductListCached,
  parseProductListForceRefresh,
} from "@/shared/lib/marketplaceProductsListCache";
import {
  parseProductListPagination,
  type MarketplaceProductsListResponse,
} from "@/shared/lib/marketplaceProductList";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const config = await getEbayIntegrationConfig();
    const missing = ebayMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "eBay API ist nicht vollständig konfiguriert.",
          missingKeys: missing.map((m) => m.key),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }
    const listPath =
      env("EBAY_PRODUCTS_PATH") || "/sell/inventory/v1/inventory_item";
    const forceRefresh = parseProductListForceRefresh(request);
    const page = parseProductListPagination(request);
    if (page) {
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "ebay",
        variant: "page",
        fingerprintParts: [listPath, String(page.limit), String(page.offset)],
        forceRefresh,
        loader: () =>
          fetchEbayInventoryProductPage(config, listPath, page.limit, page.offset),
      });
      return NextResponse.json(payload satisfies MarketplaceProductsListResponse);
    }
    const payload = await loadMarketplaceProductListCached({
      marketplaceSlug: "ebay",
      variant: "full",
      fingerprintParts: [listPath],
      forceRefresh,
      loader: async () => {
        const items = await fetchEbayInventoryProductRows(config, listPath);
        return { items, totalCount: items.length };
      },
    });
    return NextResponse.json(payload satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json(
      {
        error: message,
        items: [],
        hint:
          "Inventory API benötigt oft einen User-Access-Token mit passenden Scopes. App-Token reichen ggf. nicht aus.",
      } satisfies MarketplaceProductsListResponse,
      { status: 502 }
    );
  }
}
