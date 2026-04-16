"use client";

import type { PayoutTotals, PayoutDeltas } from "@/shared/lib/payouts/payoutTypes";
import { useTranslation } from "@/i18n/I18nProvider";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function DeltaBadge({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return null;
  const color =
    value > 0
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : value < 0
        ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {arrow} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

export function PayoutsHeroCard({
  totals,
  deltas,
  loading,
}: {
  totals: PayoutTotals | null;
  deltas: PayoutDeltas | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#232f3e] to-[#37475a] p-6 text-white shadow-lg">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">
            {t("payouts.hero.payoutAmount")}
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums">
            {loading || !totals ? "—" : formatEur(totals.netPayout)}
          </p>
          {totals && totals.grossSales > 0 && (
            <p className="mt-1 text-sm text-white/60">
              {Math.round(totals.payoutRatio * 100)}% {t("payouts.hero.ofGrossSales")}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {deltas?.netPayout !== null && deltas?.netPayout !== undefined && (
            <DeltaBadge value={deltas.netPayout} />
          )}
          {totals && (
            <p className="text-xs text-white/50">
              {t("payouts.kpi.grossSales")}: {formatEur(totals.grossSales)}
            </p>
          )}
        </div>
      </div>
      {/* Orange accent line */}
      <div className="absolute bottom-0 left-0 h-1 w-full bg-[#ff9900]" />
    </div>
  );
}
