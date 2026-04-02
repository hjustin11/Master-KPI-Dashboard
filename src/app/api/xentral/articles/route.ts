import { NextResponse } from "next/server";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";
import {
  defaultArticleForecastFromToYmd,
  parseForecastYmdParam,
} from "@/shared/lib/xentralArticleForecastProject";
import {
  computeXentralArticlesPayload,
  XentralArticlesPayloadError,
} from "@/shared/lib/xentralArticlesCompute";
import { buildXentralArticlesCacheKey } from "@/shared/lib/xentralArticlesCache";

export const maxDuration = 300;

async function resolveXentralConfig() {
  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) || (await getIntegrationSecretValue("XENTRAL_KEY"));
  return { baseUrl, token };
}

export async function GET(request: Request) {
  const { baseUrl, token } = await resolveXentralConfig();

  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        error:
          "Xentral ist nicht konfiguriert. Bitte Env Vars setzen oder Supabase Tabelle 'integration_secrets' befüllen.",
        missing: {
          XENTRAL_BASE_URL: !baseUrl,
          XENTRAL_PAT_or_KEY: !token,
        },
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const fetchAll = searchParams.get("all") === "1";
  const includePrices = searchParams.get("includePrices") !== "0";
  const includeSales = searchParams.get("includeSales") !== "0";
  const rawLimit = Number(searchParams.get("limit") ?? "150") || 150;
  const pageSize = Math.min(Math.max(rawLimit, 10), 150);
  const pageNumber = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);
  let salesFromYmd = parseForecastYmdParam(searchParams.get("fromYmd"));
  let salesToYmd = parseForecastYmdParam(searchParams.get("toYmd"));

  if (fetchAll && !query && includeSales && (!salesFromYmd || !salesToYmd)) {
    const d = defaultArticleForecastFromToYmd();
    salesFromYmd = d.fromYmd;
    salesToYmd = d.toYmd;
  }

  const bypassCache =
    searchParams.get("refresh") === "1" || process.env.XENTRAL_ARTICLES_CACHE_DISABLE === "1";

  const computeArgs = {
    baseUrl,
    token,
    query,
    fetchAll,
    includePrices,
    includeSales,
    pageSize,
    pageNumber,
    salesFromYmd,
    salesToYmd,
  };

  const cacheKey = buildXentralArticlesCacheKey(computeArgs);
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();

  try {
    if (bypassCache) {
      const payload = await computeXentralArticlesPayload(computeArgs);
      return NextResponse.json(payload);
    }
    const payload = await getIntegrationCachedOrLoad({
      cacheKey,
      source: "xentral:articles",
      freshMs,
      staleMs,
      loader: () => computeXentralArticlesPayload(computeArgs),
    });
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof XentralArticlesPayloadError) {
      return NextResponse.json(e.body, { status: e.status });
    }
    throw e;
  }
}
