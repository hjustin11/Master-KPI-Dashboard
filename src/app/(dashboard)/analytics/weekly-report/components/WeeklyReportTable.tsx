"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import type { WeeklyMarketplaceData } from "@/shared/lib/weeklyReport/weeklyReportService";
import { WeeklyReportDetailPanel } from "./WeeklyReportDetailPanel";

const fmtEur = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmtInt = (v: number) => v.toLocaleString("de-DE");
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
const fmtDeltaPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

function trendColor(deltaPercent: number): string {
  if (deltaPercent > 5) return "#16a34a"; // emerald-600
  if (deltaPercent < -5) return "#dc2626"; // red-600
  return "#64748b"; // slate-500
}

function shareBarColor(deltaPercent: number): string {
  if (deltaPercent > 0) return "#16a34a";
  if (deltaPercent < 0) return "#ea580c"; // orange-600
  return "#64748b";
}

function deltaIcon(deltaPercent: number) {
  if (deltaPercent > 0.5) return <ArrowUp className="inline h-3.5 w-3.5" aria-hidden />;
  if (deltaPercent < -0.5) return <ArrowDown className="inline h-3.5 w-3.5" aria-hidden />;
  return <ArrowRight className="inline h-3.5 w-3.5" aria-hidden />;
}

function deltaTextClass(deltaPercent: number): string {
  if (deltaPercent > 0.5) return "text-emerald-600 dark:text-emerald-400";
  if (deltaPercent < -0.5) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function sparklinePoints(values: number[]): string {
  if (values.length === 0) return "";
  const W = 72;
  const H = 28;
  const PAD_X = 2;
  const PAD_Y = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (W - PAD_X * 2) / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = PAD_X + i * xStep;
      const yNorm = (v - min) / range;
      const y = H - PAD_Y - yNorm * (H - PAD_Y * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export type WeeklyReportTableProps = {
  marketplaces: WeeklyMarketplaceData[];
  weekNumber?: number;
  isoYear?: number;
};

export function WeeklyReportTable({ marketplaces, weekNumber, isoYear }: WeeklyReportTableProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const totalRevenue = useMemo(
    () => marketplaces.reduce((acc, m) => acc + m.current.revenue, 0),
    [marketplaces]
  );

  const toggleRow = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const allExpanded = expanded.size === marketplaces.length && marketplaces.length > 0;

  const toggleAll = useCallback(() => {
    setExpanded((prev) =>
      prev.size === marketplaces.length ? new Set() : new Set(marketplaces.map((m) => m.slug))
    );
  }, [marketplaces]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {allExpanded ? t("weeklyReport.table.collapseAll") : t("weeklyReport.table.expandAll")}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weeklyReport.table.marketplace")}
                </th>
                <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weeklyReport.table.revenue")}
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weeklyReport.table.share")}
                </th>
                <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weeklyReport.table.orders")}
                </th>
                <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weeklyReport.table.returns")}
                </th>
                <th className="px-6 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("weeklyReport.table.trend")}
                </th>
              </tr>
            </thead>
            <tbody>
              {marketplaces.map((mp, idx) => {
                const share = totalRevenue > 0 ? (mp.current.revenue / totalRevenue) * 100 : 0;
                const stroke = trendColor(mp.deltas.revenuePercent);
                const barColor = shareBarColor(mp.deltas.revenuePercent);
                const points = sparklinePoints(mp.dailyRevenue);
                const isExpanded = expanded.has(mp.slug);
                const notLast = idx < marketplaces.length - 1;
                return (
                  <Fragment key={mp.slug}>
                    <tr
                      onClick={() => toggleRow(mp.slug)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        (notLast || isExpanded) && "border-b"
                      )}
                      aria-expanded={isExpanded}
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              isExpanded && "rotate-90"
                            )}
                            aria-hidden
                          />
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-background p-1">
                            <Image
                              src={mp.logo}
                              alt={mp.name}
                              fill
                              sizes="40px"
                              className="object-contain p-1"
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-base font-semibold text-foreground">{mp.name}</span>
                            {mp.error ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" aria-hidden />
                                {t("weeklyReport.table.errorHint")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right tabular-nums">
                        <div className="text-base font-semibold text-foreground">
                          {fmtEur(mp.current.revenue)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t("weeklyReport.table.previousShort")}: {fmtEur(mp.previous.revenue)}
                        </div>
                        <div className={cn("mt-0.5 text-sm font-medium", deltaTextClass(mp.deltas.revenuePercent))}>
                          {deltaIcon(mp.deltas.revenuePercent)} {fmtDeltaPct(mp.deltas.revenuePercent)}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, share)}%`,
                                background: barColor,
                              }}
                            />
                          </div>
                          <span className="min-w-[44px] text-right text-sm font-medium tabular-nums text-muted-foreground">
                            {share.toFixed(1).replace(".", ",")} %
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right text-base font-medium tabular-nums text-foreground">
                        {fmtInt(mp.current.orders)}
                      </td>
                      <td className="px-6 py-5 text-right text-base font-medium tabular-nums text-muted-foreground">
                        {mp.current.returnRate > 0 ? fmtPct(mp.current.returnRate) : "—"}
                      </td>
                      <td className="px-6 py-5">
                        {points ? (
                          <svg width="72" height="28" viewBox="0 0 72 28" aria-hidden>
                            <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("weeklyReport.table.noData")}</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={cn(notLast && "border-b")}>
                        <td colSpan={6} className="bg-muted/30 px-6 py-5">
                          <WeeklyReportDetailPanel
                            marketplace={mp}
                            weekNumber={weekNumber}
                            isoYear={isoYear}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
