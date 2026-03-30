import { NextResponse } from "next/server";
import { getZooplusIntegrationConfig, zooplusMissingKeysForConfig } from "@/shared/lib/zooplusApiClient";
import { fetchMiraklProductRowsFlex } from "@/shared/lib/miraklProductOffers";
import type { MarketplaceProductsListResponse } from "@/shared/lib/marketplaceProductList";

export async function GET() {
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
    const items = await fetchMiraklProductRowsFlex(config);
    return NextResponse.json({ items } satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, items: [] } satisfies MarketplaceProductsListResponse, {
      status: 502,
    });
  }
}
