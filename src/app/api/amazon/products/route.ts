import { NextResponse } from "next/server";
import { amazonSpApiIncompleteJson } from "@/shared/lib/amazonSpApiConfigError";
import { readIntegrationCache } from "@/shared/lib/integrationDataCache";
import {
  filterRowsByStatus,
  getLwaAccessToken,
  loadAmazonSpApiProductsConfig,
  paginateRows,
  parsePaginationParam,
  resolveEffectiveAmazonSellerId,
  syncAmazonProductsToIntegrationCache,
  type AmazonProductsCachedPayload,
} from "@/shared/lib/amazonProductsSpApiCatalog";

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
    const forceRefresh = searchParams.get("refresh") === "1";
    const limit = parsePaginationParam(searchParams.get("limit"), 50, 1, 250);
    const offset = parsePaginationParam(searchParams.get("offset"), 0, 0, 200_000);
    const marketplaceId = config.marketplaceIds[0];
    const cacheKey = `amazon:products:${marketplaceId}`;

    const lwaAccessToken = await getLwaAccessToken({
      refreshToken: config.refreshToken,
      lwaClientId: config.lwaClientId,
      lwaClientSecret: config.lwaClientSecret,
    });

    const effectiveSellerId = await resolveEffectiveAmazonSellerId(config, lwaAccessToken);
    if (!effectiveSellerId) {
      return NextResponse.json(
        { error: "Seller-ID konnte nicht ermittelt werden. Bitte AMAZON_SP_API_SELLER_ID prüfen." },
        { status: 500 }
      );
    }

    if (!forceRefresh) {
      const cached = await readIntegrationCache<AmazonProductsCachedPayload>(cacheKey);
      if (cached.state !== "miss") {
        const filtered = filterRowsByStatus(cached.value.rows, statusFilter);
        return NextResponse.json({
          status: statusFilter,
          sellerId: cached.value.sellerId || effectiveSellerId,
          source: `cache-${cached.state}`,
          totalCount: filtered.length,
          items: allRows ? filtered : paginateRows(filtered, offset, limit),
        });
      }
    }

    const syncResult = await syncAmazonProductsToIntegrationCache({
      config,
      lwaAccessToken,
      effectiveSellerId,
      marketplaceId,
      cacheKey,
    });

    if (syncResult.outcome === "pending") {
      const cached = await readIntegrationCache<AmazonProductsCachedPayload>(cacheKey);
      if (cached.state !== "miss") {
        const filtered = filterRowsByStatus(cached.value.rows, statusFilter);
        return NextResponse.json({
          status: statusFilter,
          sellerId: cached.value.sellerId,
          source: `${syncResult.source}:cache-${cached.state}`,
          totalCount: filtered.length,
          items: allRows ? filtered : paginateRows(filtered, offset, limit),
        });
      }
      return NextResponse.json(
        {
          pending: true,
          error: "Produktreport wird noch erstellt. Bitte in wenigen Sekunden erneut laden.",
          source: syncResult.source,
        },
        { status: 202 }
      );
    }

    if (syncResult.outcome === "error") {
      return NextResponse.json(syncResult.body, { status: syncResult.status });
    }

    const filtered = filterRowsByStatus(syncResult.rows, statusFilter);
    return NextResponse.json({
      status: statusFilter,
      sellerId: syncResult.sellerId,
      totalCount: filtered.length,
      items: allRows ? filtered : paginateRows(filtered, offset, limit),
      ...(syncResult.source ? { source: syncResult.source } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
