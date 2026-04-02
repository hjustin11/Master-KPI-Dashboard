import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { defaultArticleForecastFromToYmd } from "@/shared/lib/xentralArticleForecastProject";
import { buildXentralArticlesCacheKey } from "@/shared/lib/xentralArticlesCache";
import { computeXentralArticlesPayload } from "@/shared/lib/xentralArticlesCompute";
import {
  buildXentralOrdersCacheKey,
  computeXentralOrdersPayload,
  xentralOrdersCacheFreshMs,
  xentralOrdersCacheStaleMs,
} from "@/shared/lib/xentralOrdersPayload";

export type XentralWarmResult = {
  orders?: { ok: boolean; durationMs: number; error?: string; recentDays: number };
  articles?: { ok: boolean; durationMs: number; error?: string };
  skipped?: string;
};

/**
 * Füllt `integration_data_cache` für Xentral-Aufträge (90 Tage) und Artikel (alle + 90-Tage-Verkäufe).
 */
export async function primeXentralIntegrationCaches(): Promise<XentralWarmResult> {
  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) || (await getIntegrationSecretValue("XENTRAL_KEY"));
  if (!baseUrl?.trim() || !token?.trim()) {
    return { skipped: "missing_xentral_credentials" };
  }

  const recentDays = 90;
  const ordersStarted = Date.now();
  let orders: XentralWarmResult["orders"];
  try {
    const ordersUrl = new URL("http://internal/xentral/orders");
    ordersUrl.searchParams.set("recentDays", String(recentDays));
    ordersUrl.searchParams.set("limit", "50");
    const ordersReq = new Request(ordersUrl);
    await getIntegrationCachedOrLoad({
      cacheKey: buildXentralOrdersCacheKey(ordersUrl.searchParams),
      source: "xentral:orders",
      freshMs: xentralOrdersCacheFreshMs(),
      staleMs: xentralOrdersCacheStaleMs(),
      loader: () => computeXentralOrdersPayload(ordersReq, baseUrl, token),
    });
    orders = { ok: true, durationMs: Date.now() - ordersStarted, recentDays };
  } catch (e) {
    orders = {
      ok: false,
      durationMs: Date.now() - ordersStarted,
      recentDays,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const articlesStarted = Date.now();
  let articles: XentralWarmResult["articles"];
  try {
    const { fromYmd, toYmd } = defaultArticleForecastFromToYmd();
    const computeArgs = {
      baseUrl,
      token,
      query: "",
      fetchAll: true,
      includePrices: true,
      includeSales: true,
      pageSize: 150,
      pageNumber: 1,
      salesFromYmd: fromYmd,
      salesToYmd: toYmd,
    };
    await getIntegrationCachedOrLoad({
      cacheKey: buildXentralArticlesCacheKey(computeArgs),
      source: "xentral:articles",
      freshMs: marketplaceIntegrationFreshMs(),
      staleMs: marketplaceIntegrationStaleMs(),
      loader: () => computeXentralArticlesPayload(computeArgs),
    });
    articles = { ok: true, durationMs: Date.now() - articlesStarted };
  } catch (e) {
    articles = {
      ok: false,
      durationMs: Date.now() - articlesStarted,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { orders, articles };
}
