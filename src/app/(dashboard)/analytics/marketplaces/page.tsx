"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  ArrowRight,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  ANALYTICS_MARKETPLACES,
  getMarketplaceBySlug,
} from "@/shared/lib/analytics-marketplaces";
import { MAX_ANALYTICS_RANGE_DAYS } from "@/shared/lib/analytics-date-range";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MarketplacePriceParitySection } from "./MarketplacePriceParitySection";
import { MarketplaceRevenueChart, enumerateYmd } from "./MarketplaceRevenueChart";
import {
  MARKETPLACE_REVENUE_LINE_COLORS,
  MarketplaceTotalRevenueLinesChart,
  type MarketplaceRevenueLineSeries,
} from "./MarketplaceTotalRevenueLinesChart";
import { MarketplaceAnalyticsDataQualityNotice } from "./MarketplaceAnalyticsDataQualityNotice";
import {
  bandsForMarketplaceChart,
  bandsForTotalChart,
  type MarketplaceActionBand,
  type PromotionDeal,
} from "./marketplaceActionBands";
import { PromotionDealsDialog } from "./PromotionDealsDialog";
import { usePromotionDeals } from "./usePromotionDeals";
import {
  MarketplaceReportPrintView,
  buildMarketplaceReportHtml,
  type MarketplaceReportRow,
} from "./MarketplaceReportPrintView";
import { DevelopmentReportDialog } from "./DevelopmentReportDialog";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readAnalyticsSalesCompareInitial,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { getDateFnsLocale, intlLocaleTag } from "@/i18n/locale-formatting";
import {
  WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG,
  WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG,
  WIKIMEDIA_SHOPIFY_LOGO_2018_SVG,
  WIKIMEDIA_ZOOPLUS_LOGO_PNG,
} from "@/shared/lib/dashboardUi";
import type { MarketplaceArticleSalesRow } from "@/shared/lib/marketplaceArticleLines";

type TrendDirection = "up" | "down" | "flat" | "unknown";

const PLACEHOLDER = "—";
const MAX_RANGE_DAYS = MAX_ANALYTICS_RANGE_DAYS;
const MARKETPLACE_FETCH_TIMEOUT_MS = 60_000;
const AMAZON_FETCH_TIMEOUT_MS = 120_000;
const TOTAL_STRIP_MAX_BLOCK_MS = 15_000;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function defaultPeriod(): { from: string; to: string } {
  const to = startOfLocalDay(new Date());
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: toYmd(from), to: toYmd(to) };
}

function formatRangeShort(fromYmd: string, toYmd: string, dfLocale: DateFnsLocale): string {
  const a = parseYmdLocal(fromYmd);
  const b = parseYmdLocal(toYmd);
  if (fromYmd === toYmd) return format(a, "d. MMM yyyy", { locale: dfLocale });
  return `${format(a, "d. MMM", { locale: dfLocale })} – ${format(b, "d. MMM yyyy", { locale: dfLocale })}`;
}

async function fetchSalesCompareWithTimeout<T extends { error?: string }>(
  url: string,
  fallbackErrorMessage: string,
  timeoutMs = MARKETPLACE_FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    let payload: T;
    try {
      payload = (await res.json()) as T;
    } catch {
      throw new Error(fallbackErrorMessage);
    }
    if (!res.ok) {
      throw new Error(payload.error ?? fallbackErrorMessage);
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Zeitlimit erreicht. Bitte erneut versuchen.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  return differenceInCalendarDays(parseYmdLocal(toYmd), parseYmdLocal(fromYmd)) + 1;
}

function kpiLabelsForPeriod(
  periodFrom: string,
  periodTo: string,
  dfLocale: DateFnsLocale,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  const span = formatRangeShort(periodFrom, periodTo, dfLocale);
  return {
    revenue: t("analyticsMp.revenueWithSpan", { span }),
    orders: t("analyticsMp.orders"),
    units: t("analyticsMp.units"),
    trend: t("analyticsMp.trendDelta"),
  };
}

/** Berechnet Delta-% als formatierten String (z.B. "+12,3 %" oder "−4,1 %"). */
function formatDeltaPct(current: number, previous: number, locale: string): string | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return undefined;
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return undefined;
  const abs = Math.abs(pct);
  const formatted = abs.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (pct > 0.05) return `+${formatted} %`;
  if (pct < -0.05) return `−${formatted} %`;
  return "±0 %";
}

/** Bestimmt Trend-Richtung aus Delta-%. */
function trendFromDelta(current: number, previous: number): TrendDirection {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return "unknown";
  const pct = ((current - previous) / previous) * 100;
  if (pct > 0.5) return "up";
  if (pct < -0.5) return "down";
  return "flat";
}

/**
 * Reusable KPI-Grid für Marktplatz-Karten: 6 KPIs mit Δ% statt 4 ohne.
 * Wird in allen 9+ Marktplatz-Kacheln eingesetzt.
 */
function MarketplaceTileKpis({
  summary,
  previousSummary,
  trend,
  periodKpis,
  intlTag,
}: {
  summary: { salesAmount: number; orderCount: number; units: number; currency: string };
  previousSummary?: { salesAmount: number; orderCount: number; units: number; currency: string } | null;
  trend: { text: string; direction: TrendDirection };
  periodKpis: ReturnType<typeof kpiLabelsForPeriod>;
  intlTag: string;
}) {
  const ps = previousSummary;
  const fc = (a: number, c: string) => formatCurrency(a, c, intlTag);
  const fi = (n: number) => formatInt(n, intlTag);
  const curAov = summary.orderCount > 0 ? summary.salesAmount / summary.orderCount : 0;
  return (
    <div className="mt-auto grid grid-cols-2 gap-1 pt-2">
      <MiniKpi
        compact
        label={periodKpis.revenue}
        value={fc(summary.salesAmount, summary.currency)}
        trendDirection={trend.direction}
        deltaPct={ps ? formatDeltaPct(summary.salesAmount, ps.salesAmount, intlTag) : undefined}
      />
      <MiniKpi
        compact
        label={periodKpis.orders}
        value={fi(summary.orderCount)}
        trendDirection={ps ? trendFromDelta(summary.orderCount, ps.orderCount) : "unknown"}
        deltaPct={ps ? formatDeltaPct(summary.orderCount, ps.orderCount, intlTag) : undefined}
      />
      <MiniKpi
        compact
        label={periodKpis.units}
        value={fi(summary.units)}
        trendDirection={ps ? trendFromDelta(summary.units, ps.units) : "unknown"}
        deltaPct={ps ? formatDeltaPct(summary.units, ps.units, intlTag) : undefined}
      />
      <MiniKpi
        compact
        label={periodKpis.trend}
        value={trend.text}
        trendDirection={trend.direction}
      />
      <MiniKpi
        compact
        label="Ø Bestellwert"
        value={summary.orderCount > 0 ? fc(curAov, summary.currency) : PLACEHOLDER}
      />
      <MiniKpi
        compact
        label="Umsatz / Einheit"
        value={summary.units > 0 ? fc(summary.salesAmount / summary.units, summary.currency) : PLACEHOLDER}
      />
    </div>
  );
}

type MarketplaceTileLogoPreset =
  | "amazon"
  | "zooplus"
  | "compact"
  | "default"
  | "fressnapf"
  | "mediamarktSaturn"
  | "wide";

const MARKETPLACE_TILE_LOGO: Record<MarketplaceTileLogoPreset, { slot: string; img: string }> = {
  amazon: {
    slot: "flex h-[2.625rem] w-[min(100%,15rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.625rem] max-w-full object-contain object-left opacity-90",
  },
  zooplus: {
    slot: "flex h-11 w-[min(100%,17rem)] shrink-0 items-center justify-start",
    img: "max-h-11 max-w-full object-contain object-left",
  },
  compact: {
    slot: "flex h-6 w-[7rem] max-w-full shrink-0 items-center justify-start",
    img: "max-h-6 max-w-full object-contain object-left",
  },
  default: {
    slot: "flex h-7 w-36 max-w-full shrink-0 items-center justify-start",
    img: "max-h-7 max-w-full object-contain object-left",
  },
  fressnapf: {
    slot: "flex h-[2.25rem] w-[min(100%,14rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.25rem] max-w-full object-contain object-left",
  },
  mediamarktSaturn: {
    slot: "flex h-[2.875rem] w-[min(100%,19rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.875rem] max-w-full object-contain object-left",
  },
  wide: {
    slot: "flex h-8 w-[min(100%,13rem)] shrink-0 items-center justify-start",
    img: "max-h-8 max-w-full object-contain object-left",
  },
};

/** Einheitliche Kachel-Größe wie Otto (kompakt). */
const OTTO_TILE_LOGO = MARKETPLACE_TILE_LOGO.compact;

const MARKETPLACE_TILE_GRID_CLASS = "grid gap-2 sm:grid-cols-2 xl:grid-cols-3";

