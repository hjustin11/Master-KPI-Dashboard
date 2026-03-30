"use client";

import { useMemo } from "react";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { useTranslation } from "@/i18n/I18nProvider";
import { getDateFnsLocale, intlLocaleTag } from "@/i18n/locale-formatting";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clipBandToRange, type MarketplaceActionBand } from "./marketplaceActionBands";

export type SalesPointRow = {
  date: string;
  orders: number;
  amount: number;
  units: number;
};

export function enumerateYmd(from: string, to: string): string[] {
  const start = parseISO(from);
  const end = parseISO(to);
  if (start > end) return [];
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

function mergeChartRows(
  dates: string[],
  points: SalesPointRow[],
  previousPoints: SalesPointRow[] | undefined,
  showPreviousLine: boolean
) {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const prevSorted = previousPoints
    ? [...previousPoints].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  return dates.map((date, i) => {
    const row = byDate.get(date);
    const prevVal =
      showPreviousLine && prevSorted.length > 0 ? (prevSorted[i]?.amount ?? 0) : null;
    return {
      date,
      amount: row?.amount ?? 0,
      orders: row?.orders ?? 0,
      prevAmount: prevVal,
    };
  });
}

type TooltipEntry = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  payload?: { date?: string };
};

function ChartTooltipContent({
  active,
  payload,
  label,
  formatCurrency,
  currency,
  dfLocale,
  ordersLabel,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatCurrency: (amount: number, currency: string) => string;
  currency: string;
  dfLocale: ReturnType<typeof getDateFnsLocale>;
  ordersLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload as { date?: string } | undefined;
  const dateRaw = data?.date ?? label;
  let dateLabel = "—";
  if (dateRaw) {
    try {
      dateLabel = format(parseISO(String(dateRaw)), "P", { locale: dfLocale });
    } catch {
      dateLabel = String(dateRaw);
    }
  }
  return (
    <div className="rounded-md border border-border/80 bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{dateLabel}</p>
      <ul className="mt-1.5 space-y-1 tabular-nums text-muted-foreground">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? "");
          if (entry.value === undefined || entry.value === null) return null;
          if (key === "orders") {
            return (
              <li key="orders" className="flex justify-between gap-6">
                <span>{entry.name ?? ordersLabel}</span>
                <span className="font-medium text-foreground">{entry.value}</span>
              </li>
            );
          }
          if (key === "amount" || key === "prevAmount") {
            return (
              <li key={key} className="flex justify-between gap-6">
                <span>{entry.name}</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(Number(entry.value), currency)}
                </span>
              </li>
            );
          }
          return null;
        })}
      </ul>
    </div>
  );
}

export function MarketplaceRevenueChart({
  periodFrom,
  periodTo,
  currency,
  formatCurrency,
  points,
  previousPoints,
  showPreviousLine,
  bands,
  chartActive,
}: {
  periodFrom: string;
  periodTo: string;
  currency: string;
  formatCurrency: (amount: number, currency: string) => string;
  points: SalesPointRow[];
  previousPoints?: SalesPointRow[];
  showPreviousLine: boolean;
  bands: MarketplaceActionBand[];
  /** z. B. nur Amazon: Kurve zeichnen; sonst nur Hinweis */
  chartActive: boolean;
}) {
  const { t, locale } = useTranslation();
  const dfLocale = getDateFnsLocale(locale);
  const intlTag = intlLocaleTag(locale);

  const dates = useMemo(() => enumerateYmd(periodFrom, periodTo), [periodFrom, periodTo]);
  const chartData = useMemo(
    () => mergeChartRows(dates, points, previousPoints, showPreviousLine),
    [dates, points, previousPoints, showPreviousLine]
  );

  const summaryLine = useMemo(() => {
    const amounts = chartData.map((d) => d.amount);
    const orders = chartData.map((d) => d.orders);
    const sumAmt = amounts.reduce((a, b) => a + b, 0);
    const sumOrd = orders.reduce((a, b) => a + b, 0);
    const maxAmt = amounts.length ? Math.max(...amounts) : 0;
    const active = amounts.filter((a) => a > 0).length;
    const days = chartData.length || 1;
    return {
      sumAmt,
      sumOrd,
      maxAmt,
      activeDays: active,
      avgPerDay: sumAmt / days,
      avgOrdersPerDay: sumOrd / days,
    };
  }, [chartData]);

  const clippedBands = useMemo(
    () =>
      bands
        .map((b) => {
          const clipped = clipBandToRange(b, periodFrom, periodTo);
          return clipped ? { band: b, ...clipped } : null;
        })
        .filter(Boolean) as { band: MarketplaceActionBand; x1: string; x2: string }[],
    [bands, periodFrom, periodTo]
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("analyticsChart.title")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("analyticsChart.subtitle")}</p>
      </div>

      {!chartActive ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/15 px-4 text-center text-sm text-muted-foreground">
          {t("analyticsChart.noDataHint")}
        </div>
      ) : (
        <div className="h-[360px] w-full min-w-0 rounded-lg border border-border/50 bg-background/40 p-1 pr-2 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => {
                  try {
                    return format(parseISO(v as string), "dd.MM.", { locale: dfLocale });
                  } catch {
                    return String(v);
                  }
                }}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                yAxisId="amt"
                tickFormatter={(v) =>
                  `${new Intl.NumberFormat(intlTag, { maximumFractionDigits: 0 }).format(Number(v))} €`
                }
                width={56}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                yAxisId="ord"
                orientation="right"
                allowDecimals={false}
                width={36}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    formatCurrency={formatCurrency}
                    currency={currency}
                    dfLocale={dfLocale}
                    ordersLabel={t("analyticsChart.tooltipOrders")}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {clippedBands.map(({ band, x1, x2 }) => (
                <ReferenceArea
                  key={band.id}
                  yAxisId="amt"
                  x1={x1}
                  x2={x2}
                  fill={band.color}
                  fillOpacity={0.14}
                  stroke={band.color}
                  strokeOpacity={0.35}
                />
              ))}
              <Bar
                yAxisId="ord"
                dataKey="orders"
                name={t("analyticsChart.ordersPerDay")}
                fill="#94a3b8"
                fillOpacity={0.4}
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              />
              {showPreviousLine ? (
                <Line
                  yAxisId="amt"
                  type="monotone"
                  dataKey="prevAmount"
                  name={t("analyticsChart.prevPeriodLine")}
                  stroke="#64748b"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 4"
                  connectNulls
                />
              ) : null}
              <Line
                yAxisId="amt"
                type="monotone"
                dataKey="amount"
                name={t("analyticsChart.revenuePerDay")}
                stroke="hsl(210 100% 52%)"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartActive ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("analyticsChart.sumPeriod")}
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">
              {formatCurrency(summaryLine.sumAmt, currency)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("analyticsChart.avgPerCalendarDay")}
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">
              {formatCurrency(summaryLine.avgPerDay, currency)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("analyticsChart.peakPerDay")}
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">
              {formatCurrency(summaryLine.maxAmt, currency)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("analyticsChart.daysWithRevenueGt0")}
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">
              {summaryLine.activeDays} / {chartData.length}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
