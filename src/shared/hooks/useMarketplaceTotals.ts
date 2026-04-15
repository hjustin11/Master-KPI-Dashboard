"use client";

import { useMemo } from "react";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { enumerateYmd } from "@/app/(dashboard)/analytics/marketplaces/MarketplaceRevenueChart";
import {
  MARKETPLACE_REVENUE_LINE_COLORS,
  type MarketplaceRevenueLineSeries,
} from "@/app/(dashboard)/analytics/marketplaces/MarketplaceTotalRevenueLinesChart";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import type { SalesCompareResponse } from "@/shared/lib/marketplace-sales-types";
import {
  buildMarketplaceTotals,
  kpiLabelsForPeriod,
  pickRevenueChartCurrency,
} from "@/shared/lib/marketplace-analytics-utils";

export type MarketplaceSlugKey =
  | "amazon"
  | "ebay"
  | "otto"
  | "kaufland"
  | "fressnapf"
  | "mms"
  | "zooplus"
  | "tiktok"
  | "shopify";

export type MarketplaceDataMap = Record<MarketplaceSlugKey, SalesCompareResponse | null>;
export type MarketplaceFlagMap = Record<MarketplaceSlugKey, boolean>;

const SLUG_TO_LINE_ID: Record<Exclude<MarketplaceSlugKey, "amazon">, keyof typeof MARKETPLACE_REVENUE_LINE_COLORS> = {
  ebay: "ebay",
  otto: "otto",
  kaufland: "kaufland",
  fressnapf: "fressnapf",
  mms: "mediamarkt-saturn",
  zooplus: "zooplus",
  tiktok: "tiktok",
  shopify: "shopify",
};

