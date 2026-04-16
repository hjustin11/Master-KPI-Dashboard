"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { PayoutTotals, PayoutDeltas } from "@/shared/lib/payouts/payoutTypes";
import { useTranslation } from "@/i18n/I18nProvider";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

type KpiDef = {
  labelKey: string;
  value: (t: PayoutTotals) => string;
  delta: (d: PayoutDeltas) => number | null;
  borderColor: (t: PayoutTotals, d: PayoutDeltas | null) => string;
};

const KPIS: KpiDef[] = [
  {
    labelKey: "payouts.kpi.grossSales",
    value: (t) => formatEur(t.grossSales),
    delta: (d) => d.grossSales,
    borderColor: (_, d) =>
      d && d.grossSales !== null ? (d.grossSales > 0 ? "border-emerald-500" : d.grossSales < 0 ? "border-rose-500" : "border-gray-300") : "border-gray-300",
  },
  {
    labelKey: "payouts.kpi.netPayout",
    value: (t) => formatEur(t.netPayout),
    delta: (d) => d.netPayout,
    borderColor: (_, d) =>
      d && d.netPayout !== null ? (d.netPayout > 0 ? "border-emerald-500" : d.netPayout < 0 ? "border-rose-500" : "border-gray-300") : "border-gray-300",
  },
  {
    labelKey: "payouts.kpi.payoutRatio",
    value: (t) => formatPct(t.payoutRatio),
    delta: (d) => (d.payoutRatio !== null ? d.payoutRatio * 100 : null),
    borderColor: (t) => (t.payoutRatio < 0.35 ? "border-rose-500" : t.payoutRatio < 0.5 ? "border-amber-500" : "border-emerald-500"),
  },
  {
    labelKey: "payouts.kpi.returnRate",
    value: (t) => formatPct(t.returnRate),
    delta: (d) => (d.returnRate !== null ? d.returnRate * 100 : null),
    borderColor: (t) => (t.returnRate > 0.15 ? "border-rose-500" : t.returnRate > 0.08 ? "border-amber-500" : "border-emerald-500"),
  },
  {
    labelKey: "payouts.kpi.orders",
    value: (t) => String(t.ordersCount),
    delta: (d) => d.ordersCount,
    borderColor: () => "border-gray-300",
  },
  {
    labelKey: "payouts.kpi.returns",
    value: (t) => String(t.returnsCount),
    delta: () => null,
    borderColor: (t) => (t.returnsCount > 0 ? "border-amber-500" : "border-emerald-500"),
  },
];

function DeltaPill({ value }: { value: number | null }) {
  if (value === null) return null;
  const color = value > 0 ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30"
    : value < 0 ? "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/30"
    : "text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {arrow}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function PayoutsKpiGrid({
  totals,
  deltas,
  loading,
}: {
  totals: PayoutTotals | null;
  deltas: PayoutDeltas | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  if (loading || !totals) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {KPIS.map((kpi) => (
          <Card key={kpi.labelKey} className="border-t-4 border-gray-200">
            <CardContent className="p-3">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">{t(kpi.labelKey)}</p>
              <p className="mt-1 text-xl font-bold text-muted-foreground/30">—</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {KPIS.map((kpi) => (
        <Card key={kpi.labelKey} className={`border-t-4 ${kpi.borderColor(totals, deltas)}`}>
          <CardContent className="p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(kpi.labelKey)}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">{kpi.value(totals)}</p>
            {deltas && <DeltaPill value={kpi.delta(deltas)} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
