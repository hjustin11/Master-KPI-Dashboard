import { NextResponse } from "next/server";
import { MAX_ANALYTICS_RANGE_DAYS } from "@/shared/lib/analytics-date-range";
import { INTEGRATION_SECRETS_CONFIGURATION_HINT_DE } from "@/shared/lib/integrationSecrets";
import {
  fetchFressnapfOrdersRawPaginated,
  getFressnapfIntegrationConfig,
} from "@/shared/lib/fressnapfApiClient";
import {
  FLEX_MARKETPLACE_EBAY_SPEC,
  FLEX_MARKETPLACE_MMS_SPEC,
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
  FLEX_MARKETPLACE_TIKTOK_SPEC,
  FLEX_MARKETPLACE_ZOOPLUS_SPEC,
  fetchFlexOrdersRawPaginated,
  getFlexIntegrationConfig,
  parseYmdParam,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/flexMarketplaceApiClient";
import {
  centsToAmount,
  fetchKauflandOrderUnitsAllStatuses,
  filterOrderUnitsByCreatedRange,
  getKauflandIntegrationConfig,
} from "@/shared/lib/kauflandApiClient";
import {
  buildArticleSalesRows,
  extractLineFromKauflandUnit,
  extractLinesFromFlexRawOrder,
  extractLinesFromOttoOrder,
  getCreatedMsFromFlexRaw,
  getOttoOrderCreatedMs,
} from "@/shared/lib/marketplaceArticleLines";
import {
  ensureOttoProductsScope,
  fetchOttoOrdersRange,
  getOttoAccessToken,
  getOttoIntegrationConfig,
} from "@/shared/lib/ottoApiClient";

export const maxDuration = 120;

function addDaysUtcYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function isFlexSlug(slug: string): slug is "ebay" | "zooplus" | "mediamarkt-saturn" | "tiktok" | "shopify" {
  return slug === "ebay" || slug === "zooplus" || slug === "mediamarkt-saturn" || slug === "tiktok" || slug === "shopify";
}

function flexSpecForSlug(slug: string) {
  if (slug === "ebay") return FLEX_MARKETPLACE_EBAY_SPEC;
  if (slug === "zooplus") return FLEX_MARKETPLACE_ZOOPLUS_SPEC;
  if (slug === "mediamarkt-saturn") return FLEX_MARKETPLACE_MMS_SPEC;
  if (slug === "tiktok") return FLEX_MARKETPLACE_TIKTOK_SPEC;
  if (slug === "shopify") return FLEX_MARKETPLACE_SHOPIFY_SPEC;
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketplace = (searchParams.get("marketplace") ?? "").trim();
    const fromYmd = parseYmdParam(searchParams.get("from"));
    const toYmd = parseYmdParam(searchParams.get("to"));

    if (!fromYmd || !toYmd || fromYmd > toYmd) {
      return NextResponse.json(
        { error: "Parameter „from“ und „to“ (yyyy-mm-dd) sind erforderlich." },
        { status: 400 }
      );
    }

    const { startMs: currentStartMs, endMs: currentEndMs } = ymdToUtcRangeExclusiveEnd(fromYmd, toYmd);
    const spanMs = currentEndMs - currentStartMs;
    const spanDays = Math.round(spanMs / (24 * 60 * 60 * 1000));
    if (spanDays < 1 || spanDays > MAX_ANALYTICS_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Zeitraum muss 1–${String(MAX_ANALYTICS_RANGE_DAYS)} Tage umfassen.` },
        { status: 400 }
      );
    }

    const prevEndMs = currentStartMs;
    const prevStartMs = currentStartMs - spanMs;
    const previousFromYmd = addDaysUtcYmd(fromYmd, -spanDays);
    const previousToYmd = addDaysUtcYmd(fromYmd, -1);

    if (marketplace === "amazon") {
      return NextResponse.json({
        marketplace,
        from: fromYmd,
        to: toYmd,
        previousFrom: previousFromYmd,
        previousTo: previousToYmd,
        currency: "EUR",
        items: [] as unknown[],
        unsupported: true,
      });
    }

    if (isFlexSlug(marketplace)) {
      const spec = flexSpecForSlug(marketplace);
      if (!spec) {
        return NextResponse.json({ error: "Unbekannter Marktplatz." }, { status: 400 });
      }
      const config = await getFlexIntegrationConfig(spec);
      const fetchFrom = Math.min(prevStartMs, currentStartMs);
      const fetchToEx = Math.max(currentEndMs, prevEndMs);
      const raw = await fetchFlexOrdersRawPaginated(config, {
        createdFromMs: fetchFrom,
        createdToMsExclusive: fetchToEx,
        maxPages: 40,
      });
      const currentLines: ReturnType<typeof extractLinesFromFlexRawOrder> = [];
      const previousLines: ReturnType<typeof extractLinesFromFlexRawOrder> = [];
      for (const order of raw) {
        const t = getCreatedMsFromFlexRaw(order);
        if (t == null) continue;
        const lines = extractLinesFromFlexRawOrder(order, config.amountScale);
        if (lines.length === 0) continue;
        if (t >= currentStartMs && t < currentEndMs) {
          currentLines.push(...lines);
        } else if (t >= prevStartMs && t < prevEndMs) {
          previousLines.push(...lines);
        }
      }
      const { rows, currency } = buildArticleSalesRows({ currentLines, previousLines });
      return NextResponse.json({
        marketplace,
        from: fromYmd,
        to: toYmd,
        previousFrom: previousFromYmd,
        previousTo: previousToYmd,
        currency,
        items: rows,
      });
    }

    if (marketplace === "otto") {
      const cfg = await getOttoIntegrationConfig();
      if (!cfg.clientId || !cfg.clientSecret) {
        return NextResponse.json(
          {
            error: "Otto API nicht konfiguriert.",
            missingKeys: [
              ...(!cfg.clientId ? (["OTTO_API_CLIENT_ID"] as const) : []),
              ...(!cfg.clientSecret ? (["OTTO_API_CLIENT_SECRET"] as const) : []),
            ],
            hint: INTEGRATION_SECRETS_CONFIGURATION_HINT_DE,
            integrationSecretsLoadErrors: cfg.integrationSecretsLoadErrors,
          },
          { status: 500 }
        );
      }
      const scopes = ensureOttoProductsScope(cfg.scopes);
      const token = await getOttoAccessToken({ ...cfg, scopes });
      const orders = await fetchOttoOrdersRange({
        baseUrl: cfg.baseUrl,
        token,
        startMs: Math.min(prevStartMs, currentStartMs),
        endMs: Math.max(currentEndMs, prevEndMs),
      });
      const currentLines: ReturnType<typeof extractLinesFromOttoOrder> = [];
      const previousLines: ReturnType<typeof extractLinesFromOttoOrder> = [];
      for (const order of orders) {
        const t = getOttoOrderCreatedMs(order);
        if (t == null) continue;
        const lines = extractLinesFromOttoOrder(order);
        if (lines.length === 0) continue;
        if (t >= currentStartMs && t < currentEndMs) {
          currentLines.push(...lines);
        } else if (t >= prevStartMs && t < prevEndMs) {
          previousLines.push(...lines);
        }
      }
      const { rows, currency } = buildArticleSalesRows({ currentLines, previousLines });
      return NextResponse.json({
        marketplace,
        from: fromYmd,
        to: toYmd,
        previousFrom: previousFromYmd,
        previousTo: previousToYmd,
        currency,
        items: rows,
      });
    }

    if (marketplace === "kaufland") {
      const config = await getKauflandIntegrationConfig();
      if (!config.clientKey || !config.secretKey) {
        return NextResponse.json({ error: "Kaufland API nicht konfiguriert." }, { status: 500 });
      }
      const all = await fetchKauflandOrderUnitsAllStatuses({ config });
      const currentUnits = filterOrderUnitsByCreatedRange(all, currentStartMs, currentEndMs);
      const previousUnits = filterOrderUnitsByCreatedRange(all, prevStartMs, prevEndMs);
      const currentLines = currentUnits.map((u) => extractLineFromKauflandUnit(u as Record<string, unknown>, centsToAmount));
      const previousLines = previousUnits.map((u) => extractLineFromKauflandUnit(u as Record<string, unknown>, centsToAmount));
      const { rows, currency } = buildArticleSalesRows({ currentLines, previousLines });
      return NextResponse.json({
        marketplace,
        from: fromYmd,
        to: toYmd,
        previousFrom: previousFromYmd,
        previousTo: previousToYmd,
        currency,
        items: rows,
      });
    }

    if (marketplace === "fressnapf") {
      const config = await getFressnapfIntegrationConfig();
      if (!config.baseUrl || !config.apiKey) {
        return NextResponse.json({ error: "Fressnapf API nicht konfiguriert." }, { status: 500 });
      }
      const fetchFrom = Math.min(prevStartMs, currentStartMs);
      const fetchToEx = Math.max(currentEndMs, prevEndMs);
      const raw = await fetchFressnapfOrdersRawPaginated(config, {
        createdFromMs: fetchFrom,
        createdToMsExclusive: fetchToEx,
      });
      const currentLines: ReturnType<typeof extractLinesFromFlexRawOrder> = [];
      const previousLines: ReturnType<typeof extractLinesFromFlexRawOrder> = [];
      for (const order of raw) {
        const t = getCreatedMsFromFlexRaw(order);
        if (t == null) continue;
        const lines = extractLinesFromFlexRawOrder(order, config.amountScale);
        if (lines.length === 0) continue;
        if (t >= currentStartMs && t < currentEndMs) {
          currentLines.push(...lines);
        } else if (t >= prevStartMs && t < prevEndMs) {
          previousLines.push(...lines);
        }
      }
      const { rows, currency } = buildArticleSalesRows({ currentLines, previousLines });
      return NextResponse.json({
        marketplace,
        from: fromYmd,
        to: toYmd,
        previousFrom: previousFromYmd,
        previousTo: previousToYmd,
        currency,
        items: rows,
      });
    }

    return NextResponse.json({ error: "Unbekannter Marktplatz." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, items: [] }, { status: 502 });
  }
}
