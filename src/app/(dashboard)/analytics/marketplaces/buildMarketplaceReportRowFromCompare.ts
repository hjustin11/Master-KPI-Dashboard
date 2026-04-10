"use client";

import type { MarketplaceReportRow } from "./MarketplaceReportPrintView";

export type SalesCompareResponseLike = {
  summary?: {
    orderCount: number;
    salesAmount: number;
    units: number;
    currency: string;
    fbaUnits?: number;
  };
  previousSummary?: {
    orderCount: number;
    salesAmount: number;
    units: number;
    currency: string;
    fbaUnits?: number;
  };
  netBreakdown?: {
    returnedAmount: number;
    cancelledAmount: number;
    returnsAmount: number;
    feesAmount: number;
    adSpendAmount: number;
    netAmount: number;
    feeSource: "api" | "configured_percentage" | "default_percentage";
    returnsSource: "api" | "status_based" | "none";
    costCoverage: "api" | "estimated" | "mixed";
  };
  previousNetBreakdown?: {
    returnedAmount: number;
    cancelledAmount: number;
    returnsAmount: number;
    feesAmount: number;
    adSpendAmount: number;
    netAmount: number;
    feeSource: "api" | "configured_percentage" | "default_percentage";
    returnsSource: "api" | "status_based" | "none";
    costCoverage: "api" | "estimated" | "mixed";
  };
};

export function buildMarketplaceReportRowFromCompare(args: {
  id: string;
  label: string;
  data: SalesCompareResponseLike | null;
}): MarketplaceReportRow {
  const summary = args.data?.summary;
  const previousSummary = args.data?.previousSummary;
  const net = args.data?.netBreakdown;
  const prevNet = args.data?.previousNetBreakdown;
  const currency = summary?.currency ?? previousSummary?.currency ?? "EUR";
  const currentRevenue = summary?.salesAmount ?? 0;
  const previousRevenue = previousSummary?.salesAmount ?? 0;
  const currentOrders = summary?.orderCount ?? 0;
  const previousOrders = previousSummary?.orderCount ?? 0;
  const currentUnits = summary?.units ?? 0;
  const previousUnits = previousSummary?.units ?? 0;
  const currentFbaUnits = summary?.fbaUnits ?? 0;
  const previousFbaUnits = previousSummary?.fbaUnits ?? 0;
  const currentReturns = net?.returnsAmount ?? 0;
  const previousReturns = prevNet?.returnsAmount ?? 0;
  const currentReturned = net?.returnedAmount ?? 0;
  const previousReturned = prevNet?.returnedAmount ?? 0;
  const currentCancelled = net?.cancelledAmount ?? 0;
  const previousCancelled = prevNet?.cancelledAmount ?? 0;
  const currentFees = net?.feesAmount ?? 0;
  const previousFees = prevNet?.feesAmount ?? 0;
  const currentAds = net?.adSpendAmount ?? 0;
  const previousAds = prevNet?.adSpendAmount ?? 0;
  const currentNet = net?.netAmount ?? Math.max(0, currentRevenue - currentReturns - currentFees - currentAds);
  const previousNet =
    prevNet?.netAmount ?? Math.max(0, previousRevenue - previousReturns - previousFees - previousAds);

  return {
    id: args.id,
    label: args.label,
    currency,
    currentRevenue,
    previousRevenue,
    currentOrders,
    previousOrders,
    currentUnits,
    previousUnits,
    currentFbaUnits,
    previousFbaUnits,
    currentReturns,
    previousReturns,
    currentReturned,
    previousReturned,
    currentCancelled,
    previousCancelled,
    currentFees,
    previousFees,
    currentAds,
    previousAds,
    currentNet,
    previousNet,
    feeSource: net?.feeSource ?? "default_percentage",
    returnsSource: net?.returnsSource ?? "none",
    costCoverage: net?.costCoverage ?? "estimated",
  };
}

export function aggregateMarketplaceReportRows(rows: MarketplaceReportRow[]): MarketplaceReportRow | null {
  if (rows.length === 0) return null;
  const currency = rows[0]?.currency || "EUR";
  const sameCurrency = rows.filter((r) => r.currency === currency);
  if (sameCurrency.length === 0) return null;
  return {
    id: "total",
    label: "Gesamt",
    currency,
    currentRevenue: sameCurrency.reduce((s, r) => s + r.currentRevenue, 0),
    previousRevenue: sameCurrency.reduce((s, r) => s + r.previousRevenue, 0),
    currentOrders: sameCurrency.reduce((s, r) => s + r.currentOrders, 0),
    previousOrders: sameCurrency.reduce((s, r) => s + r.previousOrders, 0),
    currentUnits: sameCurrency.reduce((s, r) => s + r.currentUnits, 0),
    previousUnits: sameCurrency.reduce((s, r) => s + r.previousUnits, 0),
    currentFbaUnits: sameCurrency.reduce((s, r) => s + r.currentFbaUnits, 0),
    previousFbaUnits: sameCurrency.reduce((s, r) => s + r.previousFbaUnits, 0),
    currentReturns: sameCurrency.reduce((s, r) => s + r.currentReturns, 0),
    previousReturns: sameCurrency.reduce((s, r) => s + r.previousReturns, 0),
    currentReturned: sameCurrency.reduce((s, r) => s + r.currentReturned, 0),
    previousReturned: sameCurrency.reduce((s, r) => s + r.previousReturned, 0),
    currentCancelled: sameCurrency.reduce((s, r) => s + r.currentCancelled, 0),
    previousCancelled: sameCurrency.reduce((s, r) => s + r.previousCancelled, 0),
    currentFees: sameCurrency.reduce((s, r) => s + r.currentFees, 0),
    previousFees: sameCurrency.reduce((s, r) => s + r.previousFees, 0),
    currentAds: sameCurrency.reduce((s, r) => s + r.currentAds, 0),
    previousAds: sameCurrency.reduce((s, r) => s + r.previousAds, 0),
    currentNet: sameCurrency.reduce((s, r) => s + r.currentNet, 0),
    previousNet: sameCurrency.reduce((s, r) => s + r.previousNet, 0),
    feeSource: "configured_percentage",
    returnsSource: "status_based",
    costCoverage: "mixed",
  };
}
