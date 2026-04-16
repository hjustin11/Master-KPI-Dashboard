"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/i18n/I18nProvider";
import usePayoutsLoader from "@/shared/hooks/usePayoutsLoader";
import usePayoutsPeriodSelector, { type CalendarPreset } from "@/shared/hooks/usePayoutsPeriodSelector";
import useSettlementPeriods from "@/shared/hooks/useSettlementPeriods";
import {
  formatSettlementLabel,
  settlementToValue,
  valueToSettlement,
} from "@/shared/lib/payouts/periodResolver";
import { PayoutsHeaderV2 } from "./components/PayoutsHeaderV2";
import { PayoutsCompareGrid } from "./components/PayoutsCompareGrid";
import { PayoutsDetailTable } from "./components/PayoutsDetailTable";
import { PayoutsBarCharts } from "./components/PayoutsBarCharts";
import { PayoutsFindings } from "./components/PayoutsFindings";
import { PayoutsWaterfallChart } from "./components/PayoutsWaterfallChart";
import { PayoutsMarketplaceTable } from "./components/PayoutsMarketplaceTable";
import { PayoutsAnomalies } from "./components/PayoutsAnomalies";

const CALENDAR_PRESETS: { value: CalendarPreset; labelKey: string }[] = [
  { value: "last_14_days", labelKey: "payouts.period.last14" },
  { value: "last_30_days", labelKey: "payouts.period.last30" },
  { value: "last_month", labelKey: "payouts.period.lastMonth" },
  { value: "last_quarter", labelKey: "payouts.period.lastQuarter" },
  { value: "year_to_date", labelKey: "payouts.period.yearToDate" },
];

export default function PayoutsPage() {
  const { t } = useTranslation();
  const periodCtl = usePayoutsPeriodSelector();
  const { periods: settlementPeriods, loading: periodsLoading } = useSettlementPeriods();

  // Wenn ein Settlement-Zeitraum ausgewählt wurde, nach Marktplatz filtern
  const marketplaces = useMemo(() => {
    if (periodCtl.selection.kind === "settlement") {
      return [periodCtl.selection.period.marketplace];
    }
    return [];
  }, [periodCtl.selection]);

  const { data, loading, error, syncing, syncAll } = usePayoutsLoader({
    from: periodCtl.period.from,
    to: periodCtl.period.to,
    marketplaces,
    compare: periodCtl.compare,
    enabled: !!periodCtl.period.from && !!periodCtl.period.to,
  });

  const currentSelectValue =
    periodCtl.selection.kind === "preset"
      ? `preset:${periodCtl.selection.preset}`
      : periodCtl.selection.kind === "settlement"
        ? settlementToValue(periodCtl.selection.period)
        : "preset:last_14_days";

  function handleValueChange(v: string | null) {
    if (!v) return;
    if (v.startsWith("preset:")) {
      periodCtl.setPreset(v.slice(7) as CalendarPreset);
    } else if (v.startsWith("settlement:")) {
      const sp = valueToSettlement(v);
      if (sp) periodCtl.setSettlementPeriod(sp);
    }
  }

  const settlementCount = data?.rows.length ?? 0;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 p-4 sm:p-6">
      {/* Period selector + Sync */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={currentSelectValue} onValueChange={handleValueChange}>
          <SelectTrigger className="h-9 w-72 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{t("payouts.period.presetsLabel")}</SelectLabel>
              {CALENDAR_PRESETS.map((p) => (
                <SelectItem key={p.value} value={`preset:${p.value}`}>
                  {t(p.labelKey)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("payouts.period.settlementsLabel")}</SelectLabel>
              {periodsLoading && (
                <SelectItem value="__loading" disabled>
                  {t("payouts.period.loading")}
                </SelectItem>
              )}
              {!periodsLoading && settlementPeriods.length === 0 && (
                <SelectItem value="__empty" disabled>
                  {t("payouts.period.noSettlements")}
                </SelectItem>
              )}
              {settlementPeriods.map((sp) => (
                <SelectItem key={settlementToValue(sp)} value={settlementToValue(sp)}>
                  {formatSettlementLabel(sp)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void syncAll()}
          disabled={syncing}
          className="h-9 text-xs"
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? t("payouts.syncing") : t("payouts.syncAll")}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm text-black dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          {error}
        </div>
      )}

      {/* Header with period comparison boxes */}
      <PayoutsHeaderV2
        period={periodCtl.period}
        previousPeriod={data?.previousPeriod ?? null}
        totals={data?.totals ?? null}
        previousTotals={data?.previousTotals ?? null}
        deltas={data?.deltas ?? null}
        settlementCount={settlementCount}
        marketplaceFilter={marketplaces}
        loading={loading}
      />

      {/* 8 KPI Comparison Cards */}
      <PayoutsCompareGrid
        totals={data?.totals ?? null}
        previousTotals={data?.previousTotals ?? null}
        deltas={data?.deltas ?? null}
        loading={loading}
      />

      {/* Detail Comparison Table */}
      <PayoutsDetailTable
        totals={data?.totals ?? null}
        previousTotals={data?.previousTotals ?? null}
        deltas={data?.deltas ?? null}
        loading={loading}
      />

      {/* Side-by-Side Bar Charts */}
      <PayoutsBarCharts
        totals={data?.totals ?? null}
        previousTotals={data?.previousTotals ?? null}
        loading={loading}
      />

      {/* Waterfall (current period) */}
      <PayoutsWaterfallChart totals={data?.totals ?? null} loading={loading} />

      {/* Marketplace table */}
      <PayoutsMarketplaceTable rows={data?.rows ?? []} loading={loading} />

      {/* Product performance + Findings + Recommendations */}
      <PayoutsFindings overview={data} loading={loading} />

      {/* Anomalies */}
      <PayoutsAnomalies overview={data} loading={loading} />
    </div>
  );
}
