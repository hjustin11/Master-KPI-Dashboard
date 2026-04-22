"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/i18n/I18nProvider";
import type {
  WeeklyMarketplaceData,
  WeeklyTopSku,
} from "@/shared/lib/weeklyReport/weeklyReportService";
import { WeeklyReportNoteEditor } from "./WeeklyReportNoteEditor";
import { WeeklyReportTopSkuDialog } from "./WeeklyReportTopSkuDialog";

const fmtEur = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmtEurPrecise = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
const fmtInt = (v: number) => v.toLocaleString("de-DE");
const fmtDeltaPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

const INITIAL_VISIBLE = 10;

type SkuRowProps = {
  item: WeeklyTopSku;
  rank: number;
  positive: boolean;
  weekNumber?: number;
};

function SkuRow({ item, rank, positive, weekNumber }: SkuRowProps) {
  const { t } = useTranslation();
  const colorClass = positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  const tooltipRevenue = t("weeklyReport.details.tooltipRevenue", {
    week: String(weekNumber ?? ""),
    current: fmtEur(item.revenueCurrent),
    previous: fmtEur(item.revenuePrevious),
  });
  const tooltipOrders = t("weeklyReport.details.tooltipOrders", {
    current: fmtInt(item.ordersCurrent),
    previous: fmtInt(item.ordersPrevious),
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <li className="grid cursor-default grid-cols-[28px_1fr_64px_64px_96px_72px] items-baseline gap-3 rounded-md border bg-card px-3 py-2 shadow-sm transition-colors hover:bg-muted/60" />
        }
      >
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {t("weeklyReport.details.rankPrefix", { rank: String(rank) })}
        </span>
        <div className="min-w-0">
          <div className="truncate font-mono text-xs font-semibold text-foreground" title={item.sku}>
            {item.sku}
          </div>
          {item.name && item.name !== item.sku ? (
            <div className="truncate text-[11px] text-muted-foreground" title={item.name}>
              {item.name}
            </div>
          ) : null}
        </div>
        <span className="text-center text-xs tabular-nums text-foreground">
          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
            {t("weeklyReport.details.ordersCurrentShort")}
          </span>
          {fmtInt(item.ordersCurrent)}
        </span>
        <span className="text-center text-xs tabular-nums text-muted-foreground">
          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
            {t("weeklyReport.details.ordersPreviousShort")}
          </span>
          {fmtInt(item.ordersPrevious)}
        </span>
        <span className="text-right text-xs tabular-nums text-foreground">
          <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
            {t("weeklyReport.details.revenueShort")}
          </span>
          {fmtEur(item.revenueCurrent)}
        </span>
        <span className={cn("text-right text-sm font-semibold tabular-nums", colorClass)}>
          {fmtDeltaPct(item.deltaPercent)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="text-xs">
        <div>{tooltipRevenue}</div>
        <div>{tooltipOrders}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function SkuColumn({
  title,
  items,
  emptyLabel,
  positive,
  onShowMore,
  weekNumber,
}: {
  title: string;
  items: WeeklyTopSku[];
  emptyLabel: string;
  positive: boolean;
  onShowMore?: () => void;
  weekNumber?: number;
}) {
  const { t } = useTranslation();
  const visible = items.slice(0, INITIAL_VISIBLE);
  const hasMore = items.length > INITIAL_VISIBLE;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title} <span className="ml-1 text-muted-foreground/60">({items.length})</span>
        </div>
        {hasMore && onShowMore ? (
          <button
            type="button"
            onClick={onShowMore}
            className="text-[11px] font-medium text-foreground/80 hover:text-foreground"
          >
            {t("weeklyReport.details.showMore", { count: String(items.length) })}
          </button>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <div className="flex items-center justify-center rounded-md border border-dashed bg-card/50 px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((item, idx) => (
            <SkuRow
              key={item.sku}
              item={item}
              rank={idx + 1}
              positive={positive}
              weekNumber={weekNumber}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function priceSparklinePoints(values: number[]): string {
  if (values.length === 0) return "";
  const W = 480;
  const H = 60;
  const PAD_X = 6;
  const PAD_Y = 6;
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return "";
  const min = Math.min(...nonZero);
  const max = Math.max(...nonZero);
  const range = max - min || 1;
  const xStep = (W - PAD_X * 2) / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = PAD_X + i * xStep;
      const yNorm = v > 0 ? (v - min) / range : 0;
      const y = H - PAD_Y - yNorm * (H - PAD_Y * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function PriceTrendBlock({ marketplace }: { marketplace: WeeklyMarketplaceData }) {
  const { t } = useTranslation();
  const trend = marketplace.averagePriceTrend;
  const trendColor =
    trend.deltaPercent > 0.5
      ? "text-emerald-600 dark:text-emerald-400"
      : trend.deltaPercent < -0.5
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const strokeColor =
    trend.deltaPercent > 0.5 ? "#16a34a" : trend.deltaPercent < -0.5 ? "#dc2626" : "#64748b";
  const TrendIcon = trend.deltaPercent >= 0 ? TrendingUp : TrendingDown;

  const dailyAvgPrice = marketplace.dailyRevenue.map((rev, i) => {
    const orders = marketplace.dailyOrders[i] ?? 0;
    return orders > 0 ? rev / orders : 0;
  });
  const hasDailyData = dailyAvgPrice.some((v) => v > 0);
  const points = priceSparklinePoints(dailyAvgPrice);
  const dayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("weeklyReport.details.priceTrend")}
      </div>
      <div className="rounded-md border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">{t("weeklyReport.details.avgPriceCurrent")}: </span>
            <span className="font-semibold tabular-nums text-foreground">{fmtEurPrecise(trend.current)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("weeklyReport.details.avgPricePrevious")}: </span>
            <span className="tabular-nums text-muted-foreground">{fmtEurPrecise(trend.previous)}</span>
          </div>
          <div className="ml-auto">
            <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", trendColor)}>
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              {fmtDeltaPct(trend.deltaPercent)}
            </span>
          </div>
        </div>
        <div className="mt-3 border-t pt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("weeklyReport.details.dailyChartLabel")}
          </div>
          {hasDailyData && points ? (
            <div>
              <svg width="100%" height="60" viewBox="0 0 480 60" preserveAspectRatio="none" aria-hidden>
                <polyline
                  points={points}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                {dayLabels.map((d, i) => (
                  <span key={d} className="tabular-nums">
                    {d}
                    {dailyAvgPrice[i] > 0 ? (
                      <span className="ml-1 text-foreground/80">
                        {Math.round(dailyAvgPrice[i]).toLocaleString("de-DE")}€
                      </span>
                    ) : (
                      <span className="ml-1 text-muted-foreground/60">—</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-2 text-xs text-muted-foreground">{t("weeklyReport.details.noDaily")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export type WeeklyReportDetailPanelProps = {
  marketplace: WeeklyMarketplaceData;
  weekNumber?: number;
  isoYear?: number;
};

export function WeeklyReportDetailPanel({
  marketplace,
  weekNumber,
  isoYear,
}: WeeklyReportDetailPanelProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <TooltipProvider delay={150}>
      <div className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <SkuColumn
            title={t("weeklyReport.details.topGainers")}
            items={marketplace.topGainers}
            emptyLabel={t("weeklyReport.details.noGainers")}
            positive
            onShowMore={() => setDialogOpen(true)}
            weekNumber={weekNumber}
          />
          <SkuColumn
            title={t("weeklyReport.details.topLosers")}
            items={marketplace.topLosers}
            emptyLabel={t("weeklyReport.details.noLosers")}
            positive={false}
            onShowMore={() => setDialogOpen(true)}
            weekNumber={weekNumber}
          />
        </div>
        <PriceTrendBlock marketplace={marketplace} />
        {isoYear && weekNumber ? (
          <WeeklyReportNoteEditor
            marketplaceSlug={marketplace.slug}
            isoYear={isoYear}
            isoWeek={weekNumber}
          />
        ) : null}
      </div>
      <WeeklyReportTopSkuDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        marketplace={marketplace}
        weekNumber={weekNumber}
      />
    </TooltipProvider>
  );
}
