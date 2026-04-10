import { NextResponse } from "next/server";
import { fetchMiraklProductRowsFressnapf } from "@/shared/lib/miraklProductOffers";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import {
  loadMarketplaceProductListCached,
} from "@/shared/lib/marketplaceProductsListCache";

export async function GET(request: Request) {
  try {
    const config = await getFressnapfIntegrationConfig();
    const missing = {
      FRESSNAPF_API_BASE_URL: !config.baseUrl,
      FRESSNAPF_API_KEY: !config.apiKey,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Fressnapf API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing)
            .filter(([, v]) => v)
            .map(([k]) => k),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }
    const payload = await loadMarketplaceProductListCached({
      marketplaceSlug: "fressnapf",
      variant: "full",
      fingerprintParts: [config.baseUrl, config.ordersPath],
      forceRefresh: false,
      loader: async () => {
        const items = await fetchMiraklProductRowsFressnapf(config);
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
