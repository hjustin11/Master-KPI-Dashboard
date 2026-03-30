import { NextResponse } from "next/server";
import { getKauflandIntegrationConfig } from "@/shared/lib/kauflandApiClient";
import { fetchKauflandProductPage, fetchKauflandProductRows } from "@/shared/lib/kauflandProductsList";
import {
  parseProductListPagination,
  type MarketplaceProductsListResponse,
} from "@/shared/lib/marketplaceProductList";

export async function GET(request: Request) {
  try {
    const config = await getKauflandIntegrationConfig();
    const missing = {
      KAUFLAND_CLIENT_KEY: !config.clientKey,
      KAUFLAND_SECRET_KEY: !config.secretKey,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Kaufland API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing)
            .filter(([, v]) => v)
            .map(([k]) => k),
        } satisfies MarketplaceProductsListResponse,
        { status: 500 }
      );
    }
    const page = parseProductListPagination(request);
    if (page) {
      const { items, totalCount } = await fetchKauflandProductPage(config, page.limit, page.offset);
      return NextResponse.json({ items, totalCount } satisfies MarketplaceProductsListResponse);
    }
    const items = await fetchKauflandProductRows(config);
    return NextResponse.json({ items, totalCount: items.length } satisfies MarketplaceProductsListResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, items: [] } satisfies MarketplaceProductsListResponse, {
      status: 502,
    });
  }
}