export default function useMarketplaceTotals(params: {
  data: MarketplaceDataMap;
  loading: MarketplaceFlagMap;
  backgroundSyncing: MarketplaceFlagMap;
  periodFrom: string;
  periodTo: string;
  forceUnblockTotalStrip: boolean;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const {
    data,
    loading,
    backgroundSyncing,
    periodFrom,
    periodTo,
    forceUnblockTotalStrip,
    dfLocale,
    t,
  } = params;

  const totals = useMemo(
    () =>
      buildMarketplaceTotals([
        { summary: data.amazon?.summary, previousSummary: data.amazon?.previousSummary, revenueDeltaPct: data.amazon?.revenueDeltaPct },
        { summary: data.ebay?.summary, previousSummary: data.ebay?.previousSummary, revenueDeltaPct: data.ebay?.revenueDeltaPct },
        { summary: data.otto?.summary, previousSummary: data.otto?.previousSummary, revenueDeltaPct: data.otto?.revenueDeltaPct },
        { summary: data.kaufland?.summary, previousSummary: data.kaufland?.previousSummary, revenueDeltaPct: data.kaufland?.revenueDeltaPct },
        { summary: data.fressnapf?.summary, previousSummary: data.fressnapf?.previousSummary, revenueDeltaPct: data.fressnapf?.revenueDeltaPct },
        { summary: data.mms?.summary, previousSummary: data.mms?.previousSummary, revenueDeltaPct: data.mms?.revenueDeltaPct },
        { summary: data.zooplus?.summary, previousSummary: data.zooplus?.previousSummary, revenueDeltaPct: data.zooplus?.revenueDeltaPct },
        { summary: data.tiktok?.summary, previousSummary: data.tiktok?.previousSummary, revenueDeltaPct: data.tiktok?.revenueDeltaPct },
        { summary: data.shopify?.summary, previousSummary: data.shopify?.previousSummary, revenueDeltaPct: data.shopify?.revenueDeltaPct },
      ]),
    [data]
  );

  const anySalesLoading = useMemo(
    () =>
      loading.amazon ||
      loading.ebay ||
      loading.otto ||
      loading.kaufland ||
      loading.fressnapf ||
      loading.mms ||
      loading.zooplus ||
      loading.tiktok ||
      loading.shopify,
    [loading]
  );

  const hasAnyMarketplaceSummary = useMemo(
    () =>
      !!(
        data.amazon?.summary ||
        data.ebay?.summary ||
        data.otto?.summary ||
        data.kaufland?.summary ||
        data.fressnapf?.summary ||
        data.mms?.summary ||
        data.zooplus?.summary ||
        data.tiktok?.summary ||
        data.shopify?.summary
      ),
    [data]
  );

  const totalStripBlocking = anySalesLoading && !hasAnyMarketplaceSummary && !forceUnblockTotalStrip;

  const stripBackgroundSyncing =
    backgroundSyncing.amazon ||
    backgroundSyncing.ebay ||
    backgroundSyncing.otto ||
    backgroundSyncing.kaufland ||
    backgroundSyncing.fressnapf ||
    backgroundSyncing.mms ||
    backgroundSyncing.zooplus ||
    backgroundSyncing.tiktok ||
    backgroundSyncing.shopify ||
    (anySalesLoading && hasAnyMarketplaceSummary);

  const revenueChartCurrency = useMemo(
    () =>
      pickRevenueChartCurrency(
        totals,
        data.amazon,
        data.ebay,
        data.otto,
        data.kaufland,
        data.fressnapf,
        data.mms,
        data.zooplus,
        data.tiktok,
        data.shopify
      ),
    [totals, data]
  );

  const revenueLineSeries = useMemo((): MarketplaceRevenueLineSeries[] => {
    const ref = revenueChartCurrency;
    const pts = (d: SalesCompareResponse | null | undefined) =>
      d?.summary?.currency === ref ? d.points ?? [] : [];
    const out: MarketplaceRevenueLineSeries[] = [
      {
        id: "amazon",
        dataKey: "amazon",
        label: "Amazon",
        color: MARKETPLACE_REVENUE_LINE_COLORS.amazon,
        points: pts(data.amazon),
      },
    ];
    (Object.keys(SLUG_TO_LINE_ID) as Array<keyof typeof SLUG_TO_LINE_ID>).forEach((key) => {
      const lineId = SLUG_TO_LINE_ID[key];
      const mp = getMarketplaceBySlug(lineId);
      out.push({
        id: lineId,
        dataKey: lineId,
        label: mp?.label ?? lineId,
        color: MARKETPLACE_REVENUE_LINE_COLORS[lineId] ?? "#64748b",
        points: pts(data[key]),
      });
    });
    return out;
  }, [revenueChartCurrency, data]);

  const totalChartDailyOrdersAndPrev = useMemo(() => {
    const dates = enumerateYmd(periodFrom, periodTo);
    const ref = revenueChartCurrency;
    const channels: (SalesCompareResponse | null | undefined)[] = [
      data.amazon,
      data.ebay,
      data.otto,
      data.kaufland,
      data.fressnapf,
      data.mms,
      data.zooplus,
      data.tiktok,
      data.shopify,
    ];
    const dailyOrders = dates.map((date) =>
      channels.reduce((sum, d) => {
        if (!d?.summary || d.summary.currency !== ref) return sum;
        const pt = d.points?.find((p) => p.date === date);
        return sum + (pt?.orders ?? 0);
      }, 0)
    );
    const prevRevenue = dates.map((_, i) =>
      channels.reduce((sum, d) => {
        if (!d?.summary || d.summary.currency !== ref) return sum;
        const pv = d.previousPoints?.[i];
        return sum + (pv?.amount ?? 0);
      }, 0)
    );
    const hasPrev = prevRevenue.some((v) => v > 0);
    return { dailyOrders, previousRevenue: hasPrev ? prevRevenue : null };
  }, [periodFrom, periodTo, revenueChartCurrency, data]);

  const periodKpis = useMemo(
    () => kpiLabelsForPeriod(periodFrom, periodTo, dfLocale, t),
    [periodFrom, periodTo, dfLocale, t]
  );

  return {
    totals,
    anySalesLoading,
    hasAnyMarketplaceSummary,
    totalStripBlocking,
    stripBackgroundSyncing,
    revenueChartCurrency,
    revenueLineSeries,
    totalChartDailyOrdersAndPrev,
    periodKpis,
  };
}
