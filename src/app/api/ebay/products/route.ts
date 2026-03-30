import { NextResponse } from "next/server";
import { getEbayIntegrationConfig, ebayMissingKeysForConfig } from "@/shared/lib/ebayApiClient";
import {
  fetchEbayInventoryProductPage,
  fetchEbayInventoryProductRows,
} from "@/shared/lib/ebayInventoryProducts";
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
    const page = parseProductListPagination(request);
    if (page) {
      const { items, totalCount } = await fetchEbayInventoryProductPage(
        config,
        listPath,
        page.limit,
        page.offset
      );
      return NextResponse.json({ items, totalCount } satisfies MarketplaceProductsListResponse);
    }
    const items = await fetchEbayInventoryProductRows(config, listPath);
    return NextResponse.json({ items, totalCount: items.length } satisfies MarketplaceProductsListResponse);
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
