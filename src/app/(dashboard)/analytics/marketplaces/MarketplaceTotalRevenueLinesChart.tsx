"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  bandToXIndexRange,
  type MarketplaceActionBand,
} from "./marketplaceActionBands";
import { enumerateYmd, type SalesPointRow } from "./MarketplaceRevenueChart";

export type MarketplaceRevenueLineSeries = {
  id: string;
  dataKey: string;
  label: string;
  color: string;
  points: SalesPointRow[];
};

/** Feste Farben pro Marktplatz (Gesamt-Liniendiagramm) */
export const MARKETPLACE_REVENUE_LINE_COLORS: Record<string, string> = {
  amazon: "#FF9900",
  ebay: "#2563eb",
  otto: "#c41e3a",
  kaufland: "#b30000",
  fressnapf: "#008c45",
  "mediamarkt-saturn": "#2563eb",
  zooplus: "#e87722",
  tiktok: "#06b6d4",
  shopify: "#5c8a39",
};

const PREV_PERIOD_STROKE = "#64748b";
/** Tooltip „Gesamtumsatz (Tag)“ — optisch an die kombinierte Umsatzlinie angelehnt. */
const CURRENT_DAY_TOTAL_STROKE = "hsl(210 100% 52%)";
const BAR_FILL = "#cbd5e1";

function buildMergedRows(
  dates: string[],
  series: MarketplaceRevenueLineSeries[],
  dailyOrders: number[],
  previousRevenue: number[] | null
): Record<string, string | number | null>[] {
  const keyed = series.map((s) => ({
    dataKey: s.dataKey,
    map: new Map(s.points.map((p) => [p.date, p.amount])),
  }));
  return dates.map((date, i) => {
    const row: Record<string, string | number | null> = {
      /** Numerische X-Position: volle Plotbreite ohne Band-Padding (Recharts category/band). */
      xIndex: i,
      date,
      orders: dailyOrders[i] ?? 0,
      prevTotal: previousRevenue?.[i] ?? null,
    };
    for (const { dataKey, map } of keyed) {
      row[dataKey] = map.get(date) ?? 0;
    }
    return row;
  });
}

type TooltipPayload = {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
  payload?: Record<string, unknown>;
};

