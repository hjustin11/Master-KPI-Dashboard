import { NextResponse } from "next/server";
import { amazonSpApiIncompleteJson } from "@/shared/lib/amazonSpApiConfigError";
import { readIntegrationCache } from "@/shared/lib/integrationDataCache";
import { dedupeMarketplaceRowsBySkuAndSecondary } from "@/shared/lib/marketplaceProductClientMerge";
import {
  filterRowsByStatus,
  loadAmazonSpApiProductsConfig,
  paginateRows,
  parsePaginationParam,
  type AmazonProductsCachedPayload,
} from "@/shared/lib/amazonProductsSpApiCatalog";
import {
  getAmazonMarketplaceBySlug,
  getDefaultAmazonMarketplaceId,
} from "@/shared/config/amazonMarketplaces";

/** Vercel/Serverless: Listings können viele Seiten haben — genug Budget für Pagination + Reports. */
export const maxDuration = 120;

export { primeAmazonProductsIntegrationCache } from "@/shared/lib/amazonProductsSpApiCatalog";

export async function GET(request: Request) {
  try {
    const config = await loadAmazonSpApiProductsConfig();
    const missing = {
      AMAZON_SP_API_REFRESH_TOKEN: !config.refreshToken,
      AMAZON_SP_API_CLIENT_ID: !config.lwaClientId,
      AMAZON_SP_API_CLIENT_SECRET: !config.lwaClientSecret,
      AMAZON_AWS_ACCESS_KEY_ID: !config.awsAccessKeyId,
      AMAZON_AWS_SECRET_ACCESS_KEY: !config.awsSecretAccessKey,
      AMAZON_SP_API_MARKETPLACE_ID: config.marketplaceIds.length === 0,
      AMAZON_SP_API_SELLER_ID: false,
    };
    if (Object.values(missing).some(Boolean)) {
      return amazonSpApiIncompleteJson(missing);
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = (searchParams.get("status") ?? "active").toLowerCase();
    const allRows = searchParams.get("all") === "1";
    const limit = parsePaginationParam(searchParams.get("limit"), 50, 1, 250);
    const offset = parsePaginationParam(searchParams.get("offset"), 0, 0, 200_000);

    // Multi-Country: `?amazonSlug=amazon-fr` überschreibt den Default-Marketplace.
    const amazonSlugParam = (searchParams.get("amazonSlug") ?? "").trim();
    let marketplaceId: string;
    if (amazonSlugParam) {
      const resolved = getAmazonMarketplaceBySlug(amazonSlugParam);
      if (!resolved) {
        return NextResponse.json(
          { error: `Unbekannter Amazon-Slug: ${amazonSlugParam}` },
          { status: 400 }
        );
      }
      marketplaceId = resolved.marketplaceId;
    } else {
      marketplaceId = getDefaultAmazonMarketplaceId(config.marketplaceIds);
    }
    const cacheKey = `amazon:products:${marketplaceId}`;

    const cached = await readIntegrationCache<AmazonProductsCachedPayload>(cacheKey);
    if (cached.state !== "miss") {
      const filtered = filterRowsByStatus(cached.value.rows, statusFilter);
      const deduped = dedupeMarketplaceRowsBySkuAndSecondary(filtered);
      return NextResponse.json({
        status: statusFilter,
        sellerId: cached.value.sellerId || config.sellerId.trim(),
        source: `cache-${cached.state}`,
        totalCount: deduped.length,
        items: allRows ? deduped : paginateRows(deduped, offset, limit),
      });
    }

    return NextResponse.json({
      status: statusFilter,
      sellerId: config.sellerId.trim(),
      source: "cache-miss",
      totalCount: 0,
      items: [],
      cacheState: "miss",
      error:
        "Keine gecachten Amazon-Produktdaten. Synchronisation läuft z. B. alle 15 Minuten oder über „Aktualisieren“.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
