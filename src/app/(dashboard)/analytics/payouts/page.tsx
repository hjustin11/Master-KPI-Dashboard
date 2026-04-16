"use client";

import { useState } from "react";
import { Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/i18n/I18nProvider";
import usePayoutsLoader from "@/shared/hooks/usePayoutsLoader";
import usePayoutsPeriodSelector, { type PayoutPreset } from "@/shared/hooks/usePayoutsPeriodSelector";
import { PayoutsHeroCard } from "./components/PayoutsHeroCard";
import { PayoutsKpiGrid } from "./components/PayoutsKpiGrid";
import { PayoutsWaterfallChart } from "./components/PayoutsWaterfallChart";
import { PayoutsMarketplaceTable } from "./components/PayoutsMarketplaceTable";
import { PayoutsAnomalies } from "./components/PayoutsAnomalies";

const PRESETS: { value: PayoutPreset; labelKey: string }[] = [
  { value: "current", labelKey: "payouts.period.current" },
  { value: "previous", labelKey: "payouts.period.previous" },
  { value: "last30", labelKey: "payouts.period.last30" },
  { value: "lastMonth", labelKey: "payouts.period.lastMonth" },
  { value: "last3Months", labelKey: "payouts.period.last3Months" },
];

export default function PayoutsPage() {
  const { t } = useTranslation();
  const periodCtl = usePayoutsPeriodSelector();
  const [marketplaces] = useState<string[]>([]);

  const { data, loading, error, syncing, refresh: _refresh, syncAll } = usePayoutsLoader({
    from: periodCtl.period.from,
    to: periodCtl.period.to,
    marketplaces,
    compare: periodCtl.compare,
    enabled: !!periodCtl.period.from && !!periodCtl.period.to,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-bold">{t("payouts.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={periodCtl.preset}
            onValueChange={(v) => periodCtl.setPreset(v as PayoutPreset)}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {t(p.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void syncAll()}
            disabled={syncing}
            className="h-8 text-xs"
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("payouts.syncing") : t("payouts.syncAll")}
          </Button>
        </div>
      </div>

      {/* Period display */}
      {periodCtl.period.from && periodCtl.period.to && (
        <p className="text-xs text-muted-foreground">
          {periodCtl.period.from} — {periodCtl.period.to}
          {periodCtl.compare && data?.previousTotals && (
            <span className="ml-2">
              ({t("payouts.compareToggle")})
            </span>
          )}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30">
          {error}
        </div>
      )}

      {/* Hero + KPI */}
      <PayoutsHeroCard totals={data?.totals ?? null} deltas={data?.deltas ?? null} loading={loading} />
      <PayoutsKpiGrid totals={data?.totals ?? null} deltas={data?.deltas ?? null} loading={loading} />

      {/* Waterfall */}
      <PayoutsWaterfallChart totals={data?.totals ?? null} loading={loading} />

      {/* Marketplace table */}
      <PayoutsMarketplaceTable rows={data?.rows ?? []} loading={loading} />

      {/* Anomalies */}
      <PayoutsAnomalies overview={data} loading={loading} />
    </div>
  );
}