function TotalComboTooltip({
  active,
  payload,
  label,
  formatCurrency,
  displayCurrency,
  formatInt,
  dfLocale,
  ordersLabel,
  currentPeriodDayTotalLabel,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatCurrency: (amount: number, currency: string) => string;
  displayCurrency: string;
  formatInt: (n: number) => string;
  dfLocale: DateFnsLocale;
  ordersLabel: string;
  currentPeriodDayTotalLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const dateRaw =
    (payload[0]?.payload as { date?: string } | undefined)?.date ?? label;
  let dateLabel = "—";
  if (dateRaw) {
    try {
      dateLabel = format(parseISO(String(dateRaw)), "P", { locale: dfLocale });
    } catch {
      dateLabel = String(dateRaw);
    }
  }

  const revenueSeries = payload.filter((e) => {
    const k = String(e.dataKey ?? "");
    return k !== "orders" && k !== "prevTotal";
  });
  const currentDayTotalRevenue = revenueSeries.reduce(
    (acc, e) => acc + Number(e.value ?? 0),
    0
  );
  const monetaryPositive = revenueSeries.filter(
    (e) => e.value != null && Number(e.value) > 0
  );
  const ordersEntry = payload.find((e) => e.dataKey === "orders");
  const prevEntry = payload.find((e) => e.dataKey === "prevTotal");

  const sortedMoney = [...monetaryPositive].sort(
    (a, b) => Number(b.value ?? 0) - Number(a.value ?? 0)
  );

  const showSummaryFooter =
    (prevEntry && prevEntry.value != null && Number(prevEntry.value) > 0) ||
    Number.isFinite(currentDayTotalRevenue);

  return (
    <div className="max-h-[min(60vh,340px)] overflow-y-auto rounded-lg border border-border/50 bg-background/98 px-3 py-2.5 text-xs shadow-md">
      <p className="text-[13px] font-medium text-foreground">{dateLabel}</p>
      <ul className="mt-2 space-y-1.5 tabular-nums text-muted-foreground">
        {ordersEntry && ordersEntry.value != null ? (
          <li className="flex justify-between gap-6">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm bg-[#cbd5e1]" aria-hidden />
              <span>{ordersLabel}</span>
            </span>
            <span className="font-medium text-foreground">{formatInt(Number(ordersEntry.value))}</span>
          </li>
        ) : null}
        {sortedMoney.map((entry) => {
          const v = entry.value;
          if (v === undefined || v === null || Number(v) <= 0) return null;
          return (
            <li key={String(entry.dataKey)} className="flex justify-between gap-6">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color ?? "currentColor" }}
                  aria-hidden
                />
                <span className="truncate">{entry.name}</span>
              </span>
              <span className="font-medium text-foreground">
                {formatCurrency(Number(v), displayCurrency)}
              </span>
            </li>
          );
        })}
      </ul>
      {showSummaryFooter ? (
        <div className="mt-2 space-y-1.5 border-t border-border/45 pt-2 tabular-nums text-muted-foreground">
          {prevEntry && prevEntry.value != null && Number(prevEntry.value) > 0 ? (
            <div className="flex justify-between gap-6">
              <span className="flex items-center gap-2">
                <span className="relative h-0.5 w-5 shrink-0" aria-hidden>
                  <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#64748b]" />
                </span>
                <span>{prevEntry.name}</span>
              </span>
              <span className="font-medium text-foreground">
                {formatCurrency(Number(prevEntry.value), displayCurrency)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between gap-6">
            <span className="flex items-center gap-2">
              <span className="relative h-0.5 w-5 shrink-0" aria-hidden>
                <span
                  className="absolute inset-x-0 top-1/2 h-0.5 rounded-full"
                  style={{ backgroundColor: CURRENT_DAY_TOTAL_STROKE }}
                />
              </span>
              <span>{currentPeriodDayTotalLabel}</span>
            </span>
            <span className="font-medium text-foreground">
              {formatCurrency(currentDayTotalRevenue, displayCurrency)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChartLegend({
  series,
  ordersLabel,
  prevPeriodLabel,
  showPrev,
}: {
  series: MarketplaceRevenueLineSeries[];
  ordersLabel: string;
  prevPeriodLabel: string;
  showPrev: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-border/30 px-0 pt-2 text-[10px] leading-snug text-muted-foreground/80"
      role="list"
    >
      <span className="inline-flex items-center gap-1.5" role="listitem">
        <span className="h-2 w-2 rounded-sm bg-[#cbd5e1]" aria-hidden />
        <span>{ordersLabel}</span>
      </span>
      {showPrev ? (
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className="relative h-0.5 w-5 shrink-0" aria-hidden>
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-[#64748b]" />
          </span>
          <span>{prevPeriodLabel}</span>
        </span>
      ) : null}
      {series.map((s) => (
        <span key={s.id} className="inline-flex max-w-[10rem] items-center gap-1.5" role="listitem">
          <span className="relative h-0.5 w-5 shrink-0" aria-hidden>
            <span
              className="absolute inset-x-0 top-1/2 h-0.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
          </span>
          <span className="truncate leading-tight">{s.label}</span>
        </span>
      ))}
    </div>
  );
}

export function MarketplaceTotalRevenueLinesChart({
  periodFrom,
  periodTo,
  series,
  dailyOrders,
  previousRevenue,
  displayCurrency,
  intlTag,
  dfLocale,
  formatCurrency,
  formatInt,
  emptyLabel,
  ordersLabel,
  prevPeriodLabel,
  currentPeriodDayTotalLabel,
  bands = [],
}: {
  periodFrom: string;
  periodTo: string;
  series: MarketplaceRevenueLineSeries[];
  dailyOrders: number[];
  previousRevenue: number[] | null;
  displayCurrency: string;
  intlTag: string;
  dfLocale: DateFnsLocale;
  formatCurrency: (amount: number, currency: string) => string;
  formatInt: (n: number) => string;
  emptyLabel: string;
  ordersLabel: string;
  prevPeriodLabel: string;
  /** Tooltip: Summe aller Marktplatz-Umsätze am Hover-Tag (lokalisierter Name). */
  currentPeriodDayTotalLabel: string;
  /** Farbflächen (nur „alle Marktplätze“-Deals) */
  bands?: MarketplaceActionBand[];
}) {
  const dates = useMemo(() => enumerateYmd(periodFrom, periodTo), [periodFrom, periodTo]);

  const chartData = useMemo(
    () => buildMergedRows(dates, series, dailyOrders, previousRevenue),
    [dates, series, dailyOrders, previousRevenue]
  );

  const hasAnyRevenue = useMemo(
    () => series.some((s) => s.points.some((p) => (p.amount ?? 0) > 0)),
    [series]
  );

  const hasAnyOrders = useMemo(() => dailyOrders.some((o) => o > 0), [dailyOrders]);

  const showPrev = useMemo(
    () => (previousRevenue?.some((v) => v > 0) ?? false),
    [previousRevenue]
  );

  const hasData = hasAnyRevenue || hasAnyOrders || showPrev;

  const xTicks = useMemo(() => {
    const n = chartData.length;
    if (n === 0) return [];
    if (n <= 18) return Array.from({ length: n }, (_, i) => i);
    const maxTicks = 14;
    const step = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)));
    const set = new Set<number>([0]);
    for (let i = step; i < n - 1; i += step) set.add(i);
    set.add(n - 1);
    return [...set].sort((a, b) => a - b);
  }, [chartData]);

  /**
   * Kleiner Innenrand gegen Überlappung mit Y-Zahlen — bewusst moderat, damit die Kurven
   * nicht wieder „in der Mitte zusammengedrückt“ wirken.
   */
  const xDomain = useMemo((): [number, number] => {
    const max = Math.max(0, chartData.length - 1);
    if (max === 0) return [-0.22, 0.22];
    const span = max;
    const inset = Math.min(0.3, Math.max(0.055, span * 0.032));
    return [-inset, max + inset];
  }, [chartData.length]);

  /** Max. Umsatz inkl. Vorperiode-Linie — Y-Achse endet knapp darüber (kein „6000 €“-Leerraum). */
  const maxAmtInChart = useMemo(() => {
    let m = 0;
    for (const row of chartData) {
      for (const s of series) {
        const v = Number(row[s.dataKey] ?? 0);
        if (v > m) m = v;
      }
      const pv = row.prevTotal;
      if (pv != null && Number.isFinite(Number(pv)) && Number(pv) > m) m = Number(pv);
    }
    return m;
  }, [chartData, series]);

  const yAmtDomainMax = useMemo(() => {
    if (maxAmtInChart <= 0) return 1;
    return Math.max(maxAmtInChart * 1.04, maxAmtInChart + 1);
  }, [maxAmtInChart]);

  const maxOrdInChart = useMemo(() => {
    let m = 0;
    for (const row of chartData) {
      const v = Number(row.orders ?? 0);
      if (v > m) m = v;
    }
    return m;
  }, [chartData]);

  const yOrdDomainMax = useMemo(() => {
    if (maxOrdInChart <= 0) return 1;
    return Math.max(maxOrdInChart * 1.08, maxOrdInChart + 1);
  }, [maxOrdInChart]);

  const bandIndexRanges = useMemo(
    () =>
      bands
        .map((b) => {
          const r = bandToXIndexRange(b, periodFrom, periodTo, dates);
          return r ? { band: b, ...r } : null;
        })
        .filter(Boolean) as { band: MarketplaceActionBand; x1: number; x2: number }[],
    [bands, periodFrom, periodTo, dates]
  );

  if (!dates.length || !series.length) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center rounded-xl text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center rounded-xl text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="rounded-xl bg-background py-1">
        <div className="h-[min(348px,50vh)] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 4, right: 3, left: 3, bottom: 6 }}
            >
              <CartesianGrid
                strokeDasharray="3 12"
                vertical={false}
                stroke="var(--border)"
                strokeOpacity={0.22}
              />
              <XAxis
                type="number"
                dataKey="xIndex"
                domain={xDomain}
                ticks={xTicks}
                allowDecimals={false}
                padding={{ left: 0, right: 0 }}
                tickFormatter={(v) => {
                  const idx = Number(v);
                  const dateStr = chartData[idx]?.date;
                  if (!dateStr) return "";
                  try {
                    return format(parseISO(String(dateStr)), "dd.MM.", { locale: dfLocale });
                  } catch {
                    return String(dateStr);
                  }
                }}
                tick={{
                  fontSize: 9,
                  fill: "var(--muted-foreground)",
                  fontWeight: 400,
                  opacity: 0.55,
                }}
                tickLine={false}
                tickMargin={5}
                axisLine={{ stroke: "var(--border)", strokeOpacity: 0.28 }}
              />
              <YAxis
                yAxisId="amt"
                niceTicks="none"
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return "";
                  return new Intl.NumberFormat(intlTag, {
                    style: "currency",
                    currency: displayCurrency || "EUR",
                    notation: Math.abs(n) >= 500 ? "compact" : "standard",
                    maximumFractionDigits: Math.abs(n) >= 500 ? 1 : 0,
                  }).format(n);
                }}
                width={40}
                tick={{
                  fontSize: 9,
                  fill: "var(--muted-foreground)",
                  fontWeight: 400,
                  opacity: 0.5,
                  dx: -2,
                }}
                tickLine={false}
                axisLine={false}
                domain={[0, yAmtDomainMax]}
              />
              <YAxis
                yAxisId="ord"
                orientation="right"
                allowDecimals={false}
                niceTicks="none"
                width={22}
                tick={{
                  fontSize: 9,
                  fill: "var(--muted-foreground)",
                  fontWeight: 400,
                  opacity: 0.5,
                  dx: 2,
                }}
                tickLine={false}
                axisLine={false}
                domain={[0, yOrdDomainMax]}
              />
              <Tooltip
                shared
                cursor={{ stroke: "var(--border)", strokeOpacity: 0.6, strokeWidth: 1 }}
                content={
                  <TotalComboTooltip
                    formatCurrency={formatCurrency}
                    displayCurrency={displayCurrency}
                    formatInt={formatInt}
                    dfLocale={dfLocale}
                    ordersLabel={ordersLabel}
                    currentPeriodDayTotalLabel={currentPeriodDayTotalLabel}
                  />
                }
              />
              {bandIndexRanges.map(({ band, x1, x2 }) => (
                <ReferenceArea
                  key={band.id}
                  yAxisId="amt"
                  x1={x1}
                  x2={x2}
                  fill={band.color}
                  fillOpacity={0.12}
                  stroke={band.color}
                  strokeOpacity={0.28}
                />
              ))}
              <Bar
                yAxisId="ord"
                dataKey="orders"
                name={ordersLabel}
                fill={BAR_FILL}
                fillOpacity={0.48}
                radius={[5, 5, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
              {showPrev ? (
                <Line
                  yAxisId="amt"
                  type="natural"
                  dataKey="prevTotal"
                  name={prevPeriodLabel}
                  stroke={PREV_PERIOD_STROKE}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="6 5"
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              {series.map((s) => (
                <Line
                  key={s.id}
                  yAxisId="amt"
                  type="natural"
                  dataKey={s.dataKey}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2.75}
                  strokeOpacity={0.95}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <ChartLegend
          series={series}
          ordersLabel={ordersLabel}
          prevPeriodLabel={prevPeriodLabel}
          showPrev={showPrev}
        />
      </div>
    </div>
  );
}
