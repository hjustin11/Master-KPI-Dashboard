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
import {
  bandsForMarketplaceChart,
  bandsForTotalChart,
  type MarketplaceActionBand,
  type PromotionDeal,
} from "./marketplaceActionBands";
import { PromotionDealsDialog } from "./PromotionDealsDialog";
import { usePromotionDeals } from "./usePromotionDeals";
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
  };
  previousSummary?: {
    orderCount: number;
    salesAmount: number;
    units: number;
    currency: string;
  };
  revenueDeltaPct?: number | null;
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
  compact = false,
  className,
}: {
  label: string;
  value: string;
  trendDirection?: TrendDirection;
  /** Kompaktere Darstellung in Marktplatz-Kacheln. */
  compact?: boolean;
  className?: string;
}) {
  const showTrend =
    trendDirection !== "unknown" && trendDirection !== "flat" && value !== PLACEHOLDER;

  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-background/60",
        compact ? "px-1.5 py-1" : "rounded-lg px-2 py-1.5",
        className
      )}
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
      </div>
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
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenPromotionDeals}>
          {t("analyticsMp.promotionsButton")}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
  intlTag: string;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const fc = (amount: number, currency: string) => formatCurrency(amount, currency, intlTag);
  const fi = (n: number) => formatInt(n, intlTag);

  const marketplaceId = MARKETPLACE_DETAIL_ORDER[index] ?? "amazon";

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
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <MiniKpi
          label={periodKpis.revenue}
          value={fc(marketplaceMetrics.summary.salesAmount, marketplaceMetrics.summary.currency)}
        />
        <MiniKpi label={periodKpis.orders} value={fi(marketplaceMetrics.summary.orderCount)} />
        <MiniKpi label={periodKpis.units} value={fi(marketplaceMetrics.summary.units)} />
        <MiniKpi
          label={periodKpis.trend}
          value={marketplaceMetrics.trend.text}
          trendDirection={marketplaceMetrics.trend.direction}
        />
        <MiniKpi
          label={t("analyticsMp.avgOrderValue")}
          value={
            marketplaceMetrics.summary.orderCount > 0
              ? fc(
                  marketplaceMetrics.summary.salesAmount / marketplaceMetrics.summary.orderCount,
                  marketplaceMetrics.summary.currency
                )
              : PLACEHOLDER
          }
        />
        <MiniKpi
          label={t("analyticsMp.avgUnitsPerOrder")}
          value={
            marketplaceMetrics.summary.orderCount > 0
              ? (
                  marketplaceMetrics.summary.units / marketplaceMetrics.summary.orderCount
                ).toLocaleString(intlTag, {
                  maximumFractionDigits: 2,
                })
              : PLACEHOLDER
          }
        />
        <MiniKpi
          label={t("analyticsMp.prevRevenue")}
          value={
            marketplaceMetrics.previousSummary
              ? fc(
                  marketplaceMetrics.previousSummary.salesAmount,
                  marketplaceMetrics.previousSummary.currency
                )
              : PLACEHOLDER
          }
        />
        <MiniKpi
          label={t("analyticsMp.prevOrders")}
          value={marketplaceMetrics.previousSummary ? fi(marketplaceMetrics.previousSummary.orderCount) : PLACEHOLDER}
        />
        <MiniKpi
          label={t("analyticsMp.prevUnits")}
          value={marketplaceMetrics.previousSummary ? fi(marketplaceMetrics.previousSummary.units) : PLACEHOLDER}
        />
        {dayKpis ? (
          <>
            <MiniKpi
              label={t("analyticsMp.maxDailyRevenue")}
              value={fc(dayKpis.max, marketplaceMetrics.summary.currency)}
            />
            <MiniKpi
              label={t("analyticsMp.minDayWithRevenue")}
              value={dayKpis.min > 0 ? fc(dayKpis.min, marketplaceMetrics.summary.currency) : PLACEHOLDER}
            />
            <MiniKpi
              label={t("analyticsMp.avgRevenuePerCalendarDay")}
              value={fc(dayKpis.avg, marketplaceMetrics.summary.currency)}
            />
            <MiniKpi
              label={t("analyticsMp.daysWithRevenue")}
              value={`${dayKpis.activeDays} / ${dayKpis.totalDays}`}
            />
          </>
        ) : null}
        <MiniKpi
          label={t("analyticsMp.avgOrdersPerDay")}
          value={
            dayKpis && dayKpis.totalDays > 0
              ? (marketplaceMetrics.summary.orderCount / dayKpis.totalDays).toLocaleString(intlTag, {
                  maximumFractionDigits: 2,
                })
              : PLACEHOLDER
          }
        />
        <MiniKpi label={t("analyticsMp.returnsUnits")} value={PLACEHOLDER} />
        <MiniKpi label={t("analyticsMp.returnsRate")} value={PLACEHOLDER} />
        <MiniKpi label={t("analyticsMp.activeListings")} value={PLACEHOLDER} />
      </div>
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
  const periodRef = useRef(period);

  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  const loadAmazonSales = useCallback(async (forceRefresh = false, silent = false) => {
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
      const res = await fetch(`/api/amazon/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as AmazonSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.amazonMetricsError"));
      }
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
    }
  }, [t]);

  const loadEbaySales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_ebay_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

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
      const res = await fetch(`/api/ebay/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as EbaySalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.ebayMetricsError"));
      }
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
  }, [t]);

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
      const res = await fetch(`/api/otto/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as OttoSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.ottoMetricsError"));
      }
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
      const res = await fetch(`/api/kaufland/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as KauflandSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.kauflandMetricsError"));
      }
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
      const res = await fetch(`/api/fressnapf/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as FressnapfSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.fressnapfMetricsError"));
      }
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
      const res = await fetch(`/api/mediamarkt-saturn/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as MmsSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.mmsMetricsError"));
      }
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
      const res = await fetch(`/api/zooplus/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as ZooplusSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.zooplusMetricsError"));
      }
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
      const res = await fetch(`/api/tiktok/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as TiktokSalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.tiktokMetricsError"));
      }
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
  }, [t]);

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
      const res = await fetch(`/api/shopify/sales?${params}`, { cache: "no-store" });
      const payload = (await res.json()) as ShopifySalesCompareResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsMp.shopifyMetricsError"));
      }
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
    void loadAmazonSalesRef.current(false, false);
    void loadEbaySalesRef.current(false, false);
    void loadOttoSalesRef.current(false, false);
    void loadKauflandSalesRef.current(false, false);
    void loadFressnapfSalesRef.current(false, false);
    void loadMmsSalesRef.current(false, false);
    void loadZooplusSalesRef.current(false, false);
    void loadTiktokSalesRef.current(false, false);
    void loadShopifySalesRef.current(false, false);
  }, [period.from, period.to]);

  useEffect(() => {
    setAnalyticsHasMounted(true);
  }, []);

  useEffect(() => {
    if (!analyticsHasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadAmazonSalesRef.current(false, true);
      void loadEbaySalesRef.current(false, true);
      void loadOttoSalesRef.current(false, true);
      void loadKauflandSalesRef.current(false, true);
      void loadFressnapfSalesRef.current(false, true);
      void loadMmsSalesRef.current(false, true);
      void loadZooplusSalesRef.current(false, true);
      void loadTiktokSalesRef.current(false, true);
      void loadShopifySalesRef.current(false, true);
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
  const totalStripBlocking = anySalesLoading && !hasAnyMarketplaceSummary;

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
  const netSummary = useMemo(() => {
    if (!totals) return null;
    const current = {
      revenue: totals.revenue,
      returnsAmount: 0,
      feesAmount: 0,
      adSpendAmount: 0,
    };
    const previous = {
      revenue: totals.prevRevenue,
      returnsAmount: 0,
      feesAmount: 0,
      adSpendAmount: 0,
    };
    const currentNet =
      current.revenue - current.returnsAmount - current.feesAmount - current.adSpendAmount;
    const previousNet =
      previous.revenue - previous.returnsAmount - previous.feesAmount - previous.adSpendAmount;
    return {
      currency: totals.currency,
      current,
      previous,
      currentNet,
      previousNet,
      note: "Teilweise Datendeckung: Retouren/Gebuehren/Anzeigenkosten werden aktuell als 0 ausgewiesen.",
    };
  }, [totals]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIndex, setDetailIndex] = useState(0);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const { deals: promotionDeals, persist: persistPromotionDeals, remoteError: promotionRemoteError } =
    usePromotionDeals();

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kennzahl</TableHead>
                    <TableHead className="text-right">Aktueller Zeitraum</TableHead>
                    <TableHead className="text-right">Vorjahr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Umsatz</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.revenue, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.revenue, netSummary.currency, intlTag)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Retouren</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.returnsAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.returnsAmount, netSummary.currency, intlTag)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Marktplatzgebuehren</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.feesAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.feesAmount, netSummary.currency, intlTag)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Anzeigenkosten</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.current.adSpendAmount, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(netSummary.previous.adSpendAmount, netSummary.currency, intlTag)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold">Netto</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(netSummary.currentNet, netSummary.currency, intlTag)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(netSummary.previousNet, netSummary.currency, intlTag)}</TableCell>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(summary.salesAmount, summary.currency, intlTag)}
              />
              <MiniKpi compact label={periodKpis.orders} value={formatInt(summary.orderCount, intlTag)} />
              <MiniKpi compact label={periodKpis.units} value={formatInt(summary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={trend.text}
                trendDirection={trend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(ebaySummary.salesAmount, ebaySummary.currency, intlTag)}
              />
              <MiniKpi compact label={periodKpis.orders} value={formatInt(ebaySummary.orderCount, intlTag)} />
              <MiniKpi compact label={periodKpis.units} value={formatInt(ebaySummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={ebayTrend.text}
                trendDirection={ebayTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(ottoSummary.salesAmount, ottoSummary.currency, intlTag)}
              />
              <MiniKpi compact label={periodKpis.orders} value={formatInt(ottoSummary.orderCount, intlTag)} />
              <MiniKpi compact label={periodKpis.units} value={formatInt(ottoSummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={ottoTrend.text}
                trendDirection={ottoTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(kauflandSummary.salesAmount, kauflandSummary.currency, intlTag)}
              />
              <MiniKpi
                compact
                label={periodKpis.orders}
                value={formatInt(kauflandSummary.orderCount, intlTag)}
              />
              <MiniKpi compact label={periodKpis.units} value={formatInt(kauflandSummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={kauflandTrend.text}
                trendDirection={kauflandTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(fressnapfSummary.salesAmount, fressnapfSummary.currency, intlTag)}
              />
              <MiniKpi
                compact
                label={periodKpis.orders}
                value={formatInt(fressnapfSummary.orderCount, intlTag)}
              />
              <MiniKpi compact label={periodKpis.units} value={formatInt(fressnapfSummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={fressnapfTrend.text}
                trendDirection={fressnapfTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(mmsSummary.salesAmount, mmsSummary.currency, intlTag)}
              />
              <MiniKpi compact label={periodKpis.orders} value={formatInt(mmsSummary.orderCount, intlTag)} />
              <MiniKpi compact label={periodKpis.units} value={formatInt(mmsSummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={mmsTrend.text}
                trendDirection={mmsTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(zooplusSummary.salesAmount, zooplusSummary.currency, intlTag)}
              />
              <MiniKpi
                compact
                label={periodKpis.orders}
                value={formatInt(zooplusSummary.orderCount, intlTag)}
              />
              <MiniKpi compact label={periodKpis.units} value={formatInt(zooplusSummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={zooplusTrend.text}
                trendDirection={zooplusTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(tiktokSummary.salesAmount, tiktokSummary.currency, intlTag)}
              />
              <MiniKpi
                compact
                label={periodKpis.orders}
                value={formatInt(tiktokSummary.orderCount, intlTag)}
              />
              <MiniKpi compact label={periodKpis.units} value={formatInt(tiktokSummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={tiktokTrend.text}
                trendDirection={tiktokTrend.direction}
              />
            </div>
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
            <div className={MARKETPLACE_TILE_KPI_GRID_CLASS}>
              <MiniKpi
                compact
                label={periodKpis.revenue}
                value={formatCurrency(shopifySummary.salesAmount, shopifySummary.currency, intlTag)}
              />
              <MiniKpi
                compact
                label={periodKpis.orders}
                value={formatInt(shopifySummary.orderCount, intlTag)}
              />
              <MiniKpi compact label={periodKpis.units} value={formatInt(shopifySummary.units, intlTag)} />
              <MiniKpi
                compact
                label={periodKpis.trend}
                value={shopifyTrend.text}
                trendDirection={shopifyTrend.direction}
              />
            </div>
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
