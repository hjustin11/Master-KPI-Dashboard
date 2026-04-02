import { NextResponse } from "next/server";
import { getZooplusIntegrationConfig, zooplusMissingKeysForConfig } from "@/shared/lib/zooplusApiClient";
import { fetchMiraklProductRowsFlex } from "@/shared/lib/miraklProductOffers";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";
import {
  loadMarketplaceProductListCached,
  parseProductListForceRefresh,
} from "@/shared/lib/marketplaceProductsListCache";

export async function GET(request: Request) {
  try {
    const config = await getZooplusIntegrationConfig();
    const missing = zooplusMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "ZooPlus API ist nicht vollständig konfiguriert.",
          missingKeys: missing.map((m) => m.key),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }
    const forceRefresh = parseProductListForceRefresh(request);
    const payload = await loadMarketplaceProductListCached({
      marketplaceSlug: "zooplus",
      variant: "full",
      fingerprintParts: [config.baseUrl, config.ordersPath],
      forceRefresh,
      loader: async () => {
        const items = await fetchMiraklProductRowsFlex(config);
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
