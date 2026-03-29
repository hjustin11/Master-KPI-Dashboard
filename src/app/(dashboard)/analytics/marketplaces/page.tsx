"use client";

import Link from "next/link";
import Image from "next/image";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MarketplacePriceParitySection } from "./MarketplacePriceParitySection";
import { MarketplaceRevenueChart, enumerateYmd } from "./MarketplaceRevenueChart";
import {
  loadBands,
  saveBands,
  type MarketplaceActionBand,
} from "./marketplaceActionBands";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { getDateFnsLocale, intlLocaleTag } from "@/i18n/locale-formatting";

type TrendDirection = "up" | "down" | "flat" | "unknown";

const PLACEHOLDER = "—";
const MAX_RANGE_DAYS = 60;

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

const COMPACT_LOGO_SLUGS = new Set(["kaufland", "otto"]);

function placeholderTileLogoPreset(slug: string): Exclude<MarketplaceTileLogoPreset, "amazon"> {
  if (slug === "zooplus") return "zooplus";
  if (COMPACT_LOGO_SLUGS.has(slug)) return "compact";
  if (slug === "fressnapf") return "fressnapf";
  if (slug === "mediamarkt-saturn") return "mediamarktSaturn";
  if (slug === "tiktok") return "wide";
  return "default";
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
type KauflandSalesCompareResponse = AmazonSalesCompareResponse;
type FressnapfSalesCompareResponse = AmazonSalesCompareResponse;
type MmsSalesCompareResponse = AmazonSalesCompareResponse;
type ZooplusSalesCompareResponse = AmazonSalesCompareResponse;
type TiktokSalesCompareResponse = AmazonSalesCompareResponse;

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
}: {
  label: string;
  value: string;
  trendDirection?: TrendDirection;
  /** Kompaktere Darstellung in Marktplatz-Kacheln. */
  compact?: boolean;
}) {
  const showTrend =
    trendDirection !== "unknown" && trendDirection !== "flat" && value !== PLACEHOLDER;

  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-background/60",
        compact ? "px-1.5 py-1" : "rounded-lg px-2 py-1.5"
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
  error,
  totals,
  periodFrom,
  periodTo,
  onPeriodChange,
  backgroundSyncing,
  dfLocale,
  intlTag,
  t,
}: {
  loading: boolean;
  error: string | null;
  totals: TotalsInput | null;
  periodFrom: string;
  periodTo: string;
  onPeriodChange: (from: string, to: string) => void;
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
    <section className="rounded-lg border border-border/60 bg-card/90 p-3 shadow-sm md:p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 pr-2">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {t("analyticsMp.totalTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("analyticsMp.totalSubtitle")}{" "}
            <span className="font-medium text-foreground/80">{t("analyticsMp.totalSubtitleMore")}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {error ? (
        <p className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-900">
          {t("analyticsMp.totalIncomplete", { message: error })}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[64px] animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : totals ? (
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <MiniKpi
            label={gesamtLabels.revenue}
            value={formatCurrency(totals.revenue, totals.currency, intlTag)}
          />
          <MiniKpi label={t("analyticsMp.ordersTotal")} value={formatInt(totals.orders, intlTag)} />
          <MiniKpi label={t("analyticsMp.unitsTotal")} value={formatInt(totals.units, intlTag)} />
          <MiniKpi
            label={gesamtLabels.trend}
            value={trend.text}
            trendDirection={trend.direction}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <MiniKpi label={gesamtLabels.revenue} value={PLACEHOLDER} />
          <MiniKpi label={t("analyticsMp.ordersTotal")} value={PLACEHOLDER} />
          <MiniKpi label={t("analyticsMp.unitsTotal")} value={PLACEHOLDER} />
          <MiniKpi label={gesamtLabels.trend} value={PLACEHOLDER} />
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
  periodKpis: ReturnType<typeof kpiLabelsForPeriod>;
  intlTag: string;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const fc = (amount: number, currency: string) => formatCurrency(amount, currency, intlTag);
  const fi = (n: number) => formatInt(n, intlTag);

  const marketplaceId = MARKETPLACE_DETAIL_ORDER[index] ?? "amazon";
  const orderLen = MARKETPLACE_DETAIL_ORDER.length;
  const label =
    marketplaceId === "amazon"
      ? "Amazon"
      : (getMarketplaceBySlug(marketplaceId)?.label ?? marketplaceId);

  const [actionBands, setActionBands] = useState<MarketplaceActionBand[]>([]);

  useEffect(() => {
    if (!open) return;
    setActionBands(loadBands(marketplaceId));
  }, [open, marketplaceId, index]);

  const persistActionBands = useCallback((next: MarketplaceActionBand[]) => {
    setActionBands(next);
    saveBands(marketplaceId, next);
  }, [marketplaceId]);

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

  const chartActive = !!marketplaceMetrics && !marketplaceMetrics.loading && !marketplaceMetrics.error && !!marketplaceMetrics.summary;
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
      <div className={cn(MARKETPLACE_TILE_LOGO.amazon.slot, "mx-auto justify-center")}>
        <Image
          src="/brand/amazon-logo-current.png"
          alt="Amazon"
          width={320}
          height={64}
          className={cn(MARKETPLACE_TILE_LOGO.amazon.img, "max-h-16")}
        />
      </div>
    ) : (
      (() => {
        const m = getMarketplaceBySlug(marketplaceId);
        if (!m) return null;
        const { slot, img } = MARKETPLACE_TILE_LOGO[placeholderTileLogoPreset(marketplaceId)];
        return (
          <div className={cn(slot, "mx-auto max-w-full justify-center [&_img]:max-h-20")}>
            <img src={m.logo} alt={m.label} className={img} />
          </div>
        );
      })()
    );

  const detailMarketplaceKpis =
    marketplaceMetrics?.loading ? (
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
        className="max-h-[min(94vh,880px)] max-w-[calc(100%-1.25rem)] w-full gap-0 overflow-y-auto p-0 sm:max-w-5xl xl:max-w-6xl"
        showCloseButton
      >
        <div className="flex items-start gap-2 border-b border-border/60 px-3 pb-2 pt-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-1 shrink-0"
            aria-label={t("analyticsMp.dialogPrev")}
            onClick={() => onStep(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <DialogTitle className="text-center text-base font-semibold tracking-tight">
              {label}
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-center text-[11px]">
              {t("analyticsMp.dialogDescription", {
                span: formatRangeShort(periodFrom, periodTo, dfLocale),
              })}
            </DialogDescription>
            <div className="mt-3">{logoBlock}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-1 shrink-0"
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
                            : t("analyticsMp.linkAmazonOrders")}
              </Link>
            </div>
          ) : null}

          <div className="border-t border-border/50 pt-3">
            <MarketplaceRevenueChart
              periodFrom={periodFrom}
              periodTo={periodTo}
              currency={chartCurrency}
              formatCurrency={fc}
              points={marketplaceMetrics?.points ?? []}
              previousPoints={marketplaceMetrics?.previousPoints}
              showPreviousLine={!!marketplaceMetrics?.previousSummary}
              bands={actionBands}
              onBandsChange={persistActionBands}
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
  slug,
  label,
  logo,
  onOpenDetail,
  t,
}: {
  slug: string;
  label: string;
  logo: string;
  onOpenDetail: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { slot, img } = MARKETPLACE_TILE_LOGO[placeholderTileLogoPreset(slug)];
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="group flex w-full flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className={slot}>
            <img
              src={logo}
              alt={label}
              className={img}
              loading="lazy"
              decoding="async"
            />
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{t("analyticsMp.tileClickDetail")}</p>
        </div>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1">
        <MiniKpi compact label={t("analyticsMp.revenue7d")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.orders")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.units")} value={PLACEHOLDER} />
        <MiniKpi compact label={t("analyticsMp.tileTrend")} value={PLACEHOLDER} />
      </div>

      <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
        {t("analyticsMp.tileFooterPlaceholder")}
      </p>
    </button>
  );
}

export default function AnalyticsMarketplacesPage() {
  const { t, locale } = useTranslation();
  const dfLocale = getDateFnsLocale(locale);
  const intlTag = intlLocaleTag(locale);

  const [period, setPeriod] = useState(defaultPeriod);
  const [amazonLoading, setAmazonLoading] = useState(true);
  const [amazonBackgroundSyncing, setAmazonBackgroundSyncing] = useState(false);
  const [amazonError, setAmazonError] = useState<string | null>(null);
  const [amazonData, setAmazonData] = useState<AmazonSalesCompareResponse | null>(null);
  const [ottoLoading, setOttoLoading] = useState(true);
  const [ottoBackgroundSyncing, setOttoBackgroundSyncing] = useState(false);
  const [ottoError, setOttoError] = useState<string | null>(null);
  const [ottoData, setOttoData] = useState<OttoSalesCompareResponse | null>(null);
  const [kauflandLoading, setKauflandLoading] = useState(true);
  const [kauflandBackgroundSyncing, setKauflandBackgroundSyncing] = useState(false);
  const [kauflandError, setKauflandError] = useState<string | null>(null);
  const [kauflandData, setKauflandData] = useState<KauflandSalesCompareResponse | null>(null);
  const [fressnapfLoading, setFressnapfLoading] = useState(true);
  const [fressnapfBackgroundSyncing, setFressnapfBackgroundSyncing] = useState(false);
  const [fressnapfError, setFressnapfError] = useState<string | null>(null);
  const [fressnapfData, setFressnapfData] = useState<FressnapfSalesCompareResponse | null>(null);
  const [mmsLoading, setMmsLoading] = useState(true);
  const [mmsBackgroundSyncing, setMmsBackgroundSyncing] = useState(false);
  const [mmsError, setMmsError] = useState<string | null>(null);
  const [mmsData, setMmsData] = useState<MmsSalesCompareResponse | null>(null);
  const [zooplusLoading, setZooplusLoading] = useState(true);
  const [zooplusBackgroundSyncing, setZooplusBackgroundSyncing] = useState(false);
  const [zooplusError, setZooplusError] = useState<string | null>(null);
  const [zooplusData, setZooplusData] = useState<ZooplusSalesCompareResponse | null>(null);
  const [tiktokLoading, setTiktokLoading] = useState(true);
  const [tiktokBackgroundSyncing, setTiktokBackgroundSyncing] = useState(false);
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [tiktokData, setTiktokData] = useState<TiktokSalesCompareResponse | null>(null);
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
        const { savedAt: _s, ...data } = parsed;
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
        setAmazonData(null);
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

  const loadOttoSales = useCallback(async (forceRefresh = false, silent = false) => {
    const { from, to } = periodRef.current;
    const cacheKey = `analytics_otto_sales_compare_v1:${from}:${to}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<{ savedAt: number } & OttoSalesCompareResponse>(cacheKey);
      if (parsed?.summary && !parsed.error) {
        const { savedAt: _s, ...data } = parsed;
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
        setOttoData(null);
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
        const { savedAt: _s, ...data } = parsed;
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
        setKauflandData(null);
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
        const { savedAt: _s, ...data } = parsed;
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
        setFressnapfData(null);
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
        const { savedAt: _s, ...data } = parsed;
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
        setMmsData(null);
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
        const { savedAt: _s, ...data } = parsed;
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
        setZooplusData(null);
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
        const { savedAt: _s, ...data } = parsed;
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
        setTiktokData(null);
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

  useEffect(() => {
    void loadAmazonSales(false, false);
    void loadOttoSales(false, false);
    void loadKauflandSales(false, false);
    void loadFressnapfSales(false, false);
    void loadMmsSales(false, false);
    void loadZooplusSales(false, false);
    void loadTiktokSales(false, false);
  }, [
    period.from,
    period.to,
    loadAmazonSales,
    loadOttoSales,
    loadKauflandSales,
    loadFressnapfSales,
    loadMmsSales,
    loadZooplusSales,
    loadTiktokSales,
  ]);

  useEffect(() => {
    setAnalyticsHasMounted(true);
  }, []);

  useEffect(() => {
    if (!analyticsHasMounted) return;
    const id = window.setInterval(() => {
      void loadAmazonSales(false, true);
      void loadOttoSales(false, true);
      void loadKauflandSales(false, true);
      void loadFressnapfSales(false, true);
      void loadMmsSales(false, true);
      void loadZooplusSales(false, true);
      void loadTiktokSales(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [
    analyticsHasMounted,
    loadAmazonSales,
    loadOttoSales,
    loadKauflandSales,
    loadFressnapfSales,
    loadMmsSales,
    loadZooplusSales,
    loadTiktokSales,
  ]);

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

  const totals = useMemo(
    () =>
      buildMarketplaceTotals([
        {
          summary: amazonData?.summary,
          previousSummary: amazonData?.previousSummary,
          revenueDeltaPct: amazonData?.revenueDeltaPct,
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
      ]),
    [amazonData, ottoData, kauflandData, fressnapfData, mmsData, zooplusData, tiktokData]
  );

  const amazonLogo = MARKETPLACE_TILE_LOGO.amazon;
  const periodKpis = useMemo(
    () => kpiLabelsForPeriod(period.from, period.to, dfLocale, t),
    [period.from, period.to, dfLocale, t]
  );

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIndex, setDetailIndex] = useState(0);

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
        loading={
          amazonLoading ||
          ottoLoading ||
          kauflandLoading ||
          fressnapfLoading ||
          mmsLoading ||
          zooplusLoading ||
          tiktokLoading
        }
        error={
          amazonError ??
          ottoError ??
          kauflandError ??
          fressnapfError ??
          mmsError ??
          zooplusError ??
          tiktokError
        }
        totals={totals}
        periodFrom={period.from}
        periodTo={period.to}
        onPeriodChange={(from, to) => setPeriod({ from, to })}
        backgroundSyncing={
          amazonBackgroundSyncing ||
          ottoBackgroundSyncing ||
          kauflandBackgroundSyncing ||
          fressnapfBackgroundSyncing ||
          mmsBackgroundSyncing ||
          zooplusBackgroundSyncing ||
          tiktokBackgroundSyncing
        }
        dfLocale={dfLocale}
        intlTag={intlTag}
        t={t}
      />

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
        periodKpis={periodKpis}
        intlTag={intlTag}
        dfLocale={dfLocale}
        t={t}
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => openDetailAt("amazon")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={amazonLogo.slot}>
                <Image
                  src="/brand/amazon-logo-current.png"
                  alt="Amazon"
                  width={220}
                  height={44}
                  className={amazonLogo.img}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
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

          {amazonLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : summary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.amazonTileFooter")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => openDetailAt("otto")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={MARKETPLACE_TILE_LOGO.compact.slot}>
                <img
                  src="/brand/marketplaces/otto.svg"
                  alt="Otto"
                  className={MARKETPLACE_TILE_LOGO.compact.img}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
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

          {ottoLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : ottoSummary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.tileFooterPlaceholder")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => openDetailAt("kaufland")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={MARKETPLACE_TILE_LOGO.compact.slot}>
                <img
                  src="/brand/marketplaces/kaufland.svg"
                  alt="Kaufland"
                  className={MARKETPLACE_TILE_LOGO.compact.img}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
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

          {kauflandLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : kauflandSummary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.tileFooterPlaceholder")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => openDetailAt("fressnapf")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={MARKETPLACE_TILE_LOGO.fressnapf.slot}>
                <img
                  src="/brand/marketplaces/fressnapf.svg"
                  alt="Fressnapf"
                  className={MARKETPLACE_TILE_LOGO.fressnapf.img}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
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

          {fressnapfLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : fressnapfSummary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.tileFooterPlaceholder")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => openDetailAt("mediamarkt-saturn")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={MARKETPLACE_TILE_LOGO.mediamarktSaturn.slot}>
                <img
                  src="/brand/marketplaces/mediamarkt-saturn.svg"
                  alt="MediaMarkt & Saturn"
                  className={MARKETPLACE_TILE_LOGO.mediamarktSaturn.img}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
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

          {mmsLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : mmsSummary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.tileFooterPlaceholder")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => openDetailAt("zooplus")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={MARKETPLACE_TILE_LOGO.zooplus.slot}>
                <img
                  src="/brand/marketplaces/zooplus.svg"
                  alt="ZooPlus"
                  className={MARKETPLACE_TILE_LOGO.zooplus.img}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
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

          {zooplusLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : zooplusSummary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.tileFooterPlaceholder")}
          </p>
        </button>

        <button
          type="button"
          onClick={() => openDetailAt("tiktok")}
          className="group flex flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0 flex-1">
              <div className={MARKETPLACE_TILE_LOGO.wide.slot}>
                <img
                  src="/brand/marketplaces/tiktok.svg"
                  alt="TikTok"
                  className={MARKETPLACE_TILE_LOGO.wide.img}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("analyticsMp.amazonTilePeriod", {
                  span: formatRangeShort(period.from, period.to, dfLocale),
                })}
              </p>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-3 w-3" aria-hidden />
            </span>
          </div>

          {tiktokError ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-900">
              {tiktokError}
            </p>
          ) : null}

          {tiktokLoading ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[48px] animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : tiktokSummary ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
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
            <div className="mt-2 grid grid-cols-2 gap-1">
              <MiniKpi compact label={periodKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.orders} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.units} value={PLACEHOLDER} />
              <MiniKpi compact label={periodKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
            {t("analyticsMp.tileFooterPlaceholder")}
          </p>
        </button>

        {ANALYTICS_MARKETPLACES.filter(
          (m) =>
            m.slug !== "otto" &&
            m.slug !== "kaufland" &&
            m.slug !== "fressnapf" &&
            m.slug !== "mediamarkt-saturn" &&
            m.slug !== "zooplus" &&
            m.slug !== "tiktok"
        ).map(({ slug, label, logo }) => (
          <PlaceholderTile
            key={slug}
            slug={slug}
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