const MARKETPLACE_TILE_BTN_CLASS =
  "group flex h-full min-h-0 w-full flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md";

const MARKETPLACE_TILE_KPI_GRID_CLASS = "mt-auto grid grid-cols-2 gap-1 pt-2";

function placeholderTileLogoPreset(): Exclude<MarketplaceTileLogoPreset, "amazon"> {
  return "compact";
}

type MarketplaceDetailId =
  | "amazon"
  | (typeof ANALYTICS_MARKETPLACES)[number]["slug"];

const MARKETPLACE_DETAIL_ORDER: MarketplaceDetailId[] = [
  "amazon",
  ...ANALYTICS_MARKETPLACES.map((m) => m.slug),
];

type AmazonSalesPoint = {
  date: string;
  orders: number;
  amount: number;
  units: number;
};

type AmazonSalesCompareResponse = {
  error?: string;
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
  revenueDeltaPct?: number | null;
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
  points?: AmazonSalesPoint[];
  previousPoints?: AmazonSalesPoint[];
};

type OttoSalesCompareResponse = AmazonSalesCompareResponse;
type EbaySalesCompareResponse = AmazonSalesCompareResponse;
type KauflandSalesCompareResponse = AmazonSalesCompareResponse;
type FressnapfSalesCompareResponse = AmazonSalesCompareResponse;
type MmsSalesCompareResponse = AmazonSalesCompareResponse;
type ZooplusSalesCompareResponse = AmazonSalesCompareResponse;
type TiktokSalesCompareResponse = AmazonSalesCompareResponse;
type ShopifySalesCompareResponse = AmazonSalesCompareResponse;

const salesCompareInitMemo = new Map<string, { data: unknown; loading: boolean }>();

/** Einmal pro storagePrefix + Default-Zeitraum: vermeidet doppeltes Lesen von localStorage bei useState. */
function getSalesCompareInitForDefaultPeriod<T extends AmazonSalesCompareResponse>(
  storagePrefix: string
): { data: T | null; loading: boolean } {
  const { from, to } = defaultPeriod();
  const fullKey = `${storagePrefix}:${from}:${to}`;
  const hit = salesCompareInitMemo.get(fullKey);
  if (hit) return hit as { data: T | null; loading: boolean };
  const v = readAnalyticsSalesCompareInitial<T>(fullKey);
  salesCompareInitMemo.set(fullKey, v);
  return v;
}

function formatCurrency(amount: number, currency: string, intlTag: string) {
  return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount || 0);
}

function formatInt(n: number, intlTag: string) {
  return new Intl.NumberFormat(intlTag).format(n ?? 0);
}

function safePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return (part / whole) * 100;
}

