"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { PayoutTotals } from "@/shared/lib/payouts/payoutTypes";
import { useTranslation } from "@/i18n/I18nProvider";

type WaterfallEntry = {
  label: string;
  value: number;
  start: number;
  end: number;
  fill: string;
};

function buildWaterfallData(t: PayoutTotals, tr: (k: string) => string): WaterfallEntry[] {
  const entries: WaterfallEntry[] = [];
  let running = t.grossSales;

  entries.push({
    label: tr("payouts.waterfall.gross"),
    value: t.grossSales,
    start: 0,
    end: t.grossSales,
    fill: "#6b7280",
  });

  const deductions = [
    { key: "payouts.waterfall.refunds", amount: t.refundsAmount },
    { key: "payouts.waterfall.fees", amount: t.marketplaceFees },
    { key: "payouts.waterfall.fulfillment", amount: t.fulfillmentFees },
    { key: "payouts.waterfall.ads", amount: t.advertisingFees },
    { key: "payouts.waterfall.shipping", amount: t.shippingFees },
    { key: "payouts.waterfall.promos", amount: t.promotionDiscounts },
    { key: "payouts.waterfall.other", amount: t.otherFees },
  ];

  for (const d of deductions) {
    if (d.amount <= 0) continue;
    entries.push({
      label: tr(d.key),
      value: -d.amount,
      start: running,
      end: running - d.amount,
      fill: "#dc2626",
    });
    running -= d.amount;
  }

  entries.push({
    label: tr("payouts.waterfall.net"),
    value: t.netPayout,
    start: 0,
    end: t.netPayout,
    fill: "#00a862",
  });

  return entries;
}

function formatEurShort(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n)}€`;
}

export function PayoutsWaterfallChart({
  totals,
  loading,
}: {
  totals: PayoutTotals | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  const data = useMemo(() => {
    if (!totals) return [];
    return buildWaterfallData(totals, t);
  }, [totals, t]);

  if (loading || !totals) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t("payouts.loading")}</p>
      </div>
    );
  }

  if (totals.grossSales <= 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {t("payouts.waterfall.onlyReturns")}
        </p>
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {t("payouts.kpi.netPayout")}: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(totals.netPayout)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("payouts.waterfall.title")}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatEurShort} width={55} />
          <Tooltip
            formatter={(value) =>
              new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value ?? 0))
            }
            labelStyle={{ fontWeight: 600 }}
          />
          {/* Invisible bar for offset (waterfall effect) */}
          <Bar dataKey="start" stackId="waterfall" fill="transparent" isAnimationActive={false} />
          {/* Visible bar for the actual value segment */}
          <Bar dataKey={(entry: WaterfallEntry) => Math.abs(entry.end - entry.start)} stackId="waterfall" isAnimationActive>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
