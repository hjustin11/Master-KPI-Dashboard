"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { de } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  ArrowRight,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
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

type TrendDirection = "up" | "down" | "flat" | "unknown";

const PLACEHOLDER_TILE_KPIS = {
  revenue: "Umsatz (7 Tage)",
  orders: "Bestellungen",
  units: "Einheiten",
  trend: "Δ Umsatz vs. Vorwoche",
} as const;

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

function formatRangeShort(fromYmd: string, toYmd: string): string {
  const a = parseYmdLocal(fromYmd);
  const b = parseYmdLocal(toYmd);
  if (fromYmd === toYmd) return format(a, "d. MMM yyyy", { locale: de });
  return `${format(a, "d. MMM", { locale: de })} – ${format(b, "d. MMM yyyy", { locale: de })}`;
}

function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  return differenceInCalendarDays(parseYmdLocal(toYmd), parseYmdLocal(fromYmd)) + 1;
}

function kpiLabelsForPeriod(periodFrom: string, periodTo: string) {
  const span = formatRangeShort(periodFrom, periodTo);
  return {
    revenue: `Umsatz (${span})`,
    orders: "Bestellungen",
    units: "Einheiten",
    trend: "Δ Umsatz vs. Vorperiode",
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
    slot: "flex h-[3.625rem] w-[min(100%,18.5rem)] shrink-0 items-center justify-start",
    img: "max-h-[3.625rem] max-w-full object-contain object-left opacity-90",
  },
  zooplus: {
    slot: "flex h-14 w-[min(100%,20rem)] shrink-0 items-center justify-start",
    img: "max-h-14 max-w-full object-contain object-left",
  },
  compact: {
    slot: "flex h-7 w-[8.25rem] max-w-full shrink-0 items-center justify-start",
    img: "max-h-7 max-w-full object-contain object-left",
  },
  default: {
    slot: "flex h-9 w-44 max-w-full shrink-0 items-center justify-start",
    img: "max-h-9 max-w-full object-contain object-left",
  },
  fressnapf: {
    slot: "flex h-[2.875rem] w-[min(100%,16.75rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.875rem] max-w-full object-contain object-left",
  },
  mediamarktSaturn: {
    slot: "flex h-[3.75rem] w-[min(100%,23rem)] shrink-0 items-center justify-start",
    img: "max-h-[3.75rem] max-w-full object-contain object-left",
  },
  wide: {
    slot: "flex h-10 w-[min(100%,15.5rem)] shrink-0 items-center justify-start",
    img: "max-h-10 max-w-full object-contain object-left",
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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount || 0);
}

function formatInt(n: number) {
  return new Intl.NumberFormat("de-DE").format(n ?? 0);
}

function formatTrendPct(
  revenueDeltaPct: number | null | undefined,
  previousAmount: number,
  currentAmount: number
): { text: string; direction: TrendDirection } {
  if (revenueDeltaPct != null && Number.isFinite(revenueDeltaPct)) {
    if (Math.abs(revenueDeltaPct) < 0.05) {
      return { text: "±0 %", direction: "flat" };
    }
    const sign = revenueDeltaPct > 0 ? "+" : "";
    return {
      text: `${sign}${revenueDeltaPct.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`,
      direction: revenueDeltaPct > 0 ? "up" : "down",
    };
  }
  if (previousAmount <= 0 && currentAmount > 0) {
    return { text: "neu", direction: "up" };
  }
  return { text: PLACEHOLDER, direction: "unknown" };
}

function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  if (direction === "down") return <TrendingDown className="h-3.5 w-3.5 text-rose-600" aria-hidden />;
  return null;
}

