"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import type { MarketplaceArticleSalesRow } from "@/shared/lib/marketplaceArticleLines";
import {
  PLACEHOLDER,
  type TrendDirection,
  type SalesCompareResponse,
  type SalesPoint,
  MARKETPLACE_DETAIL_ORDER,
  MARKETPLACE_TILE_LOGO,
  placeholderTileLogoPreset,
} from "@/shared/lib/marketplace-sales-types";
import {
  formatCurrency,
  formatDeltaPct,
  formatInt,
  formatRangeShort,
  formatTrendPct,
  kpiLabelsForPeriod,
  trendFromDelta,
} from "@/shared/lib/marketplace-analytics-utils";
import { bandsForMarketplaceChart, type PromotionDeal } from "../marketplaceActionBands";
import { MarketplaceRevenueChart, enumerateYmd } from "../MarketplaceRevenueChart";
import type { MarketplaceReportRow } from "../MarketplaceReportPrintView";
import { MiniKpi } from "./MiniKpi";
import { TrendIcon } from "./MarketplaceAnalyticsTrendIcon";
import { PeriodRangePicker } from "./PeriodRangePicker";

type AmazonSalesPoint = SalesPoint;
type AmazonSalesCompareResponse = SalesCompareResponse;
type OttoSalesCompareResponse = SalesCompareResponse;
type EbaySalesCompareResponse = SalesCompareResponse;
type KauflandSalesCompareResponse = SalesCompareResponse;
type FressnapfSalesCompareResponse = SalesCompareResponse;
type MmsSalesCompareResponse = SalesCompareResponse;
type ZooplusSalesCompareResponse = SalesCompareResponse;
type TiktokSalesCompareResponse = SalesCompareResponse;
type ShopifySalesCompareResponse = SalesCompareResponse;

