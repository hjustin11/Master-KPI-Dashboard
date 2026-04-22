"use client";

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import type { WeeklyReportTotals } from "@/shared/lib/weeklyReport/weeklyReportService";

const fmtEur = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmtInt = (v: number) => v.toLocaleString("de-DE");
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
const fmtPp = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} pp`;
const fmtDeltaPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

function trendOf(v: number, inverse = false): "up" | "down" | "flat" {
  const adj = inverse ? -v : v;
  if (adj > 0.5) return "up";
  if (adj < -0.5) return "down";
  return "flat";
}

function DeltaRow({
  trend,
  label,
  vsLabel,
}: {
  trend: "up" | "down" | "flat";
  label: string;
  vsLabel: string;
}) {
  const Icon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : ArrowRight;
  const color =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", color)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{vsLabel}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  trend,
  vsLabel,
}: {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  vsLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-6 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      <DeltaRow trend={trend} label={delta} vsLabel={vsLabel} />
    </div>
  );
}

export type WeeklyReportSummaryGridProps = {
  totals: WeeklyReportTotals;
};

export function WeeklyReportSummaryGrid({ totals }: WeeklyReportSummaryGridProps) {
  const { t } = useTranslation();
  const vs = t("weeklyReport.kpi.vsPrevious");
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label={t("weeklyReport.kpi.revenue")}
        value={fmtEur(totals.current.revenue)}
        delta={fmtDeltaPct(totals.deltas.revenuePercent)}
        trend={trendOf(totals.deltas.revenuePercent)}
        vsLabel={vs}
      />
      <KpiCard
        label={t("weeklyReport.kpi.orders")}
        value={fmtInt(totals.current.orders)}
        delta={fmtDeltaPct(totals.deltas.ordersPercent)}
        trend={trendOf(totals.deltas.ordersPercent)}
        vsLabel={vs}
      />
      <KpiCard
        label={t("weeklyReport.kpi.aov")}
        value={fmtEur(totals.current.avgOrderValue)}
        delta={fmtDeltaPct(totals.deltas.avgOrderValuePercent)}
        trend={trendOf(totals.deltas.avgOrderValuePercent)}
        vsLabel={vs}
      />
      <KpiCard
        label={t("weeklyReport.kpi.returns")}
        value={fmtPct(totals.current.returnRate)}
        delta={fmtPp(totals.deltas.returnRatePp)}
        trend={trendOf(totals.deltas.returnRatePp, true)}
        vsLabel={vs}
      />
    </div>
  );
}