function MiniKpi({
  label,
  value,
  trendDirection = "unknown",
}: {
  label: string;
  value: string;
  trendDirection?: TrendDirection;
}) {
  const showTrend =
    trendDirection !== "unknown" && trendDirection !== "flat" && value !== PLACEHOLDER;

  return (
    <div className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        {showTrend ? <TrendIcon direction={trendDirection} /> : null}
        <p
          className={cn(
            "tabular-nums text-base font-semibold tracking-tight text-foreground",
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

/** Summiert angebundene Kanäle; bei mehreren Währungen später Umrechnung ergänzen. */
function buildMarketplaceTotals(amazon: AmazonSalesCompareResponse | null): TotalsInput | null {
  const s = amazon?.summary;
  if (!s) return null;
  const p = amazon?.previousSummary;
  const prevRevenue = p?.salesAmount ?? 0;
  let revenueDeltaPct = amazon?.revenueDeltaPct;
  if (revenueDeltaPct == null && prevRevenue > 0) {
    revenueDeltaPct = Number(
      (((s.salesAmount - prevRevenue) / prevRevenue) * 100).toFixed(1)
    );
  }
  return {
    revenue: s.salesAmount,
    orders: s.orderCount,
    units: s.units,
    currency: s.currency,
    prevRevenue,
    revenueDeltaPct,
  };
}

function PeriodRangePicker({
  periodFrom,
  periodTo,
  onChange,
}: {
  periodFrom: string;
  periodTo: string;
  onChange: (from: string, to: string) => void;
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
            aria-label="Zeitraum wählen"
          />
        }
      >
        <CalendarIcon className="size-3.5 opacity-70" aria-hidden />
        <span className="max-w-[220px] truncate tabular-nums sm:max-w-none">
          {formatRangeShort(periodFrom, periodTo)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-auto overflow-hidden p-0">
        <Calendar
          mode="range"
          locale={de}
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
          Max. {MAX_RANGE_DAYS} Tage · Vorperiode = gleiche Länge direkt davor
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
}: {
  loading: boolean;
  error: string | null;
  totals: TotalsInput | null;
  periodFrom: string;
  periodTo: string;
  onPeriodChange: (from: string, to: string) => void;
}) {
  const trend = useMemo(() => {
    if (!totals) return { text: PLACEHOLDER, direction: "unknown" as TrendDirection };
    return formatTrendPct(totals.revenueDeltaPct, totals.prevRevenue, totals.revenue);
  }, [totals]);

  const gesamtLabels = useMemo(() => {
    const span = formatRangeShort(periodFrom, periodTo);
    return {
      revenue: `Gesamtumsatz (${span})`,
      trend: "Δ Umsatz vs. Vorperiode",
    };
  }, [periodFrom, periodTo]);

  return (
    <section className="rounded-xl border border-border/60 bg-card/90 p-4 shadow-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Gesamt</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Summe der angebundenen Kanäle · gewählter Zeitraum und Vorperiode gleicher Länge ·
            Amazon-Kennzahlen über SP-API Sales ·{" "}
            <span className="font-medium text-foreground/80">weitere Kanäle folgen</span>
          </p>
        </div>
        <PeriodRangePicker
          periodFrom={periodFrom}
          periodTo={periodTo}
          onChange={onPeriodChange}
        />
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-900">
          Gesamt nicht vollständig: {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      ) : totals ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniKpi
            label={gesamtLabels.revenue}
            value={formatCurrency(totals.revenue, totals.currency)}
          />
          <MiniKpi label="Bestellungen gesamt" value={formatInt(totals.orders)} />
          <MiniKpi label="Einheiten gesamt" value={formatInt(totals.units)} />
          <MiniKpi
            label={gesamtLabels.trend}
            value={trend.text}
            trendDirection={trend.direction}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniKpi label={gesamtLabels.revenue} value={PLACEHOLDER} />
          <MiniKpi label="Bestellungen gesamt" value={PLACEHOLDER} />
          <MiniKpi label="Einheiten gesamt" value={PLACEHOLDER} />
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
  summary,
  previousSummary,
  trend,
  amazonKpis,
  amazonPoints,
  amazonPreviousPoints,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number;
  onStep: (delta: -1 | 1) => void;
  periodFrom: string;
  periodTo: string;
  amazonLoading: boolean;
  amazonError: string | null;
  summary: AmazonSalesCompareResponse["summary"] | undefined;
  previousSummary: AmazonSalesCompareResponse["previousSummary"] | undefined;
  trend: { text: string; direction: TrendDirection };
  amazonKpis: ReturnType<typeof kpiLabelsForPeriod>;
  amazonPoints: AmazonSalesPoint[];
  amazonPreviousPoints: AmazonSalesPoint[] | undefined;
}) {
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

  const dayKpis = useMemo(() => {
    if (marketplaceId !== "amazon" || !summary) return null;
    const dates = enumerateYmd(periodFrom, periodTo);
    const byDate = new Map(amazonPoints.map((p) => [p.date, p]));
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
  }, [marketplaceId, summary, amazonPoints, periodFrom, periodTo]);

  const chartActive =
    marketplaceId === "amazon" && !amazonLoading && !amazonError && !!summary;
  const chartCurrency = summary?.currency ?? "EUR";

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

  const detailAmazonKpis =
    amazonLoading ? (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    ) : amazonError ? (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-2 text-xs text-amber-900">
        {amazonError}
      </p>
    ) : summary ? (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MiniKpi label={amazonKpis.revenue} value={formatCurrency(summary.salesAmount, summary.currency)} />
        <MiniKpi label={amazonKpis.orders} value={formatInt(summary.orderCount)} />
        <MiniKpi label={amazonKpis.units} value={formatInt(summary.units)} />
        <MiniKpi label={amazonKpis.trend} value={trend.text} trendDirection={trend.direction} />
        <MiniKpi
          label="Ø Bestellwert"
          value={
            summary.orderCount > 0
              ? formatCurrency(summary.salesAmount / summary.orderCount, summary.currency)
              : PLACEHOLDER
          }
        />
        <MiniKpi
          label="Ø Einheiten / Bestellung"
          value={
            summary.orderCount > 0
              ? (summary.units / summary.orderCount).toLocaleString("de-DE", {
                  maximumFractionDigits: 2,
                })
              : PLACEHOLDER
          }
        />
        <MiniKpi
          label="Umsatz Vorperiode"
          value={
            previousSummary
              ? formatCurrency(previousSummary.salesAmount, previousSummary.currency)
              : PLACEHOLDER
          }
        />
        <MiniKpi
          label="Bestellungen Vorperiode"
          value={previousSummary ? formatInt(previousSummary.orderCount) : PLACEHOLDER}
        />
        <MiniKpi
          label="Einheiten Vorperiode"
          value={previousSummary ? formatInt(previousSummary.units) : PLACEHOLDER}
        />
        {dayKpis ? (
          <>
            <MiniKpi label="Höchster Tagesumsatz" value={formatCurrency(dayKpis.max, summary.currency)} />
            <MiniKpi
              label="Niedrigster Tag mit Umsatz"
              value={dayKpis.min > 0 ? formatCurrency(dayKpis.min, summary.currency) : PLACEHOLDER}
            />
            <MiniKpi
              label="Ø Umsatz / Kalendertag"
              value={formatCurrency(dayKpis.avg, summary.currency)}
            />
            <MiniKpi
              label="Tage mit Umsatz"
              value={`${dayKpis.activeDays} / ${dayKpis.totalDays}`}
            />
          </>
        ) : null}
        <MiniKpi
          label="Ø Bestellungen / Tag"
          value={
            dayKpis && dayKpis.totalDays > 0
              ? (summary.orderCount / dayKpis.totalDays).toLocaleString("de-DE", {
                  maximumFractionDigits: 2,
                })
              : PLACEHOLDER
          }
        />
        <MiniKpi label="Retouren (Stück)" value={PLACEHOLDER} />
        <MiniKpi label="Retourenquote" value={PLACEHOLDER} />
        <MiniKpi label="Aktive Listings" value={PLACEHOLDER} />
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <MiniKpi key={i} label="—" value={PLACEHOLDER} />
        ))}
      </div>
    );

  const detailPlaceholderKpis = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <MiniKpi label={`Umsatz (${formatRangeShort(periodFrom, periodTo)})`} value={PLACEHOLDER} />
      <MiniKpi label="Bestellungen" value={PLACEHOLDER} />
      <MiniKpi label="Einheiten" value={PLACEHOLDER} />
      <MiniKpi label="Δ Umsatz vs. Vorperiode" value={PLACEHOLDER} />
      <MiniKpi label="Ø Bestellwert" value={PLACEHOLDER} />
      <MiniKpi label="Sessions / Besuche" value={PLACEHOLDER} />
      <MiniKpi label="Conversion-Rate" value={PLACEHOLDER} />
      <MiniKpi label="Retourenquote" value={PLACEHOLDER} />
      <MiniKpi label="Aktive Listings" value={PLACEHOLDER} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(94vh,960px)] max-w-[calc(100%-1.25rem)] w-full gap-0 overflow-y-auto p-0 sm:max-w-5xl xl:max-w-6xl"
        showCloseButton
      >
        <div className="flex items-start gap-2 border-b border-border/60 px-4 pb-3 pt-4">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-1 shrink-0"
            aria-label="Vorheriger Marktplatz"
            onClick={() => onStep(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <DialogTitle className="text-center text-lg font-semibold tracking-tight">
              {label}
            </DialogTitle>
            <DialogDescription className="mt-2 text-center text-xs">
              Präsentation Marktentwicklung · Zeitraum: {formatRangeShort(periodFrom, periodTo)} ·
              Vorperiode gleicher Länge · Diagramm, Kennzahlen &amp; Aktionsbereiche · Pfeiltasten ← →
            </DialogDescription>
            <div className="mt-4">{logoBlock}</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="mt-1 shrink-0"
            aria-label="Nächster Marktplatz"
            onClick={() => onStep(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Kennzahlen
          </p>
          {marketplaceId === "amazon" ? detailAmazonKpis : detailPlaceholderKpis}
          {marketplaceId === "amazon" ? (
            <div className="pt-2">
              <Link
                href="/amazon/orders"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Zu Amazon · Bestellungen &amp; mehr →
              </Link>
            </div>
          ) : null}

          <div className="border-t border-border/50 pt-4">
            <MarketplaceRevenueChart
              periodFrom={periodFrom}
              periodTo={periodTo}
              currency={chartCurrency}
              formatCurrency={formatCurrency}
              points={marketplaceId === "amazon" ? amazonPoints : []}
              previousPoints={
                marketplaceId === "amazon" ? amazonPreviousPoints : undefined
              }
              showPreviousLine={marketplaceId === "amazon" && !!previousSummary}
              bands={actionBands}
              onBandsChange={persistActionBands}
              chartActive={chartActive}
            />
          </div>
        </div>

        <div className="border-t border-border/60 bg-muted/30 px-4 py-2 text-center text-[10px] text-muted-foreground">
          {index + 1} / {orderLen} Marktplätze
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
}: {
  slug: string;
  label: string;
  logo: string;
  onOpenDetail: () => void;
}) {
  const { slot, img } = MARKETPLACE_TILE_LOGO[placeholderTileLogoPreset(slug)];
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="group flex w-full flex-col rounded-xl border border-border/60 bg-card/90 p-4 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
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
          <p className="mt-1 text-xs text-muted-foreground">Klicken für Detailkennzahlen</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniKpi label={PLACEHOLDER_TILE_KPIS.revenue} value={PLACEHOLDER} />
        <MiniKpi label={PLACEHOLDER_TILE_KPIS.orders} value={PLACEHOLDER} />
        <MiniKpi label={PLACEHOLDER_TILE_KPIS.units} value={PLACEHOLDER} />
        <MiniKpi label={PLACEHOLDER_TILE_KPIS.trend} value={PLACEHOLDER} />
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Popup: Detail · später: Bestellungen, Produkte, Retouren
      </p>
    </button>
  );
}

export default function AnalyticsMarketplacesPage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [amazonLoading, setAmazonLoading] = useState(true);
  const [amazonError, setAmazonError] = useState<string | null>(null);
  const [amazonData, setAmazonData] = useState<AmazonSalesCompareResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setAmazonLoading(true);
      setAmazonError(null);
      try {
        const params = new URLSearchParams({
          compare: "true",
          from: period.from,
          to: period.to,
        });
        const res = await fetch(`/api/amazon/sales?${params}`);
        const payload = (await res.json()) as AmazonSalesCompareResponse;
        if (!res.ok) {
          throw new Error(payload.error ?? "Amazon-Kennzahlen konnten nicht geladen werden.");
        }
        setAmazonData(payload);
      } catch (e) {
        setAmazonError(e instanceof Error ? e.message : "Unbekannter Fehler.");
        setAmazonData(null);
      } finally {
        setAmazonLoading(false);
      }
    };
    void load();
  }, [period.from, period.to]);

  const summary = amazonData?.summary;
  const prev = amazonData?.previousSummary;
  const trend = summary
    ? formatTrendPct(
        amazonData?.revenueDeltaPct,
        prev?.salesAmount ?? 0,
        summary.salesAmount
      )
    : { text: PLACEHOLDER, direction: "unknown" as TrendDirection };

  const totals = useMemo(() => buildMarketplaceTotals(amazonData), [amazonData]);

  const amazonLogo = MARKETPLACE_TILE_LOGO.amazon;
  const amazonKpis = useMemo(
    () => kpiLabelsForPeriod(period.from, period.to),
    [period.from, period.to]
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
    <div className="space-y-6">
      <TotalMarketplacesKpiStrip
        loading={amazonLoading}
        error={amazonError}
        totals={totals}
        periodFrom={period.from}
        periodTo={period.to}
        onPeriodChange={(from, to) => setPeriod({ from, to })}
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
        summary={summary}
        previousSummary={prev}
        trend={trend}
        amazonKpis={amazonKpis}
        amazonPoints={amazonData?.points ?? []}
        amazonPreviousPoints={amazonData?.previousPoints}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => openDetailAt("amazon")}
          className="group flex flex-col rounded-xl border border-border/60 bg-card/90 p-4 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className={amazonLogo.slot}>
                <Image
                  src="/brand/amazon-logo-current.png"
                  alt="Amazon"
                  width={290}
                  height={58}
                  className={amazonLogo.img}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Zeitraum wie Gesamt: {formatRangeShort(period.from, period.to)}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>

          {amazonError ? (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-900">
              {amazonError}
            </p>
          ) : null}

          {amazonLoading ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-lg bg-muted/50" />
              ))}
            </div>
          ) : summary ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniKpi
                label={amazonKpis.revenue}
                value={formatCurrency(summary.salesAmount, summary.currency)}
              />
              <MiniKpi label={amazonKpis.orders} value={formatInt(summary.orderCount)} />
              <MiniKpi label={amazonKpis.units} value={formatInt(summary.units)} />
              <MiniKpi label={amazonKpis.trend} value={trend.text} trendDirection={trend.direction} />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniKpi label={amazonKpis.revenue} value={PLACEHOLDER} />
              <MiniKpi label={amazonKpis.orders} value={PLACEHOLDER} />
              <MiniKpi label={amazonKpis.units} value={PLACEHOLDER} />
              <MiniKpi label={amazonKpis.trend} value={PLACEHOLDER} />
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            Klicken für Detailkennzahlen · Bestellungen im Amazon-Bereich
          </p>
        </button>

        {ANALYTICS_MARKETPLACES.map(({ slug, label, logo }) => (
          <PlaceholderTile
            key={slug}
            slug={slug}
            label={label}
            logo={logo}
            onOpenDetail={() => openDetailAt(slug)}
          />
        ))}
      </div>

      <MarketplacePriceParitySection />
    </div>
  );
}