export function MarketplaceDetailDialog({
  open,
  onOpenChange,
  index,
  onStep,
  periodFrom,
  periodTo,
  amazonLoading,
  amazonError,
  amazonSummary,
  amazonPreviousSummary,
  amazonTrend,
  amazonPoints,
  amazonPreviousPoints,
  ebayLoading,
  ebayError,
  ebaySummary,
  ebayPreviousSummary,
  ebayTrend,
  ebayPoints,
  ebayPreviousPoints,
  ottoLoading,
  ottoError,
  ottoSummary,
  ottoPreviousSummary,
  ottoTrend,
  ottoPoints,
  ottoPreviousPoints,
  kauflandLoading,
  kauflandError,
  kauflandSummary,
  kauflandPreviousSummary,
  kauflandTrend,
  kauflandPoints,
  kauflandPreviousPoints,
  fressnapfLoading,
  fressnapfError,
  fressnapfSummary,
  fressnapfPreviousSummary,
  fressnapfTrend,
  fressnapfPoints,
  fressnapfPreviousPoints,
  mmsLoading,
  mmsError,
  mmsSummary,
  mmsPreviousSummary,
  mmsTrend,
  mmsPoints,
  mmsPreviousPoints,
  zooplusLoading,
  zooplusError,
  zooplusSummary,
  zooplusPreviousSummary,
  zooplusTrend,
  zooplusPoints,
  zooplusPreviousPoints,
  tiktokLoading,
  tiktokError,
  tiktokSummary,
  tiktokPreviousSummary,
  tiktokTrend,
  tiktokPoints,
  tiktokPreviousPoints,
  shopifyLoading,
  shopifyError,
  shopifySummary,
  shopifyPreviousSummary,
  shopifyTrend,
  shopifyPoints,
  shopifyPreviousPoints,
  promotionDeals,
  periodKpis,
  reportRows,
  intlTag,
  dfLocale,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  onStep: (delta: -1 | 1) => void;
  periodFrom: string;
  periodTo: string;
  amazonLoading: boolean;
  amazonError: string | null;
  amazonSummary: AmazonSalesCompareResponse["summary"] | undefined;
  amazonPreviousSummary: AmazonSalesCompareResponse["previousSummary"] | undefined;
  amazonTrend: { text: string; direction: TrendDirection };
  amazonPoints: AmazonSalesPoint[];
  amazonPreviousPoints: AmazonSalesPoint[] | undefined;
  ebayLoading: boolean;
  ebayError: string | null;
  ebaySummary: EbaySalesCompareResponse["summary"] | undefined;
  ebayPreviousSummary: EbaySalesCompareResponse["previousSummary"] | undefined;
  ebayTrend: { text: string; direction: TrendDirection };
  ebayPoints: AmazonSalesPoint[];
  ebayPreviousPoints: AmazonSalesPoint[] | undefined;
  ottoLoading: boolean;
  ottoError: string | null;
  ottoSummary: OttoSalesCompareResponse["summary"] | undefined;
  ottoPreviousSummary: OttoSalesCompareResponse["previousSummary"] | undefined;
  ottoTrend: { text: string; direction: TrendDirection };
  ottoPoints: AmazonSalesPoint[];
  ottoPreviousPoints: AmazonSalesPoint[] | undefined;
  kauflandLoading: boolean;
  kauflandError: string | null;
  kauflandSummary: KauflandSalesCompareResponse["summary"] | undefined;
  kauflandPreviousSummary: KauflandSalesCompareResponse["previousSummary"] | undefined;
  kauflandTrend: { text: string; direction: TrendDirection };
  kauflandPoints: AmazonSalesPoint[];
  kauflandPreviousPoints: AmazonSalesPoint[] | undefined;
  fressnapfLoading: boolean;
  fressnapfError: string | null;
  fressnapfSummary: FressnapfSalesCompareResponse["summary"] | undefined;
  fressnapfPreviousSummary: FressnapfSalesCompareResponse["previousSummary"] | undefined;
  fressnapfTrend: { text: string; direction: TrendDirection };
  fressnapfPoints: AmazonSalesPoint[];
  fressnapfPreviousPoints: AmazonSalesPoint[] | undefined;
  mmsLoading: boolean;
  mmsError: string | null;
  mmsSummary: MmsSalesCompareResponse["summary"] | undefined;
  mmsPreviousSummary: MmsSalesCompareResponse["previousSummary"] | undefined;
  mmsTrend: { text: string; direction: TrendDirection };
  mmsPoints: AmazonSalesPoint[];
  mmsPreviousPoints: AmazonSalesPoint[] | undefined;
  zooplusLoading: boolean;
  zooplusError: string | null;
  zooplusSummary: ZooplusSalesCompareResponse["summary"] | undefined;
  zooplusPreviousSummary: ZooplusSalesCompareResponse["previousSummary"] | undefined;
  zooplusTrend: { text: string; direction: TrendDirection };
  zooplusPoints: AmazonSalesPoint[];
  zooplusPreviousPoints: AmazonSalesPoint[] | undefined;
  tiktokLoading: boolean;
  tiktokError: string | null;
  tiktokSummary: TiktokSalesCompareResponse["summary"] | undefined;
  tiktokPreviousSummary: TiktokSalesCompareResponse["previousSummary"] | undefined;
  tiktokTrend: { text: string; direction: TrendDirection };
  tiktokPoints: AmazonSalesPoint[];
  tiktokPreviousPoints: AmazonSalesPoint[] | undefined;
  shopifyLoading: boolean;
  shopifyError: string | null;
  shopifySummary: ShopifySalesCompareResponse["summary"] | undefined;
  shopifyPreviousSummary: ShopifySalesCompareResponse["previousSummary"] | undefined;
  shopifyTrend: { text: string; direction: TrendDirection };
  shopifyPoints: AmazonSalesPoint[];
  shopifyPreviousPoints: AmazonSalesPoint[] | undefined;
  promotionDeals: PromotionDeal[];
  periodKpis: ReturnType<typeof kpiLabelsForPeriod>;
  /** Profitabilitätsdaten für alle Marktplätze. */
  reportRows: MarketplaceReportRow[];
  intlTag: string;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const fc = (amount: number, currency: string) => formatCurrency(amount, currency, intlTag);
  const fi = (n: number) => formatInt(n, intlTag);

  const marketplaceId = MARKETPLACE_DETAIL_ORDER[index] ?? "amazon";
  const currentReportRow = reportRows.find((r) => r.id === marketplaceId);

  const [detailPeriodFrom, setDetailPeriodFrom] = useState(periodFrom);
  const [detailPeriodTo, setDetailPeriodTo] = useState(periodTo);
  const [articleRows, setArticleRows] = useState<MarketplaceArticleSalesRow[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [articlesUnsupported, setArticlesUnsupported] = useState(false);
  const [articlePrevRange, setArticlePrevRange] = useState({ from: "", to: "" });
  const detailPeriodGateRef = useRef<{ open: boolean; index: number }>({ open: false, index: -1 });

  useEffect(() => {
    if (!open) {
      detailPeriodGateRef.current.open = false;
      return;
    }
    const reopenOrMarketplaceChange =
      !detailPeriodGateRef.current.open || detailPeriodGateRef.current.index !== index;
    if (reopenOrMarketplaceChange) {
      queueMicrotask(() => {
        setDetailPeriodFrom(periodFrom);
        setDetailPeriodTo(periodTo);
      });
    }
    detailPeriodGateRef.current = { open: true, index };
  }, [open, index, periodFrom, periodTo]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setArticlesLoading(true);
      setArticlesError(null);
      setArticlesUnsupported(false);
      setArticlePrevRange({ from: "", to: "" });
    });
    const params = new URLSearchParams({
      marketplace: marketplaceId,
      from: detailPeriodFrom,
      to: detailPeriodTo,
    });
    void fetch(`/api/analytics/marketplace-article-sales?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          items?: MarketplaceArticleSalesRow[];
          error?: string;
          unsupported?: boolean;
          previousFrom?: string;
          previousTo?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setArticlesError(data.error ?? t("commonUi.unknownError"));
          setArticleRows([]);
          return;
        }
        if (data.unsupported) {
          setArticlesUnsupported(true);
          setArticleRows([]);
          return;
        }
        setArticleRows(Array.isArray(data.items) ? data.items : []);
        if (data.previousFrom && data.previousTo) {
          setArticlePrevRange({ from: data.previousFrom, to: data.previousTo });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArticlesError(t("commonUi.unknownError"));
          setArticleRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setArticlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, marketplaceId, detailPeriodFrom, detailPeriodTo, t]);
  const orderLen = MARKETPLACE_DETAIL_ORDER.length;

  const chartBands = useMemo(
    () => bandsForMarketplaceChart(promotionDeals, marketplaceId),
    [promotionDeals, marketplaceId]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marketplaceMetrics =
    marketplaceId === "amazon"
      ? {
          loading: amazonLoading,
          error: amazonError,
          summary: amazonSummary,
          previousSummary: amazonPreviousSummary,
          trend: amazonTrend,
          points: amazonPoints,
          previousPoints: amazonPreviousPoints,
          orderLink: "/amazon/orders",
        }
      : marketplaceId === "ebay"
        ? {
            loading: ebayLoading,
            error: ebayError,
            summary: ebaySummary,
            previousSummary: ebayPreviousSummary,
            trend: ebayTrend,
            points: ebayPoints,
            previousPoints: ebayPreviousPoints,
            orderLink: "/ebay/orders",
          }
      : marketplaceId === "otto"
        ? {
            loading: ottoLoading,
            error: ottoError,
            summary: ottoSummary,
            previousSummary: ottoPreviousSummary,
            trend: ottoTrend,
            points: ottoPoints,
            previousPoints: ottoPreviousPoints,
            orderLink: "/otto/orders",
          }
        : marketplaceId === "kaufland"
          ? {
              loading: kauflandLoading,
              error: kauflandError,
              summary: kauflandSummary,
              previousSummary: kauflandPreviousSummary,
              trend: kauflandTrend,
              points: kauflandPoints,
              previousPoints: kauflandPreviousPoints,
              orderLink: "/kaufland/orders",
            }
          : marketplaceId === "fressnapf"
            ? {
                loading: fressnapfLoading,
                error: fressnapfError,
                summary: fressnapfSummary,
                previousSummary: fressnapfPreviousSummary,
                trend: fressnapfTrend,
                points: fressnapfPoints,
                previousPoints: fressnapfPreviousPoints,
                orderLink: "/fressnapf/orders",
              }
            : marketplaceId === "mediamarkt-saturn"
              ? {
                  loading: mmsLoading,
                  error: mmsError,
                  summary: mmsSummary,
                  previousSummary: mmsPreviousSummary,
                  trend: mmsTrend,
                  points: mmsPoints,
                  previousPoints: mmsPreviousPoints,
                  orderLink: "/mediamarkt-saturn/orders",
                }
              : marketplaceId === "zooplus"
                ? {
                    loading: zooplusLoading,
                    error: zooplusError,
                    summary: zooplusSummary,
                    previousSummary: zooplusPreviousSummary,
                    trend: zooplusTrend,
                    points: zooplusPoints,
                    previousPoints: zooplusPreviousPoints,
                    orderLink: "/zooplus/orders",
                  }
                : marketplaceId === "tiktok"
                  ? {
                      loading: tiktokLoading,
                      error: tiktokError,
                      summary: tiktokSummary,
                      previousSummary: tiktokPreviousSummary,
                      trend: tiktokTrend,
                      points: tiktokPoints,
                      previousPoints: tiktokPreviousPoints,
                      orderLink: "/tiktok/orders",
                    }
                  : marketplaceId === "shopify"
                    ? {
                        loading: shopifyLoading,
                        error: shopifyError,
                        summary: shopifySummary,
                        previousSummary: shopifyPreviousSummary,
                        trend: shopifyTrend,
                        points: shopifyPoints,
                        previousPoints: shopifyPreviousPoints,
                        orderLink: "/shopify/orders",
                      }
                    : null;

  const dayKpis = useMemo(() => {
    if (!marketplaceMetrics?.summary) return null;
    const dates = enumerateYmd(periodFrom, periodTo);
    const pts = marketplaceMetrics.points as AmazonSalesPoint[];
    const byDate = new Map(pts.map((p) => [p.date, p] as const));
    const amounts = dates.map((d) => byDate.get(d)?.amount ?? 0);
    const max = amounts.length ? Math.max(...amounts) : 0;
    const positive = amounts.filter((a) => a > 0);
    const min = positive.length ? Math.min(...positive) : 0;
    const avg = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
    return {
      max,
      min,
      avg,
      activeDays: positive.length,
      totalDays: dates.length,
    };
  }, [marketplaceMetrics, periodFrom, periodTo]);

  const chartActive =
    !!marketplaceMetrics && !marketplaceMetrics.error && !!marketplaceMetrics.summary;
  const chartCurrency = marketplaceMetrics?.summary?.currency ?? "EUR";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onStep(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onStep(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onStep]);

  const logoBlock =
    marketplaceId === "amazon" ? (
      <div
        className={cn(
          MARKETPLACE_TILE_LOGO.amazon.slot,
          "mx-auto justify-center scale-[1.35] origin-center h-auto min-h-[4rem]"
        )}
      >
        <MarketplaceBrandImg
          src="/brand/amazon-logo-current.png"
          alt="Amazon"
          className={cn(MARKETPLACE_TILE_LOGO.amazon.img, "max-h-28 opacity-100")}
        />
      </div>
    ) : (
      (() => {
        const m = getMarketplaceBySlug(marketplaceId);
        if (!m) return null;
        const { slot, img } = MARKETPLACE_TILE_LOGO[placeholderTileLogoPreset()];
        return (
          <div
            className={cn(
              slot,
              "mx-auto max-w-full justify-center scale-[1.35] origin-center h-auto min-h-[4rem]"
            )}
          >
            <MarketplaceBrandImg
              src={m.logo}
              alt={m.label}
              className={cn(img, "max-h-22 sm:max-h-26 opacity-100")}
            />
          </div>
        );
      })()
    );

  const detailMarketplaceKpis =
    marketplaceMetrics?.loading && !marketplaceMetrics?.summary ? (
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    ) : marketplaceMetrics?.error ? (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-2 text-xs text-amber-900">
        {marketplaceMetrics.error}
      </p>
    ) : marketplaceMetrics?.summary ? (
      (() => {
        const s = marketplaceMetrics.summary;
        const ps = marketplaceMetrics.previousSummary;
        const cur = s.currency;
        // Profitabilität-Daten (netBreakdown) sind in reportRows, nicht in marketplaceMetrics — TODO: nachziehen.
        const prevAov = ps && ps.orderCount > 0 ? ps.salesAmount / ps.orderCount : 0;
        const curAov = s.orderCount > 0 ? s.salesAmount / s.orderCount : 0;
        const curRpu = s.units > 0 ? s.salesAmount / s.units : 0;
        const prevRpu = ps && ps.units > 0 ? ps.salesAmount / ps.units : 0;
        return (
          <div className="space-y-3">
            {/* === Abschnitt: Kernkennzahlen mit Vergleich === */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("analyticsMp.sectionComparison")}
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                <MiniKpi
                  label={periodKpis.revenue}
                  value={fc(s.salesAmount, cur)}
                  trendDirection={marketplaceMetrics.trend.direction}
                  previousValue={ps ? fc(ps.salesAmount, cur) : undefined}
                  deltaPct={ps ? formatDeltaPct(s.salesAmount, ps.salesAmount, intlTag) : undefined}
                />
                <MiniKpi
                  label={periodKpis.orders}
                  value={fi(s.orderCount)}
                  trendDirection={ps ? trendFromDelta(s.orderCount, ps.orderCount) : "unknown"}
                  previousValue={ps ? fi(ps.orderCount) : undefined}
                  deltaPct={ps ? formatDeltaPct(s.orderCount, ps.orderCount, intlTag) : undefined}
                />
                <MiniKpi
                  label={periodKpis.units}
                  value={fi(s.units)}
                  trendDirection={ps ? trendFromDelta(s.units, ps.units) : "unknown"}
                  previousValue={ps ? fi(ps.units) : undefined}
                  deltaPct={ps ? formatDeltaPct(s.units, ps.units, intlTag) : undefined}
                />
                <MiniKpi
                  label={t("analyticsMp.avgOrderValue")}
                  value={s.orderCount > 0 ? fc(curAov, cur) : PLACEHOLDER}
                  trendDirection={ps ? trendFromDelta(curAov, prevAov) : "unknown"}
                  previousValue={prevAov > 0 ? fc(prevAov, cur) : undefined}
                  deltaPct={prevAov > 0 ? formatDeltaPct(curAov, prevAov, intlTag) : undefined}
                />
                <MiniKpi
                  label={t("analyticsMp.revenuePerUnit")}
                  value={s.units > 0 ? fc(curRpu, cur) : PLACEHOLDER}
                  trendDirection={prevRpu > 0 ? trendFromDelta(curRpu, prevRpu) : "unknown"}
                  previousValue={prevRpu > 0 ? fc(prevRpu, cur) : undefined}
                  deltaPct={prevRpu > 0 ? formatDeltaPct(curRpu, prevRpu, intlTag) : undefined}
                />
                <MiniKpi
                  label={t("analyticsMp.avgUnitsPerOrder")}
                  value={
                    s.orderCount > 0
                      ? (s.units / s.orderCount).toLocaleString(intlTag, { maximumFractionDigits: 2 })
                      : PLACEHOLDER
                  }
                />
              </div>
            </div>
            {/* === Abschnitt: Performance === */}
            {dayKpis ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("analyticsMp.sectionPerformance")}
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniKpi
                    label={t("analyticsMp.avgRevenuePerCalendarDay")}
                    value={fc(dayKpis.avg, cur)}
                  />
                  <MiniKpi
                    label={t("analyticsMp.avgOrdersPerDay")}
                    value={
                      dayKpis.totalDays > 0
                        ? (s.orderCount / dayKpis.totalDays).toLocaleString(intlTag, { maximumFractionDigits: 1 })
                        : PLACEHOLDER
                    }
                  />
                  <MiniKpi
                    label={t("analyticsMp.avgUnitsPerDay")}
                    value={
                      dayKpis.totalDays > 0
                        ? (s.units / dayKpis.totalDays).toLocaleString(intlTag, { maximumFractionDigits: 1 })
                        : PLACEHOLDER
                    }
                  />
                  <MiniKpi
                    label={t("analyticsMp.daysWithRevenue")}
                    value={`${dayKpis.activeDays} / ${dayKpis.totalDays}`}
                  />
                  <MiniKpi
                    label={t("analyticsMp.maxDailyRevenue")}
                    value={fc(dayKpis.max, cur)}
                  />
                  <MiniKpi
                    label={t("analyticsMp.minDayWithRevenue")}
                    value={dayKpis.min > 0 ? fc(dayKpis.min, cur) : PLACEHOLDER}
                  />
                </div>
              </div>
            ) : null}
            {/* === Abschnitt: Profitabilität === */}
            {currentReportRow && (currentReportRow.currentFees > 0 || currentReportRow.currentReturns > 0) ? (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("analyticsMp.sectionProfitability")}
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniKpi
                    label={t("analyticsMp.netRevenue")}
                    value={fc(currentReportRow.currentNet, cur)}
                    previousValue={currentReportRow.previousNet > 0 ? fc(currentReportRow.previousNet, cur) : undefined}
                    deltaPct={formatDeltaPct(currentReportRow.currentNet, currentReportRow.previousNet, intlTag)}
                    trendDirection={trendFromDelta(currentReportRow.currentNet, currentReportRow.previousNet)}
                    tooltip={t("analyticsMp.netRevenueTooltip")}
                  />
                  <MiniKpi
                    label={t("analyticsMp.marketplaceFees")}
                    value={fc(currentReportRow.currentFees, cur)}
                    deltaPct={
                      s.salesAmount > 0
                        ? `${((currentReportRow.currentFees / s.salesAmount) * 100).toFixed(1)} %`
                        : undefined
                    }
                    tooltip={`${t("analyticsMp.feeSource")}: ${currentReportRow.feeSource}`}
                  />
                  <MiniKpi
                    label={t("analyticsMp.returnsAmount")}
                    value={currentReportRow.currentReturns > 0 ? fc(currentReportRow.currentReturns, cur) : PLACEHOLDER}
                    deltaPct={
                      currentReportRow.currentReturns > 0 && s.salesAmount > 0
                        ? `${((currentReportRow.currentReturns / s.salesAmount) * 100).toFixed(1)} %`
                        : undefined
                    }
                  />
                  <MiniKpi
                    label={t("analyticsMp.cancelledAmount")}
                    value={currentReportRow.currentCancelled > 0 ? fc(currentReportRow.currentCancelled, cur) : PLACEHOLDER}
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })()
    ) : (
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <MiniKpi key={i} label="—" value={PLACEHOLDER} />
        ))}
      </div>
    );

  const detailPlaceholderKpis = (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      <MiniKpi
        label={t("analyticsMp.revenueWithSpan", {
          span: formatRangeShort(periodFrom, periodTo, dfLocale),
        })}
        value={PLACEHOLDER}
      />
      <MiniKpi label={t("analyticsMp.orders")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.units")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.trendDelta")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.avgOrderValue")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.sessionsVisits")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.conversionRate")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.returnsRate")} value={PLACEHOLDER} />
      <MiniKpi label={t("analyticsMp.activeListings")} value={PLACEHOLDER} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(96vh,940px)] max-w-[calc(100%-1.25rem)] w-full gap-0 overflow-y-auto p-0 sm:max-w-6xl xl:max-w-7xl"
      >
        <div className="flex items-start gap-2 border-b border-border/60 px-4 pb-3 pt-5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-2 shrink-0"
            aria-label={t("analyticsMp.dialogPrev")}
            onClick={() => onStep(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="mt-3">{logoBlock}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-2 shrink-0"
            aria-label={t("analyticsMp.dialogNext")}
            onClick={() => onStep(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="space-y-2.5 px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("analyticsMp.metricsHeading")}
          </p>
          {marketplaceMetrics ? detailMarketplaceKpis : detailPlaceholderKpis}
          {marketplaceMetrics?.orderLink ? (
            <div className="pt-2">
              <Link
                href={marketplaceMetrics.orderLink}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {marketplaceId === "otto"
                  ? t("analyticsMp.linkOttoOrders")
                  : marketplaceId === "ebay"
                    ? t("analyticsMp.linkEbayOrders")
                  : marketplaceId === "kaufland"
                    ? t("analyticsMp.linkKauflandOrders")
                    : marketplaceId === "fressnapf"
                      ? t("analyticsMp.linkFressnapfOrders")
                      : marketplaceId === "mediamarkt-saturn"
                        ? t("analyticsMp.linkMmsOrders")
                        : marketplaceId === "zooplus"
                          ? t("analyticsMp.linkZooplusOrders")
                          : marketplaceId === "tiktok"
                            ? t("analyticsMp.linkTiktokOrders")
                            : marketplaceId === "shopify"
                              ? t("analyticsMp.linkShopifyOrders")
                              : t("analyticsMp.linkAmazonOrders")}
              </Link>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("analyticsMp.dialogArticlesHeading")}
              </p>
              <PeriodRangePicker
                periodFrom={detailPeriodFrom}
                periodTo={detailPeriodTo}
                onChange={(from, to) => {
                  setDetailPeriodFrom(from);
                  setDetailPeriodTo(to);
                }}
                dfLocale={dfLocale}
                t={t}
              />
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {t("analyticsMp.dialogArticlesPeriodHint", {
                span: formatRangeShort(detailPeriodFrom, detailPeriodTo, dfLocale),
              })}
              {articlePrevRange.from && articlePrevRange.to
                ? ` · ${t("analyticsMp.dialogArticlesPrevHint", {
                    span: formatRangeShort(articlePrevRange.from, articlePrevRange.to, dfLocale),
                  })}`
                : null}
            </p>
            {articlesUnsupported ? (
              <p className="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-xs text-muted-foreground">
                {t("analyticsMp.dialogArticlesUnsupported")}
              </p>
            ) : articlesError ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-2 text-xs text-amber-900">
                {articlesError}
              </p>
            ) : articlesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                {t("analyticsMp.dialogArticlesLoading")}
              </div>
            ) : articleRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("analyticsMp.dialogArticlesEmpty")}</p>
            ) : (
              <div className="max-h-[min(40vh,380px)] overflow-auto rounded-md border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[140px] text-[10px] uppercase">
                        {t("analyticsMp.dialogArticlesColArticle")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase tabular-nums">
                        {t("analyticsMp.dialogArticlesColUnits")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase">
                        {t("analyticsMp.dialogArticlesColDelta")}
                      </TableHead>
                      <TableHead className="text-right text-[10px] uppercase tabular-nums">
                        {t("analyticsMp.dialogArticlesColAvgPrice")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articleRows.map((row) => {
                      const delta = formatTrendPct(
                        row.unitsDeltaPct,
                        row.unitsPrevious,
                        row.unitsCurrent,
                        intlTag,
                        (key) => t(key)
                      );
                      return (
                        <TableRow key={row.key}>
                          <TableCell className="max-w-[min(40vw,280px)] align-top">
                            <span className="line-clamp-2 text-xs font-medium leading-snug">{row.title}</span>
                            {row.key && row.key !== row.title ? (
                              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                                {row.key}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fi(row.unitsCurrent)}</TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center justify-end gap-0.5 text-xs tabular-nums">
                              <TrendIcon compact direction={delta.direction} />
                              <span
                                className={cn(
                                  delta.direction === "up" && "text-emerald-700",
                                  delta.direction === "down" && "text-rose-700"
                                )}
                              >
                                {delta.text}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.avgPriceCurrent != null
                              ? fc(row.avgPriceCurrent, chartCurrency)
                              : PLACEHOLDER}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="border-t border-border/50 pt-3">
            <MarketplaceRevenueChart
              periodFrom={periodFrom}
              periodTo={periodTo}
              currency={chartCurrency}
              formatCurrency={fc}
              points={marketplaceMetrics?.points ?? []}
              previousPoints={marketplaceMetrics?.previousPoints}
              showPreviousLine={!!marketplaceMetrics?.previousSummary}
              bands={chartBands}
              chartActive={chartActive}
            />
          </div>
        </div>

        <div className="border-t border-border/60 bg-muted/30 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
          {t("analyticsMp.dialogCounter", {
            current: String(index + 1),
            total: String(orderLen),
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
