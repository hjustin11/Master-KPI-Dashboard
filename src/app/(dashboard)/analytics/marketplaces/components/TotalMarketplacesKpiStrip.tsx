"use client";

import { useMemo } from "react";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MarketplaceTotalRevenueLinesChart,
  type MarketplaceRevenueLineSeries,
} from "../MarketplaceTotalRevenueLinesChart";
import { MarketplaceAnalyticsDataQualityNotice } from "../MarketplaceAnalyticsDataQualityNotice";
import type { MarketplaceActionBand } from "../marketplaceActionBands";
import { PLACEHOLDER, type TrendDirection } from "@/shared/lib/marketplace-sales-types";
import {
  formatCurrency,
  formatInt,
  formatRangeShort,
  formatTrendPct,
  type TotalsInput,
} from "@/shared/lib/marketplace-analytics-utils";
import { MiniKpi } from "./MiniKpi";
import { PeriodRangePicker } from "./PeriodRangePicker";

export function TotalMarketplacesKpiStrip({
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
