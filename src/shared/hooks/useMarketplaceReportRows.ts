"use client";

import { useMemo } from "react";
import type { MarketplaceReportRow } from "@/app/(dashboard)/analytics/marketplaces/MarketplaceReportPrintView";
import { buildReportRow } from "@/shared/lib/marketplace-analytics-utils";
import type { MarketplaceDataMap } from "./useMarketplaceTotals";
import type { TotalsInput } from "@/shared/lib/marketplace-analytics-utils";

export type MarketplaceNetSummary = {
  currency: string;
  current: {
    revenue: number;
    orders: number;
    units: number;
    returnedAmount: number;
    cancelledAmount: number;
    returnsAmount: number;
    feesAmount: number;
    adSpendAmount: number;
  };
  previous: {
    revenue: number;
    orders: number;
    units: number;
    returnedAmount: number;
    cancelledAmount: number;
    returnsAmount: number;
    feesAmount: number;
    adSpendAmount: number;
  };
  currentNet: number;
  previousNet: number;
  note: string;
};

export default function useMarketplaceReportRows(params: {
  data: MarketplaceDataMap;
  totals: TotalsInput | null;
}): { reportRows: MarketplaceReportRow[]; netSummary: MarketplaceNetSummary | null } {
  const { data, totals } = params;

  const reportRows = useMemo<MarketplaceReportRow[]>(
    () => [
      buildReportRow({ id: "amazon", label: "Amazon", data: data.amazon }),
      buildReportRow({ id: "ebay", label: "eBay", data: data.ebay }),
      buildReportRow({ id: "otto", label: "Otto", data: data.otto }),
      buildReportRow({ id: "kaufland", label: "Kaufland", data: data.kaufland }),
      buildReportRow({ id: "fressnapf", label: "Fressnapf", data: data.fressnapf }),
      buildReportRow({ id: "mediamarkt-saturn", label: "MediaMarkt Saturn", data: data.mms }),
      buildReportRow({ id: "zooplus", label: "Zooplus", data: data.zooplus }),
      buildReportRow({ id: "tiktok", label: "TikTok Shop", data: data.tiktok }),
      buildReportRow({ id: "shopify", label: "Shopify", data: data.shopify }),
    ],
    [data]
  );

  const netSummary = useMemo<MarketplaceNetSummary | null>(() => {
    if (!totals) return null;
    const sameCurrencyRows = reportRows.filter((row) => row.currency === totals.currency);
    const current = {
      revenue: sameCurrencyRows.reduce((s, r) => s + r.currentRevenue, 0),
      orders: sameCurrencyRows.reduce((s, r) => s + r.currentOrders, 0),
      units: sameCurrencyRows.reduce((s, r) => s + r.currentUnits, 0),
      returnedAmount: sameCurrencyRows.reduce((s, r) => s + r.currentReturned, 0),
      cancelledAmount: sameCurrencyRows.reduce((s, r) => s + r.currentCancelled, 0),
      returnsAmount: sameCurrencyRows.reduce((s, r) => s + r.currentReturns, 0),
      feesAmount: sameCurrencyRows.reduce((s, r) => s + r.currentFees, 0),
      adSpendAmount: sameCurrencyRows.reduce((s, r) => s + r.currentAds, 0),
    };
    const previous = {
      revenue: sameCurrencyRows.reduce((s, r) => s + r.previousRevenue, 0),
      orders: sameCurrencyRows.reduce((s, r) => s + r.previousOrders, 0),
      units: sameCurrencyRows.reduce((s, r) => s + r.previousUnits, 0),
      returnedAmount: sameCurrencyRows.reduce((s, r) => s + r.previousReturned, 0),
      cancelledAmount: sameCurrencyRows.reduce((s, r) => s + r.previousCancelled, 0),
      returnsAmount: sameCurrencyRows.reduce((s, r) => s + r.previousReturns, 0),
      feesAmount: sameCurrencyRows.reduce((s, r) => s + r.previousFees, 0),
      adSpendAmount: sameCurrencyRows.reduce((s, r) => s + r.previousAds, 0),
    };
    const currentNet =
      current.revenue - current.returnsAmount - current.feesAmount - current.adSpendAmount;
    const previousNet =
      previous.revenue - previous.returnsAmount - previous.feesAmount - previous.adSpendAmount;
    const coverageOrder = { api: 0, mixed: 1, estimated: 2 } as const;
    const coverage = sameCurrencyRows.reduce<"api" | "mixed" | "estimated">((worst, row) => {
      return coverageOrder[row.costCoverage] > coverageOrder[worst] ? row.costCoverage : worst;
    }, "api");
    return {
      currency: totals.currency,
      current,
      previous,
      currentNet,
      previousNet,
      note: `Datendeckung gesamt: ${coverage}. Returned/Cancelled werden statusbasiert ausgewertet, Gebühren via API oder konfigurierten Prozentsatz.`,
    };
  }, [totals, reportRows]);

  return { reportRows, netSummary };
}
