import { NextResponse } from "next/server";
import { getMmsIntegrationConfig, mmsMissingKeysForConfig } from "@/shared/lib/mmsApiClient";
import { fetchMiraklProductRowsFlex } from "@/shared/lib/miraklProductOffers";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";
import {
  loadMarketplaceProductListCached,
} from "@/shared/lib/marketplaceProductsListCache";

export async function GET(_request: Request) {
  try {
    const config = await getMmsIntegrationConfig();
    const missing = mmsMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "MediaMarkt & Saturn API ist nicht vollständig konfiguriert.",
          missingKeys: missing.map((m) => m.key),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }
    const payload = await loadMarketplaceProductListCached({
      marketplaceSlug: "mediamarkt-saturn",
      variant: "full",
      fingerprintParts: [config.baseUrl, config.ordersPath],
      forceRefresh: false,
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