function calcYoY(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPercent(value: number | null | undefined, intlTag: string, signed = false): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString(intlTag, { maximumFractionDigits: 1 })} %`;
}

function formatTrendPct(
  revenueDeltaPct: number | null | undefined,
  previousAmount: number,
  currentAmount: number,
  intlTag: string,
  t: (key: string) => string
): { text: string; direction: TrendDirection } {
  if (revenueDeltaPct != null && Number.isFinite(revenueDeltaPct)) {
    if (Math.abs(revenueDeltaPct) < 0.05) {
      return { text: t("analyticsMp.trendFlat"), direction: "flat" };
    }
    const sign = revenueDeltaPct > 0 ? "+" : "";
    return {
      text: `${sign}${revenueDeltaPct.toLocaleString(intlTag, { maximumFractionDigits: 1 })} %`,
      direction: revenueDeltaPct > 0 ? "up" : "down",
    };
  }
  if (previousAmount <= 0 && currentAmount > 0) {
    return { text: t("analyticsMp.trendNew"), direction: "up" };
  }
  return { text: PLACEHOLDER, direction: "unknown" };
}

function TrendIcon({
  direction,
  compact = false,
}: {
  direction: TrendDirection;
  compact?: boolean;
}) {
  const cls = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  if (direction === "up") return <TrendingUp className={cn(cls, "text-emerald-600")} aria-hidden />;
  if (direction === "down") return <TrendingDown className={cn(cls, "text-rose-600")} aria-hidden />;
  return null;
}

function MiniKpi({
  label,
  value,
  trendDirection = "unknown",
  previousValue,
  deltaPct,
  tooltip,
  compact = false,
  className,
}: {
  label: string;
  value: string;
  trendDirection?: TrendDirection;
  /** Vorperiode-Wert (kleine Sub-Zeile). */
  previousValue?: string;
  /** Delta-Prozentwert, z. B. "+12,3 %" oder "−4,1 %". */
  deltaPct?: string;
  /** Erklärungstext als title-Attribut. */
  tooltip?: string;
  /** Kompaktere Darstellung in Marktplatz-Kacheln. */
  compact?: boolean;
  className?: string;
}) {
  const showTrend =
    trendDirection !== "unknown" && trendDirection !== "flat" && value !== PLACEHOLDER;

  // Delta-Farbe: positiv = grün, negativ = rot
  const deltaPctTrimmed = deltaPct?.trim() ?? "";
  const deltaIsPositive = deltaPctTrimmed.startsWith("+") || (/^\d/.test(deltaPctTrimmed) && !deltaPctTrimmed.startsWith("0"));
  const deltaIsNegative = deltaPctTrimmed.startsWith("−") || deltaPctTrimmed.startsWith("-");

  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-background/60",
        compact ? "px-1.5 py-1" : "rounded-lg px-2 py-1.5",
        className
      )}
      title={tooltip}
    >
      <p
        className={cn(
          "font-medium uppercase tracking-wide text-muted-foreground",
          "text-[10px] leading-tight"
        )}
      >
        {label}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        {showTrend ? <TrendIcon compact={compact} direction={trendDirection} /> : null}
        <p
          className={cn(
            "tabular-nums font-semibold tracking-tight text-foreground",
            compact ? "text-xs" : "text-sm",
            showTrend && trendDirection === "up" && "text-emerald-700",
            showTrend && trendDirection === "down" && "text-rose-700"
          )}
        >
          {value}
        </p>
        {deltaPctTrimmed ? (
          <span
            className={cn(
              "ml-auto text-[10px] tabular-nums font-medium",
              deltaIsPositive && "text-emerald-600",
              deltaIsNegative && "text-rose-600",
              !deltaIsPositive && !deltaIsNegative && "text-muted-foreground"
            )}
          >
            {deltaPctTrimmed}
          </span>
        ) : null}
      </div>
      {previousValue ? (
        <p className="mt-0.5 text-[9px] tabular-nums text-muted-foreground">
          Vorperiode: {previousValue}
        </p>
      ) : null}
    </div>
  );
}

type TotalsInput = {
  revenue: number;
  orders: number;
  units: number;
  currency: string;
  prevRevenue: number;
  revenueDeltaPct: number | null | undefined;
};

/** Summiert angebundene Kanäle; Währungsmix wird bewusst nicht aggregiert. */
function buildMarketplaceTotals(
  channels: Array<{
    summary?: AmazonSalesCompareResponse["summary"];
    previousSummary?: AmazonSalesCompareResponse["previousSummary"];
    revenueDeltaPct?: number | null;
  }>
): TotalsInput | null {
  let currency: string | null = null;
  let revenue = 0;
  let orders = 0;
  let units = 0;
  let prevRevenue = 0;

  for (const ch of channels) {
    const s = ch.summary;
    if (!s) continue;
    if (!currency) currency = s.currency;
    if (s.currency !== currency) continue;
    revenue += s.salesAmount;
    orders += s.orderCount;
    units += s.units;
    prevRevenue += ch.previousSummary?.salesAmount ?? 0;
  }

  if (!currency) return null;
  const revenueDeltaPct =
    prevRevenue > 0 ? Number((((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1)) : null;
  return { revenue, orders, units, currency, prevRevenue, revenueDeltaPct };
}

/** Währung für Gesamt-Diagramm: wie KPI-Summe oder erste Kanal-Währung. */
function pickRevenueChartCurrency(
  totals: TotalsInput | null,
  ...responses: (AmazonSalesCompareResponse | null | undefined)[]
): string {
  if (totals?.currency) return totals.currency;
  for (const r of responses) {
    if (r?.summary?.currency) return r.summary.currency;
  }
  return "EUR";
}

function buildReportRow(args: {
  id: string;
  label: string;
  data: AmazonSalesCompareResponse | null;
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
  const previousNetAmount =
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
    previousNet: previousNetAmount,
    feeSource: net?.feeSource ?? "default_percentage",
    returnsSource: net?.returnsSource ?? "none",
    costCoverage: net?.costCoverage ?? "estimated",
  };
}

function PeriodRangePicker({
  periodFrom,
  periodTo,
  onChange,
  dfLocale,
  t,
}: {
  periodFrom: string;
  periodTo: string;
  onChange: (from: string, to: string) => void;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const selected: DateRange = {
    from: parseYmdLocal(periodFrom),
    to: parseYmdLocal(periodTo),
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs font-normal"
            aria-label={t("dates.periodAria")}
          />
        }
      >
        <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
        <span className="max-w-[220px] truncate tabular-nums sm:max-w-none">
          {formatRangeShort(periodFrom, periodTo, dfLocale)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-auto overflow-hidden p-0">
        <Calendar
          mode="range"
          locale={dfLocale}
          numberOfMonths={2}
          className="rounded-lg"
          defaultMonth={parseYmdLocal(periodTo)}
          selected={selected}
          disabled={{ after: new Date() }}
          onSelect={(range) => {
            if (!range?.from || !range?.to) return;
            const from = toYmd(startOfLocalDay(range.from));
            const to = toYmd(startOfLocalDay(range.to));
            if (from > to) return;
            if (inclusiveDayCount(from, to) > MAX_RANGE_DAYS) return;
            onChange(from, to);
            setOpen(false);
          }}
        />
        <p className="border-t border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
          {t("dates.maxRangeHint", { max: String(MAX_RANGE_DAYS) })}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function TotalMarketplacesKpiStrip({
  loading,
  totals,
  revenueLineSeries,
  revenueChartCurrency,
  totalChartDailyOrders,
  totalChartPreviousRevenue,
  totalChartBands,
  periodFrom,
  periodTo,
  onPeriodChange,
  onOpenPromotionDeals,
  onOpenReport,
  onOpenDevReport,
  backgroundSyncing,
  dfLocale,
  intlTag,
  t,
}: {
  loading: boolean;
  totals: TotalsInput | null;
  revenueLineSeries: MarketplaceRevenueLineSeries[];
  revenueChartCurrency: string;
  totalChartDailyOrders: number[];
  totalChartPreviousRevenue: number[] | null;
  totalChartBands: MarketplaceActionBand[];
  periodFrom: string;
  periodTo: string;
  onPeriodChange: (from: string, to: string) => void;
  onOpenPromotionDeals: () => void;
  onOpenReport: () => void;
  onOpenDevReport: () => void;
  backgroundSyncing?: boolean;
  dfLocale: DateFnsLocale;
  intlTag: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const trend = useMemo(() => {
    if (!totals) return { text: PLACEHOLDER, direction: "unknown" as TrendDirection };
    return formatTrendPct(
      totals.revenueDeltaPct,
      totals.prevRevenue,
      totals.revenue,
      intlTag,
      (key) => t(key)
    );
  }, [totals, intlTag, t]);

  const gesamtLabels = useMemo(() => {
    const span = formatRangeShort(periodFrom, periodTo, dfLocale);
    return {
      revenue: t("analyticsMp.totalRevenue", { span }),
      trend: t("analyticsMp.trendVsPrev"),
    };
  }, [periodFrom, periodTo, dfLocale, t]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-card p-3 shadow-sm ring-1 ring-border/30 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="sr-only">{t("analyticsMp.totalTitle")}</h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenPromotionDeals}>
            {t("analyticsMp.promotionsButton")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenReport}>
            Bericht erstellen (PDF)
          </Button>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenDevReport}>
            Entwicklungsbericht
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MarketplaceAnalyticsDataQualityNotice t={t} />
          <PeriodRangePicker
            periodFrom={periodFrom}
            periodTo={periodTo}
            onChange={onPeriodChange}
            dfLocale={dfLocale}
            t={t}
          />
          {backgroundSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("analyticsMp.amazonSyncing")}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
          <div className="h-[min(300px,44vh)] w-full animate-pulse rounded-2xl bg-muted/40" />
        </div>
      ) : (
        <div className="space-y-4">
          {totals ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MiniKpi
                className="border-border/40 bg-gradient-to-br from-primary/5 to-transparent shadow-sm md:col-span-1 md:py-2"
                label={gesamtLabels.revenue}
                value={formatCurrency(totals.revenue, totals.currency, intlTag)}
              />
              <MiniKpi
                className="border-border/40 bg-background/90 shadow-sm md:py-2"
                label={t("analyticsMp.ordersTotal")}
                value={formatInt(totals.orders, intlTag)}
              />
              <MiniKpi
                className="border-border/40 bg-background/90 shadow-sm md:py-2"
                label={t("analyticsMp.unitsTotal")}
                value={formatInt(totals.units, intlTag)}
              />
              <MiniKpi
                className="border-border/40 bg-background/90 shadow-sm md:py-2"
                label={gesamtLabels.trend}
                value={trend.text}
                trendDirection={trend.direction}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MiniKpi
                className="border-border/40 bg-background/90 md:py-2"
                label={gesamtLabels.revenue}
                value={PLACEHOLDER}
              />
              <MiniKpi
                className="border-border/40 bg-background/90 md:py-2"
                label={t("analyticsMp.ordersTotal")}
                value={PLACEHOLDER}
              />
              <MiniKpi
                className="border-border/40 bg-background/90 md:py-2"
                label={t("analyticsMp.unitsTotal")}
                value={PLACEHOLDER}
              />
              <MiniKpi
                className="border-border/40 bg-background/90 md:py-2"
                label={gesamtLabels.trend}
                value={PLACEHOLDER}
              />
            </div>
          )}
          <MarketplaceTotalRevenueLinesChart
            periodFrom={periodFrom}
            periodTo={periodTo}
            series={revenueLineSeries}
            dailyOrders={totalChartDailyOrders}
            previousRevenue={totalChartPreviousRevenue}
            displayCurrency={revenueChartCurrency}
            intlTag={intlTag}
            dfLocale={dfLocale}
            formatCurrency={(amount, currency) => formatCurrency(amount, currency, intlTag)}
            formatInt={(n) => formatInt(n, intlTag)}
            emptyLabel={t("analyticsMp.totalRevenueChartEmpty")}
            ordersLabel={t("analyticsChart.ordersPerDay")}
            prevPeriodLabel={t("analyticsChart.prevPeriodLine")}
            currentPeriodDayTotalLabel={t("analyticsChart.tooltipDayTotalRevenue")}
            bands={totalChartBands}
          />
        </div>
      )}
    </section>
  );
}

function MarketplaceDetailDialog({
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

function PlaceholderTile({
  label,
  logo,
  onOpenDetail,
  t,
}: {
  label: string;
  logo: string;
  onOpenDetail: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { slot, img } = MARKETPLACE_TILE_LOGO[placeholderTileLogoPreset()];
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={MARKETPLACE_TILE_BTN_CLASS}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className={slot}>
            <MarketplaceBrandImg src={logo} alt={label} className={img} />
          </div>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>

      <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
        <MiniKpi compact label={t("analyticsMp.revenue7d")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.orders")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.units")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.tileTrend")} value={PLACEHOLDER} />
      </div>
    </button>
  );
}

function AnalyticsMarketplacesPage() {
  const { t, locale } = useTranslation();
  const dfLocale = getDateFnsLocale(locale);
  const intlTag = intlLocaleTag(locale);

  const [period, setPeriod] = useState(defaultPeriod);
  const [amazonData, setAmazonData] = useState<AmazonSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<AmazonSalesCompareResponse>("analytics_amazon_sales_compare_v1").data
  );
  const [amazonLoading, setAmazonLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<AmazonSalesCompareResponse>("analytics_amazon_sales_compare_v1").loading
  );
  const [amazonBackgroundSyncing, setAmazonBackgroundSyncing] = useState(false);
  const [amazonError, setAmazonError] = useState<string | null>(null);
  const [ebayData, setEbayData] = useState<EbaySalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<EbaySalesCompareResponse>("analytics_ebay_sales_compare_v1").data
  );
  const [ebayLoading, setEbayLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<EbaySalesCompareResponse>("analytics_ebay_sales_compare_v1").loading
  );
  const [ebayBackgroundSyncing, setEbayBackgroundSyncing] = useState(false);
  const [ebayError, setEbayError] = useState<string | null>(null);
  const [ottoData, setOttoData] = useState<OttoSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<OttoSalesCompareResponse>("analytics_otto_sales_compare_v1").data
  );
  const [ottoLoading, setOttoLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<OttoSalesCompareResponse>("analytics_otto_sales_compare_v1").loading
  );
  const [ottoBackgroundSyncing, setOttoBackgroundSyncing] = useState(false);
  const [ottoError, setOttoError] = useState<string | null>(null);
  const [kauflandData, setKauflandData] = useState<KauflandSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<KauflandSalesCompareResponse>("analytics_kaufland_sales_compare_v1").data
  );
  const [kauflandLoading, setKauflandLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<KauflandSalesCompareResponse>("analytics_kaufland_sales_compare_v1").loading
  );
  const [kauflandBackgroundSyncing, setKauflandBackgroundSyncing] = useState(false);
  const [kauflandError, setKauflandError] = useState<string | null>(null);
  const [fressnapfData, setFressnapfData] = useState<FressnapfSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<FressnapfSalesCompareResponse>("analytics_fressnapf_sales_compare_v1").data
  );
  const [fressnapfLoading, setFressnapfLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<FressnapfSalesCompareResponse>("analytics_fressnapf_sales_compare_v1").loading
  );
  const [fressnapfBackgroundSyncing, setFressnapfBackgroundSyncing] = useState(false);
  const [fressnapfError, setFressnapfError] = useState<string | null>(null);
  const [mmsData, setMmsData] = useState<MmsSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<MmsSalesCompareResponse>("analytics_mms_sales_compare_v1").data
  );
  const [mmsLoading, setMmsLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<MmsSalesCompareResponse>("analytics_mms_sales_compare_v1").loading
  );
  const [mmsBackgroundSyncing, setMmsBackgroundSyncing] = useState(false);
  const [mmsError, setMmsError] = useState<string | null>(null);
  const [zooplusData, setZooplusData] = useState<ZooplusSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<ZooplusSalesCompareResponse>("analytics_zooplus_sales_compare_v1").data
  );
  const [zooplusLoading, setZooplusLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<ZooplusSalesCompareResponse>("analytics_zooplus_sales_compare_v1").loading
  );
  const [zooplusBackgroundSyncing, setZooplusBackgroundSyncing] = useState(false);
  const [zooplusError, setZooplusError] = useState<string | null>(null);
  const [tiktokData, setTiktokData] = useState<TiktokSalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<TiktokSalesCompareResponse>("analytics_tiktok_sales_compare_v1").data
  );
  const [tiktokLoading, setTiktokLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<TiktokSalesCompareResponse>("analytics_tiktok_sales_compare_v1").loading
  );
  const [tiktokBackgroundSyncing, setTiktokBackgroundSyncing] = useState(false);
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [shopifyData, setShopifyData] = useState<ShopifySalesCompareResponse | null>(() =>
    getSalesCompareInitForDefaultPeriod<ShopifySalesCompareResponse>("analytics_shopify_sales_compare_v1").data
  );
  const [shopifyLoading, setShopifyLoading] = useState(
    () => getSalesCompareInitForDefaultPeriod<ShopifySalesCompareResponse>("analytics_shopify_sales_compare_v1").loading
  );
  const [shopifyBackgroundSyncing, setShopifyBackgroundSyncing] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [analyticsHasMounted, setAnalyticsHasMounted] = useState(false);
  const [ebaySalesEnabled, setEbaySalesEnabled] = useState(true);
  const [tiktokSalesEnabled, setTiktokSalesEnabled] = useState(true);
  const [forceUnblockTotalStrip, setForceUnblockTotalStrip] = useState(false);
  const periodRef = useRef(period);
  const amazonRequestInFlightRef = useRef(false);

  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = "analytics_marketplaces_sales_config_status_v1";
    const CACHE_TTL_MS = 5 * 60 * 1000;

    const applyPayload = (payload: {
      ebay?: { configured?: boolean };
      tiktok?: { configured?: boolean };
    }) => {
      if (payload.ebay?.configured === false) setEbaySalesEnabled(false);
      if (payload.tiktok?.configured === false) setTiktokSalesEnabled(false);
    };

    try {
      const cachedRaw = window.sessionStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as {
          at: number;
          payload: { ebay?: { configured?: boolean }; tiktok?: { configured?: boolean } };
        };
        if (cached && typeof cached.at === "number" && Date.now() - cached.at < CACHE_TTL_MS) {
          applyPayload(cached.payload);
          return () => {
            cancelled = true;
          };
        }
      }
    } catch {
      // ignore cache read errors
    }

    void fetch("/api/marketplaces/sales-config-status", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const payload = (await res.json()) as {
          ebay?: { configured?: boolean };
          tiktok?: { configured?: boolean };
        };
        return payload;
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        applyPayload(payload);
        try {
          window.sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ at: Date.now(), payload })
          );
        } catch {
          // ignore cache write errors (quota, privacy mode)
        }
      })
      .catch(() => {
        // Bei Fehlern alle Kanaele aktiv lassen, um keine falschen Deaktivierungen auszulösen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setForceUnblockTotalStrip(false);
    const id = window.setTimeout(() => {
      setForceUnblockTotalStrip(true);
    }, TOTAL_STRIP_MAX_BLOCK_MS);
    return () => window.clearTimeout(id);
  }, [period.from, period.to]);

  const loadAmazonSales = useCallback(async (forceRefresh = false, silent = false) => {
    if (amazonRequestInFlightRef.current) {
      return;
    }
    amazonRequestInFlightRef.current = true;
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_amazon_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & AmazonSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setAmazonData(data);
        hadCache = true;
        setAmazonLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setAmazonLoading(true);
    } else if (!hadCache && !silent) {
      setAmazonLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setAmazonBackgroundSyncing(true);
    }

    if (!silent) {
      setAmazonError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<AmazonSalesCompareResponse>(
        `/api/amazon/sales?${params}`,
        t("analyticsMp.amazonMetricsError"),
        AMAZON_FETCH_TIMEOUT_MS
      );
      setAmazonData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Amazon] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setAmazonError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setAmazonLoading(false);
      }
      if (showBackgroundIndicator) {
        setAmazonBackgroundSyncing(false);
      }
      amazonRequestInFlightRef.current = false;
    }
  }, [t]);

  const loadEbaySales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_ebay_sales_compare_v1:${from}:${to}`;
    let hadCache = false;
    if (!ebaySalesEnabled) {
      setEbayLoading(false);
      setEbayBackgroundSyncing(false);
      if (!silent) {
        setEbayError("eBay ist aktuell deaktiviert oder nicht konfiguriert.");
      }
      return;
    }

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & EbaySalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setEbayData(data);
        hadCache = true;
        setEbayLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setEbayLoading(true);
    } else if (!hadCache && !silent) {
      setEbayLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setEbayBackgroundSyncing(true);
    }

    if (!silent) {
      setEbayError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<EbaySalesCompareResponse>(
        `/api/ebay/sales?${params}`,
        t("analyticsMp.ebayMetricsError")
      );
      setEbayData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics eBay] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setEbayError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setEbayLoading(false);
      }
      if (showBackgroundIndicator) {
        setEbayBackgroundSyncing(false);
      }
    }
  }, [ebaySalesEnabled, t]);

  const loadOttoSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_otto_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & OttoSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setOttoData(data);
        hadCache = true;
        setOttoLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setOttoLoading(true);
    } else if (!hadCache && !silent) {
      setOttoLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setOttoBackgroundSyncing(true);
    }

    if (!silent) {
      setOttoError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<OttoSalesCompareResponse>(
        `/api/otto/sales?${params}`,
        t("analyticsMp.ottoMetricsError")
      );
      setOttoData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Otto] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setOttoError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setOttoLoading(false);
      }
      if (showBackgroundIndicator) {
        setOttoBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadKauflandSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_kaufland_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & KauflandSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setKauflandData(data);
        hadCache = true;
        setKauflandLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setKauflandLoading(true);
    } else if (!hadCache && !silent) {
      setKauflandLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setKauflandBackgroundSyncing(true);
    }

    if (!silent) {
      setKauflandError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<KauflandSalesCompareResponse>(
        `/api/kaufland/sales?${params}`,
        t("analyticsMp.kauflandMetricsError")
      );
      setKauflandData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Kaufland] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setKauflandError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setKauflandLoading(false);
      }
      if (showBackgroundIndicator) {
        setKauflandBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadFressnapfSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_fressnapf_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & FressnapfSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setFressnapfData(data);
        hadCache = true;
        setFressnapfLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setFressnapfLoading(true);
    } else if (!hadCache && !silent) {
      setFressnapfLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setFressnapfBackgroundSyncing(true);
    }

    if (!silent) {
      setFressnapfError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<FressnapfSalesCompareResponse>(
        `/api/fressnapf/sales?${params}`,
        t("analyticsMp.fressnapfMetricsError")
      );
      setFressnapfData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Fressnapf] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setFressnapfError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setFressnapfLoading(false);
      }
      if (showBackgroundIndicator) {
        setFressnapfBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadMmsSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_mms_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & MmsSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setMmsData(data);
        hadCache = true;
        setMmsLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setMmsLoading(true);
    } else if (!hadCache && !silent) {
      setMmsLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setMmsBackgroundSyncing(true);
    }

    if (!silent) {
      setMmsError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<MmsSalesCompareResponse>(
        `/api/mediamarkt-saturn/sales?${params}`,
        t("analyticsMp.mmsMetricsError")
      );
      setMmsData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics MMS] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setMmsError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setMmsLoading(false);
      }
      if (showBackgroundIndicator) {
        setMmsBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadZooplusSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_zooplus_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & ZooplusSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setZooplusData(data);
        hadCache = true;
        setZooplusLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setZooplusLoading(true);
    } else if (!hadCache && !silent) {
      setZooplusLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setZooplusBackgroundSyncing(true);
    }

    if (!silent) {
      setZooplusError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<ZooplusSalesCompareResponse>(
        `/api/zooplus/sales?${params}`,
        t("analyticsMp.zooplusMetricsError")
      );
      setZooplusData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics ZooPlus] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setZooplusError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setZooplusLoading(false);
      }
      if (showBackgroundIndicator) {
        setZooplusBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadTiktokSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_tiktok_sales_compare_v1:${from}:${to}`;
    let hadCache = false;
    if (!tiktokSalesEnabled) {
      setTiktokLoading(false);
      setTiktokBackgroundSyncing(false);
      if (!silent) {
        setTiktokError("TikTok ist aktuell deaktiviert oder nicht konfiguriert.");
      }
      return;
    }

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & TiktokSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setTiktokData(data);
        hadCache = true;
        setTiktokLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setTiktokLoading(true);
    } else if (!hadCache && !silent) {
      setTiktokLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setTiktokBackgroundSyncing(true);
    }

    if (!silent) {
      setTiktokError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<TiktokSalesCompareResponse>(
        `/api/tiktok/sales?${params}`,
        t("analyticsMp.tiktokMetricsError")
      );
      setTiktokData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics TikTok] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setTiktokError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setTiktokLoading(false);
      }
      if (showBackgroundIndicator) {
        setTiktokBackgroundSyncing(false);
      }
    }
  }, [t, tiktokSalesEnabled]);

  const loadShopifySales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_shopify_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & ShopifySalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const data = parsed;
        setShopifyData(data);
        hadCache = true;
        setShopifyLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setShopifyLoading(true);
    } else if (!hadCache && !silent) {
      setShopifyLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setShopifyBackgroundSyncing(true);
    }

    if (!silent) {
      setShopifyError(null);
    }

    try {
      const params = new URLSearchParams({
        compare: "true",
        compareMode: "yoy",
        from,
        to,
      });
      const payload = await fetchSalesCompareWithTimeout<ShopifySalesCompareResponse>(
        `/api/shopify/sales?${params}`,
        t("analyticsMp.shopifyMetricsError")
      );
      setShopifyData(payload);
      writeLocalJsonCache(cacheKey, { savedAt: Date.now(), ...payload });
    } catch (e) {
      if (silent) {
        console.warn("[Analytics Shopify] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setShopifyError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setShopifyLoading(false);
      }
      if (showBackgroundIndicator) {
        setShopifyBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadAmazonSalesRef = useRef(loadAmazonSales);
  loadAmazonSalesRef.current = loadAmazonSales;
  const loadEbaySalesRef = useRef(loadEbaySales);
  loadEbaySalesRef.current = loadEbaySales;
  const loadOttoSalesRef = useRef(loadOttoSales);
  loadOttoSalesRef.current = loadOttoSales;
  const loadKauflandSalesRef = useRef(loadKauflandSales);
  loadKauflandSalesRef.current = loadKauflandSales;
  const loadFressnapfSalesRef = useRef(loadFressnapfSales);
  loadFressnapfSalesRef.current = loadFressnapfSales;
  const loadMmsSalesRef = useRef(loadMmsSales);
  loadMmsSalesRef.current = loadMmsSales;
  const loadZooplusSalesRef = useRef(loadZooplusSales);
  loadZooplusSalesRef.current = loadZooplusSales;
  const loadTiktokSalesRef = useRef(loadTiktokSales);
  loadTiktokSalesRef.current = loadTiktokSales;
  const loadShopifySalesRef = useRef(loadShopifySales);
  loadShopifySalesRef.current = loadShopifySales;

  useEffect(() => {
    let cancelled = false;
    const loaders = [
      loadAmazonSalesRef,
      loadEbaySalesRef,
      loadOttoSalesRef,
      loadKauflandSalesRef,
      loadFressnapfSalesRef,
      loadMmsSalesRef,
      loadZooplusSalesRef,
      loadTiktokSalesRef,
      loadShopifySalesRef,
    ];
    const CONCURRENCY = 3;
    (async () => {
      let i = 0;
      const worker = async () => {
        while (!cancelled) {
          const idx = i++;
          if (idx >= loaders.length) return;
          try {
            await loaders[idx].current(false, false);
          } catch {
            // per-loader errors are surfaced inside each loader
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, loaders.length) }, () => worker())
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to]);

  useEffect(() => {
    setAnalyticsHasMounted(true);
  }, []);

  useEffect(() => {
    if (!analyticsHasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      const loaders = [
        loadAmazonSalesRef,
        loadEbaySalesRef,
        loadOttoSalesRef,
        loadKauflandSalesRef,
        loadFressnapfSalesRef,
        loadMmsSalesRef,
        loadZooplusSalesRef,
        loadTiktokSalesRef,
        loadShopifySalesRef,
      ];
      const CONCURRENCY = 3;
      let i = 0;
      const worker = async () => {
        while (true) {
          const idx = i++;
          if (idx >= loaders.length) return;
          try {
            await loaders[idx].current(false, true);
          } catch {
            // surfaced per loader
          }
        }
      };
      void Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, loaders.length) }, () => worker())
      );
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [analyticsHasMounted]);

  const summary = amazonData?.summary;
  const prev = amazonData?.previousSummary;
  const trend = summary
    ? formatTrendPct(
        amazonData?.revenueDeltaPct,
        prev?.salesAmount ?? 0,
        summary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const ebaySummary = ebayData?.summary;
  const ebayPrev = ebayData?.previousSummary;
  const ebayTrend = ebaySummary
    ? formatTrendPct(
        ebayData?.revenueDeltaPct,
        ebayPrev?.salesAmount ?? 0,
        ebaySummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const ottoSummary = ottoData?.summary;
  const ottoPrev = ottoData?.previousSummary;
  const ottoTrend = ottoSummary
    ? formatTrendPct(
        ottoData?.revenueDeltaPct,
        ottoPrev?.salesAmount ?? 0,
        ottoSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const kauflandSummary = kauflandData?.summary;
  const kauflandPrev = kauflandData?.previousSummary;
  const kauflandTrend = kauflandSummary
    ? formatTrendPct(
        kauflandData?.revenueDeltaPct,
        kauflandPrev?.salesAmount ?? 0,
        kauflandSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const fressnapfSummary = fressnapfData?.summary;
  const fressnapfPrev = fressnapfData?.previousSummary;
  const fressnapfTrend = fressnapfSummary
    ? formatTrendPct(
        fressnapfData?.revenueDeltaPct,
        fressnapfPrev?.salesAmount ?? 0,
        fressnapfSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const mmsSummary = mmsData?.summary;
  const mmsPrev = mmsData?.previousSummary;
  const mmsTrend = mmsSummary
    ? formatTrendPct(
        mmsData?.revenueDeltaPct,
        mmsPrev?.salesAmount ?? 0,
        mmsSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const zooplusSummary = zooplusData?.summary;
  const zooplusPrev = zooplusData?.previousSummary;
  const zooplusTrend = zooplusSummary
    ? formatTrendPct(
        zooplusData?.revenueDeltaPct,
        zooplusPrev?.salesAmount ?? 0,
        zooplusSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const tiktokSummary = tiktokData?.summary;
  const tiktokPrev = tiktokData?.previousSummary;
  const tiktokTrend = tiktokSummary
    ? formatTrendPct(
        tiktokData?.revenueDeltaPct,
        tiktokPrev?.salesAmount ?? 0,
        tiktokSummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const shopifySummary = shopifyData?.summary;
  const shopifyPrev = shopifyData?.previousSummary;
  const shopifyTrend = shopifySummary
    ? formatTrendPct(
        shopifyData?.revenueDeltaPct,
        shopifyPrev?.salesAmount ?? 0,
        shopifySummary.salesAmount,
        intlTag,
        (key) => t(key)
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const totals = useMemo(
    () =>
      buildMarketplaceTotals([
        {
          summary: amazonData?.summary,
          previousSummary: amazonData?.previousSummary,
          revenueDeltaPct: amazonData?.revenueDeltaPct,
        },
        {
          summary: ebayData?.summary,
          previousSummary: ebayData?.previousSummary,
          revenueDeltaPct: ebayData?.revenueDeltaPct,
        },
        {
          summary: ottoData?.summary,
          previousSummary: ottoData?.previousSummary,
          revenueDeltaPct: ottoData?.revenueDeltaPct,
        },
        {
          summary: kauflandData?.summary,
          previousSummary: kauflandData?.previousSummary,
          revenueDeltaPct: kauflandData?.revenueDeltaPct,
        },
        {
          summary: fressnapfData?.summary,
          previousSummary: fressnapfData?.previousSummary,
          revenueDeltaPct: fressnapfData?.revenueDeltaPct,
        },
        {
          summary: mmsData?.summary,
          previousSummary: mmsData?.previousSummary,
          revenueDeltaPct: mmsData?.revenueDeltaPct,
        },
        {
          summary: zooplusData?.summary,
          previousSummary: zooplusData?.previousSummary,
          revenueDeltaPct: zooplusData?.revenueDeltaPct,
        },
        {
          summary: tiktokData?.summary,
          previousSummary: tiktokData?.previousSummary,
          revenueDeltaPct: tiktokData?.revenueDeltaPct,
        },
        {
          summary: shopifyData?.summary,
          previousSummary: shopifyData?.previousSummary,
          revenueDeltaPct: shopifyData?.revenueDeltaPct,
        },
      ]),
    [amazonData, ebayData, ottoData, kauflandData, fressnapfData, mmsData, zooplusData, tiktokData, shopifyData]
  );

  const anySalesLoading = useMemo(
    () =>
      amazonLoading ||
      ebayLoading ||
      ottoLoading ||
      kauflandLoading ||
      fressnapfLoading ||
      mmsLoading ||
      zooplusLoading ||
      tiktokLoading ||
      shopifyLoading,
    [
      amazonLoading,
      ebayLoading,
      ottoLoading,
      kauflandLoading,
      fressnapfLoading,
      mmsLoading,
      zooplusLoading,
      tiktokLoading,
      shopifyLoading,
    ]
  );

  const hasAnyMarketplaceSummary = useMemo(
    () =>
      !!(
        amazonData?.summary ||
        ebayData?.summary ||
        ottoData?.summary ||
        kauflandData?.summary ||
        fressnapfData?.summary ||
        mmsData?.summary ||
        zooplusData?.summary ||
        tiktokData?.summary ||
        shopifyData?.summary
      ),
    [
      amazonData,
      ebayData,
      ottoData,
      kauflandData,
      fressnapfData,
      mmsData,
      zooplusData,
      tiktokData,
      shopifyData,
    ]
  );

  /** Skeleton nur beim allerersten Laden ohne irgendeine Kanal-Summary; sonst alte Werte bis zum Replace. */
  const totalStripBlocking = anySalesLoading && !hasAnyMarketplaceSummary && !forceUnblockTotalStrip;

  const stripBackgroundSyncing =
    amazonBackgroundSyncing ||
    ebayBackgroundSyncing ||
    ottoBackgroundSyncing ||
    kauflandBackgroundSyncing ||
    fressnapfBackgroundSyncing ||
    mmsBackgroundSyncing ||
    zooplusBackgroundSyncing ||
    tiktokBackgroundSyncing ||
    shopifyBackgroundSyncing ||
    (anySalesLoading && hasAnyMarketplaceSummary);

  const revenueChartCurrency = useMemo(
    () =>
      pickRevenueChartCurrency(
        totals,
        amazonData,
        ebayData,
        ottoData,
        kauflandData,
        fressnapfData,
        mmsData,
        zooplusData,
        tiktokData,
        shopifyData
      ),
    [
      totals,
      amazonData,
      ebayData,
      ottoData,
      kauflandData,
      fressnapfData,
      mmsData,
      zooplusData,
      tiktokData,
      shopifyData,
    ]
  );

  const revenueLineSeries = useMemo((): MarketplaceRevenueLineSeries[] => {
    const ref = revenueChartCurrency;
    const pts = (data: AmazonSalesCompareResponse | null | undefined) =>
      data?.summary?.currency === ref ? data.points ?? [] : [];
    const out: MarketplaceRevenueLineSeries[] = [
      {
        id: "amazon",
        dataKey: "amazon",
        label: "Amazon",
        color: MARKETPLACE_REVENUE_LINE_COLORS.amazon,
        points: pts(amazonData),
      },
    ];
    const slugList = [
      "ebay",
      "otto",
      "kaufland",
      "fressnapf",
      "mediamarkt-saturn",
      "zooplus",
      "tiktok",
      "shopify",
    ] as const;
    for (const slug of slugList) {
      const mp = getMarketplaceBySlug(slug);
      const data =
        slug === "ebay"
          ? ebayData
          : slug === "otto"
          ? ottoData
          : slug === "kaufland"
            ? kauflandData
            : slug === "fressnapf"
              ? fressnapfData
              : slug === "mediamarkt-saturn"
                ? mmsData
                : slug === "zooplus"
                  ? zooplusData
                  : slug === "tiktok"
                    ? tiktokData
                    : shopifyData;
      out.push({
        id: slug,
        dataKey: slug,
        label: mp?.label ?? slug,
        color: MARKETPLACE_REVENUE_LINE_COLORS[slug] ?? "#64748b",
        points: pts(data),
      });
    }
    return out;
  }, [
    revenueChartCurrency,
    amazonData,
    ebayData,
    ottoData,
    kauflandData,
    fressnapfData,
    mmsData,
    zooplusData,
    tiktokData,
    shopifyData,
  ]);

  const totalChartDailyOrdersAndPrev = useMemo(() => {
    const dates = enumerateYmd(period.from, period.to);
    const ref = revenueChartCurrency;
    const channels: (AmazonSalesCompareResponse | null | undefined)[] = [
      amazonData,
      ebayData,
      ottoData,
      kauflandData,
      fressnapfData,
      mmsData,
      zooplusData,
      tiktokData,
      shopifyData,
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
  }, [
    period.from,
    period.to,
    revenueChartCurrency,
    amazonData,
    ebayData,
    ottoData,
    kauflandData,
    fressnapfData,
    mmsData,
    zooplusData,
    tiktokData,
    shopifyData,
  ]);

  const amazonLogo = MARKETPLACE_TILE_LOGO.amazon;
  const periodKpis = useMemo(
    () => kpiLabelsForPeriod(period.from, period.to, dfLocale, t),
    [period.from, period.to, dfLocale, t]
  );
  const reportRows = useMemo<MarketplaceReportRow[]>(
    () => [
      buildReportRow({ id: "amazon", label: "Amazon", data: amazonData }),
      buildReportRow({ id: "ebay", label: "eBay", data: ebayData }),
      buildReportRow({ id: "otto", label: "Otto", data: ottoData }),
      buildReportRow({ id: "kaufland", label: "Kaufland", data: kauflandData }),
      buildReportRow({ id: "fressnapf", label: "Fressnapf", data: fressnapfData }),
      buildReportRow({ id: "mediamarkt-saturn", label: "MediaMarkt Saturn", data: mmsData }),
      buildReportRow({ id: "zooplus", label: "Zooplus", data: zooplusData }),
      buildReportRow({ id: "tiktok", label: "TikTok Shop", data: tiktokData }),
      buildReportRow({ id: "shopify", label: "Shopify", data: shopifyData }),
    ],
    [amazonData, ebayData, ottoData, kauflandData, fressnapfData, mmsData, zooplusData, tiktokData, shopifyData]
  );
  const netSummary = useMemo(() => {
    if (!totals) return null;
    const sameCurrencyRows = reportRows.filter((row) => row.currency === totals.currency);
    const current = {
      revenue: sameCurrencyRows.reduce((sum, row) => sum + row.currentRevenue, 0),
      orders: sameCurrencyRows.reduce((sum, row) => sum + row.currentOrders, 0),
      units: sameCurrencyRows.reduce((sum, row) => sum + row.currentUnits, 0),
      returnedAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentReturned, 0),
      cancelledAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentCancelled, 0),
      returnsAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentReturns, 0),
      feesAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentFees, 0),
      adSpendAmount: sameCurrencyRows.reduce((sum, row) => sum + row.currentAds, 0),
    };
    const previous = {
      revenue: sameCurrencyRows.reduce((sum, row) => sum + row.previousRevenue, 0),
      orders: sameCurrencyRows.reduce((sum, row) => sum + row.previousOrders, 0),
      units: sameCurrencyRows.reduce((sum, row) => sum + row.previousUnits, 0),
      returnedAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousReturned, 0),
      cancelledAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousCancelled, 0),
      returnsAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousReturns, 0),
      feesAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousFees, 0),
      adSpendAmount: sameCurrencyRows.reduce((sum, row) => sum + row.previousAds, 0),
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

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIndex, setDetailIndex] = useState(0);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [devReportOpen, setDevReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState<"all" | "single" | "selected">("all");
  const [reportMarketplaceId, setReportMarketplaceId] = useState<string>("amazon");
  const [reportSelectedIds, setReportSelectedIds] = useState<string[]>([
    "amazon",
    "ebay",
    "otto",
    "kaufland",
    "fressnapf",
    "mediamarkt-saturn",
    "zooplus",
    "tiktok",
    "shopify",
  ]);
  const { deals: promotionDeals, persist: persistPromotionDeals, remoteError: promotionRemoteError } =
    usePromotionDeals();
  const activeReportRows = useMemo(
    () => {
      if (reportMode === "single") {
        return reportRows.filter((row) => row.id === reportMarketplaceId);
      }
      if (reportMode === "selected") {
        const rows = reportRows.filter((row) => reportSelectedIds.includes(row.id));
        return rows.length > 0 ? rows : reportRows;
      }
      return reportRows;
    },
    [reportMode, reportMarketplaceId, reportRows, reportSelectedIds]
  );

  const totalChartBands = useMemo(() => bandsForTotalChart(promotionDeals), [promotionDeals]);

  const stepDetail = useCallback((delta: -1 | 1) => {
    setDetailIndex(
      (i) => (i + delta + MARKETPLACE_DETAIL_ORDER.length) % MARKETPLACE_DETAIL_ORDER.length
    );
  }, []);

  const openDetailAt = useCallback((id: MarketplaceDetailId) => {
    const idx = MARKETPLACE_DETAIL_ORDER.indexOf(id);
    setDetailIndex(idx >= 0 ? idx : 0);
    setDetailOpen(true);
  }, []);
  const printReport = useCallback(() => {
    const html = buildMarketplaceReportHtml({
      periodFrom: period.from,
      periodTo: period.to,
      mode: reportMode,
      rows: activeReportRows,
      intlTag,
    });
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      const triggerPrint = () => {
        popup.focus();
        popup.print();
      };
      popup.addEventListener("load", triggerPrint, { once: true });
      window.setTimeout(triggerPrint, 350);
      return;
    }

    // Fallback für Browser/Settings mit Popup-Blockern.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 700);
    };
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    };
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    }, 400);
  }, [period.from, period.to, reportMode, activeReportRows, intlTag]);

  return (
    <div className="space-y-4 text-sm leading-snug">
      <TotalMarketplacesKpiStrip
        loading={totalStripBlocking}
        totals={totals}
        revenueLineSeries={revenueLineSeries}
        revenueChartCurrency={revenueChartCurrency}
        totalChartDailyOrders={totalChartDailyOrdersAndPrev.dailyOrders}
        totalChartPreviousRevenue={totalChartDailyOrdersAndPrev.previousRevenue}
        totalChartBands={totalChartBands}
        periodFrom={period.from}
        periodTo={period.to}
        onPeriodChange={(from, to) => setPeriod({ from, to })}
        onOpenPromotionDeals={() => setPromotionsOpen(true)}
        onOpenReport={() => setReportOpen(true)}
        onOpenDevReport={() => setDevReportOpen(true)}
        backgroundSyncing={stripBackgroundSyncing}
        dfLocale={dfLocale}
        intlTag={intlTag}
        t={t}
      />
      <section className="overflow-hidden rounded-2xl border border-border/50 bg-card p-3 shadow-sm ring-1 ring-border/30 md:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Umsatz, Kosten und Netto</h2>
          <p className="text-[11px] text-muted-foreground">
            Vergleich: gleicher Zeitraum im Vorjahr
          </p>
        </div>
        {netSummary ? (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Netto-Marge</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatPercent(safePercent(netSummary.currentNet, netSummary.current.revenue), intlTag)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  YoY {formatPercent(calcYoY(netSummary.currentNet, netSummary.previousNet), intlTag, true)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Retourenquote</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatPercent(
                    safePercent(netSummary.current.returnsAmount, netSummary.current.revenue),
                    intlTag
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  YoY{" "}
                  {formatPercent(
                    calcYoY(
                      safePercent(netSummary.current.returnsAmount, netSummary.current.revenue) ?? 0,
                      safePercent(netSummary.previous.returnsAmount, netSummary.previous.revenue) ?? 0
                    ),
                    intlTag,
                    true
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AOV (Ø Bestellwert)</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(
                    netSummary.current.orders > 0
                      ? netSummary.current.revenue / netSummary.current.orders
                      : 0,
                    netSummary.currency,
                    intlTag
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  YoY{" "}
                  {formatPercent(
                    calcYoY(
                      netSummary.current.orders > 0
                        ? netSummary.current.revenue / netSummary.current.orders
                        : 0,
                      netSummary.previous.orders > 0
                        ? netSummary.previous.revenue / netSummary.previous.orders
                        : 0
                    ),
                    intlTag,
                    true
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Netto je Bestellung</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(
                    netSummary.current.orders > 0 ? netSummary.currentNet / netSummary.current.orders : 0,
                    netSummary.currency,
                    intlTag
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  YoY{" "}
                  {formatPercent(
                    calcYoY(
                      netSummary.current.orders > 0 ? netSummary.currentNet / netSummary.current.orders : 0,
                      netSummary.previous.orders > 0 ? netSummary.previousNet / netSummary.previous.orders : 0
                    ),
                    intlTag,
                    true
                  )}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kennzahl</TableHead>
                    <TableHead className="text-right">Aktueller Zeitraum</TableHead>
                    <TableHead className="text-right">Vorjahr</TableHead>
                    <TableHead className="text-right">YoY</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Umsatz</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.revenue, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.revenue, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.revenue, netSummary.previous.revenue), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Retouren</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.returnsAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.returnsAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.returnsAmount, netSummary.previous.returnsAmount), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">- returned</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.returnedAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.returnedAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.returnedAmount, netSummary.previous.returnedAmount), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">- cancelled</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.cancelledAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.cancelledAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.cancelledAmount, netSummary.previous.cancelledAmount), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Marktplatzgebuehren</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.feesAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.feesAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.feesAmount, netSummary.previous.feesAmount), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Anzeigenkosten</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.adSpendAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.adSpendAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.adSpendAmount, netSummary.previous.adSpendAmount), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Bestellungen</TableCell>
                    <TableCell className="text-right">{formatInt(netSummary.current.orders, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatInt(netSummary.previous.orders, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatPercent(calcYoY(netSummary.current.orders, netSummary.previous.orders), intlTag, true)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Ø Bestellwert (AOV)</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        netSummary.current.orders > 0 ? netSummary.current.revenue / netSummary.current.orders : 0,
                        netSummary.currency,
                        intlTag
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        netSummary.previous.orders > 0
                          ? netSummary.previous.revenue / netSummary.previous.orders
                          : 0,
                        netSummary.currency,
                        intlTag
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(
                        calcYoY(
                          netSummary.current.orders > 0
                            ? netSummary.current.revenue / netSummary.current.orders
                            : 0,
                          netSummary.previous.orders > 0
                            ? netSummary.previous.revenue / netSummary.previous.orders
                            : 0
                        ),
                        intlTag,
                        true
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Netto-Marge</TableCell>
                    <TableCell className="text-right">
                      {formatPercent(safePercent(netSummary.currentNet, netSummary.current.revenue), intlTag)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(safePercent(netSummary.previousNet, netSummary.previous.revenue), intlTag)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(
                        calcYoY(
                          safePercent(netSummary.currentNet, netSummary.current.revenue) ?? 0,
                          safePercent(netSummary.previousNet, netSummary.previous.revenue) ?? 0
                        ),
                        intlTag,
                        true
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Netto</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(netSummary.currentNet, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(netSummary.previousNet, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatPercent(calcYoY(netSummary.currentNet, netSummary.previousNet), intlTag, true)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">{netSummary.note}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Noch keine Marktplatzdaten fuer die Netto-Aufstellung verfuegbar.</p>
        )}
      </section>

      <MarketplaceDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        index={detailIndex}
        onStep={stepDetail}
        periodFrom={period.from}
        periodTo={period.to}
        amazonLoading={amazonLoading}
        amazonError={amazonError}
        amazonSummary={summary}
        amazonPreviousSummary={prev}
        amazonTrend={trend}
        amazonPoints={amazonData?.points ?? []}
        amazonPreviousPoints={amazonData?.previousPoints}
        ebayLoading={ebayLoading}
        ebayError={ebayError}
        ebaySummary={ebaySummary}
        ebayPreviousSummary={ebayPrev}
        ebayTrend={ebayTrend}
        ebayPoints={ebayData?.points ?? []}
        ebayPreviousPoints={ebayData?.previousPoints}
        ottoLoading={ottoLoading}
        ottoError={ottoError}
        ottoSummary={ottoSummary}
        ottoPreviousSummary={ottoPrev}
        ottoTrend={ottoTrend}
        ottoPoints={ottoData?.points ?? []}
        ottoPreviousPoints={ottoData?.previousPoints}
        kauflandLoading={kauflandLoading}
        kauflandError={kauflandError}
        kauflandSummary={kauflandSummary}
        kauflandPreviousSummary={kauflandPrev}
        kauflandTrend={kauflandTrend}
        kauflandPoints={kauflandData?.points ?? []}
        kauflandPreviousPoints={kauflandData?.previousPoints}
        fressnapfLoading={fressnapfLoading}
        fressnapfError={fressnapfError}
        fressnapfSummary={fressnapfSummary}
        fressnapfPreviousSummary={fressnapfPrev}
        fressnapfTrend={fressnapfTrend}
        fressnapfPoints={fressnapfData?.points ?? []}
        fressnapfPreviousPoints={fressnapfData?.previousPoints}
        mmsLoading={mmsLoading}
        mmsError={mmsError}
        mmsSummary={mmsSummary}
        mmsPreviousSummary={mmsPrev}
        mmsTrend={mmsTrend}
        mmsPoints={mmsData?.points ?? []}
        mmsPreviousPoints={mmsData?.previousPoints}
        zooplusLoading={zooplusLoading}
        zooplusError={zooplusError}
        zooplusSummary={zooplusSummary}
        zooplusPreviousSummary={zooplusPrev}
        zooplusTrend={zooplusTrend}
        zooplusPoints={zooplusData?.points ?? []}
        zooplusPreviousPoints={zooplusData?.previousPoints}
        tiktokLoading={tiktokLoading}
        tiktokError={tiktokError}
        tiktokSummary={tiktokSummary}
        tiktokPreviousSummary={tiktokPrev}
        tiktokTrend={tiktokTrend}
        tiktokPoints={tiktokData?.points ?? []}
        tiktokPreviousPoints={tiktokData?.previousPoints}
        shopifyLoading={shopifyLoading}
        shopifyError={shopifyError}
        shopifySummary={shopifySummary}
        shopifyPreviousSummary={shopifyPrev}
        shopifyTrend={shopifyTrend}
        shopifyPoints={shopifyData?.points ?? []}
        shopifyPreviousPoints={shopifyData?.previousPoints}
        promotionDeals={promotionDeals}
        periodKpis={periodKpis}
        reportRows={reportRows}
        intlTag={intlTag}
        dfLocale={dfLocale}
        t={t}
      />

      <PromotionDealsDialog
        open={promotionsOpen}
        onOpenChange={setPromotionsOpen}
        deals={promotionDeals}
        onPersist={persistPromotionDeals}
        remoteError={promotionRemoteError}
      />
      <DevelopmentReportDialog
        open={devReportOpen}
        onOpenChange={setDevReportOpen}
        initialFrom={period.from}
        initialTo={period.to}
        intlTag={intlTag}
        dfLocale={dfLocale}
        t={t}
      />
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[92vh] max-w-[calc(100%-1rem)] w-full overflow-y-auto p-0 sm:max-w-5xl">
          <div className="space-y-3 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">PDF-Bericht: Marktplatz-Vergleich</h2>
              <Button type="button" onClick={printReport}>
                Als PDF drucken
              </Button>
            </div>
            <div className="grid gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <label className="space-y-1 text-xs">
                <span>Berichtsmodus</span>
                <select
                  value={reportMode}
                  onChange={(event) => setReportMode(event.target.value as "all" | "single" | "selected")}
                  className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm"
                >
                  <option value="all">Alle Marktplätze</option>
                  <option value="single">Einzel-Marktplatz</option>
                  <option value="selected">Ausgewählte Marktplätze</option>
                </select>
              </label>
              {reportMode === "single" ? (
                <label className="space-y-1 text-xs">
                  <span>Marktplatz</span>
                  <select
                    value={reportMarketplaceId}
                    onChange={(event) => setReportMarketplaceId(event.target.value)}
                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm"
                  >
                    {reportRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : reportMode === "selected" ? (
                <div className="space-y-1 text-xs">
                  <span>Marktplätze auswählen</span>
                  <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-border/50 bg-background p-2 text-sm">
                    {reportRows.map((row) => {
                      const checked = reportSelectedIds.includes(row.id);
                      return (
                        <label key={row.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...reportSelectedIds, row.id]
                                : reportSelectedIds.filter((id) => id !== row.id);
                              setReportSelectedIds(next);
                            }}
                          />
                          <span>{row.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground md:self-end">
                  Es werden alle Marktplätze als separierte Abschnitte exportiert.
                </p>
              )}
            </div>
            <MarketplaceReportPrintView
              rows={activeReportRows}
              periodFrom={period.from}
              periodTo={period.to}
              mode={reportMode}
              generatedAt={new Date()}
              intlTag={intlTag}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className={MARKETPLACE_TILE_GRID_CLASS}>
        <button
          type="button"
          onClick={() => openDetailAt("amazon")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={amazonLogo.slot}>
                <MarketplaceBrandImg
                  src="/brand/amazon-logo-current.png"
                  alt="Amazon"
                  className={amazonLogo.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {amazonError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {amazonError}
            </p>
          ) : null}

          {amazonLoading && !summary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : summary ? (
            <MarketplaceTileKpis
              summary={summary}
              previousSummary={prev}
              trend={trend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("ebay")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src="/brand/marketplaces/ebay.svg"
                  alt="eBay"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {ebayLoading && !ebaySummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : ebaySummary ? (
            <MarketplaceTileKpis
              summary={ebaySummary}
              previousSummary={ebayPrev}
              trend={ebayTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("otto")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src="/brand/marketplaces/otto.svg"
                  alt="Otto"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {ottoError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {ottoError}
            </p>
          ) : null}

          {ottoLoading && !ottoSummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : ottoSummary ? (
            <MarketplaceTileKpis
              summary={ottoSummary}
              previousSummary={ottoPrev}
              trend={ottoTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("kaufland")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src="/brand/marketplaces/kaufland.svg"
                  alt="Kaufland"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {kauflandError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {kauflandError}
            </p>
          ) : null}

          {kauflandLoading && !kauflandSummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : kauflandSummary ? (
            <MarketplaceTileKpis
              summary={kauflandSummary}
              previousSummary={kauflandPrev}
              trend={kauflandTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("fressnapf")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src={WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG}
                  alt="Fressnapf"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {fressnapfError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {fressnapfError}
            </p>
          ) : null}

          {fressnapfLoading && !fressnapfSummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : fressnapfSummary ? (
            <MarketplaceTileKpis
              summary={fressnapfSummary}
              previousSummary={fressnapfPrev}
              trend={fressnapfTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("mediamarkt-saturn")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src={WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG}
                  alt="MediaMarkt & Saturn"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {mmsError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {mmsError}
            </p>
          ) : null}

          {mmsLoading && !mmsSummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : mmsSummary ? (
            <MarketplaceTileKpis
              summary={mmsSummary}
              previousSummary={mmsPrev}
              trend={mmsTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("zooplus")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src={WIKIMEDIA_ZOOPLUS_LOGO_PNG}
                  alt="ZooPlus"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {zooplusError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {zooplusError}
            </p>
          ) : null}

          {zooplusLoading && !zooplusSummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : zooplusSummary ? (
            <MarketplaceTileKpis
              summary={zooplusSummary}
              previousSummary={zooplusPrev}
              trend={zooplusTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("tiktok")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src="/brand/marketplaces/tiktok.svg"
                  alt="TikTok"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {tiktokLoading && !tiktokSummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : tiktokSummary ? (
            <MarketplaceTileKpis
              summary={tiktokSummary}
              previousSummary={tiktokPrev}
              trend={tiktokTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        <button
          type="button"
          onClick={() => openDetailAt("shopify")}
          className={MARKETPLACE_TILE_BTN_CLASS}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={OTTO_TILE_LOGO.slot}>
                <MarketplaceBrandImg
                  src={WIKIMEDIA_SHOPIFY_LOGO_2018_SVG}
                  alt="Shopify"
                  className={OTTO_TILE_LOGO.img}
                />
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {shopifyLoading && !shopifySummary ? (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : shopifySummary ? (
            <MarketplaceTileKpis
              summary={shopifySummary}
              previousSummary={shopifyPrev}
              trend={shopifyTrend}
              periodKpis={periodKpis}
              intlTag={intlTag}
            />
          ) : (
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

        </button>

        {ANALYTICS_MARKETPLACES.filter(
          (m) =>
            m.slug !== "ebay" &&
            m.slug !== "otto" &&
            m.slug !== "kaufland" &&
            m.slug !== "fressnapf" &&
            m.slug !== "mediamarkt-saturn" &&
            m.slug !== "zooplus" &&
            m.slug !== "tiktok" &&
            m.slug !== "shopify"
        ).map(({ slug, label, logo }) => (
          <PlaceholderTile
            key={slug}
            label={label}
            logo={logo}
            onOpenDetail={() => openDetailAt(slug)}
            t={t}
          />
        ))}
      </div>

      <MarketplacePriceParitySection />
    </div>
  );
}

export default dynamic(() => Promise.resolve(AnalyticsMarketplacesPage), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
    </div>
  ),
});
