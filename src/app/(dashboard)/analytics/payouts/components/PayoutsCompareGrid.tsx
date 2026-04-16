"use client";

import type { PayoutTotals, PayoutDeltas } from "@/shared/lib/payouts/payoutTypes";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

type KpiDef = {
  label: string;
  explanation: string;
  currentVal: (t: PayoutTotals) => string;
  prevVal: (t: PayoutTotals) => string;
  delta: (d: PayoutDeltas) => { value: number | null; suffix: string };
  polarity: "high_good" | "high_bad" | "neutral";
};

const KPIS: KpiDef[] = [
  { label: "Auszahlung", explanation: "Netto nach allen Abzügen", currentVal: (t) => formatEur(t.netPayout), prevVal: (t) => formatEur(t.netPayout), delta: (d) => ({ value: d.netPayout, suffix: " %" }), polarity: "high_good" },
  { label: "Bruttoumsatz", explanation: "Gesamtumsatz vor Abzügen", currentVal: (t) => formatEur(t.grossSales), prevVal: (t) => formatEur(t.grossSales), delta: (d) => ({ value: d.grossSales, suffix: " %" }), polarity: "high_good" },
  { label: "Bestellungen", explanation: "Eingegangene Bestellungen", currentVal: (t) => t.ordersCount.toLocaleString("de-DE"), prevVal: (t) => t.ordersCount.toLocaleString("de-DE"), delta: (d) => ({ value: d.ordersCount, suffix: " %" }), polarity: "high_good" },
  { label: "Ø Bestellwert", explanation: "Warenwert pro Bestellung", currentVal: (t) => formatEur(t.aov), prevVal: (t) => formatEur(t.aov), delta: (d) => ({ value: d.aov, suffix: " %" }), polarity: "high_good" },
  { label: "Retouren", explanation: "Erstattungen an Kunden", currentVal: (t) => formatEur(Math.abs(t.refundsAmount)), prevVal: (t) => formatEur(Math.abs(t.refundsAmount)), delta: (d) => ({ value: d.refundsAmount, suffix: " %" }), polarity: "high_bad" },
  { label: "Werbekosten", explanation: "Sponsored Ads gesamt", currentVal: (t) => formatEur(Math.abs(t.advertisingFees)), prevVal: (t) => formatEur(Math.abs(t.advertisingFees)), delta: (d) => ({ value: d.advertisingFees, suffix: " %" }), polarity: "neutral" },
  { label: "TACOS", explanation: "Werbekosten / Umsatz", currentVal: (t) => `${t.tacos.toFixed(1)} %`, prevVal: (t) => `${t.tacos.toFixed(1)} %`, delta: (d) => ({ value: d.tacos, suffix: " pp" }), polarity: "high_bad" },
  { label: "Auszahlungsquote", explanation: "Anteil der ausgezahlt wird", currentVal: (t) => `${(t.payoutRatio * 100).toFixed(1)} %`, prevVal: (t) => `${(t.payoutRatio * 100).toFixed(1)} %`, delta: (d) => ({ value: d.payoutRatio * 100, suffix: " pp" }), polarity: "high_good" },
];

function getDirection(value: number | null, polarity: KpiDef["polarity"]): "up" | "down" | "stable" {
  if (value === null || Math.abs(value) < 0.5) return "stable";
  if (polarity === "high_bad") return value > 0 ? "down" : "up";
  if (polarity === "high_good") return value > 0 ? "up" : "down";
  return Math.abs(value) < 3 ? "stable" : value > 0 ? "up" : "down";
}

const BORDER = {
  up: "border-l-4 border-l-black dark:border-l-white",
  down: "border-l-4 border-l-gray-400 dark:border-l-gray-500",
  stable: "border-l-4 border-l-gray-200 dark:border-l-gray-700",
};

const DELTA_BG = {
  up: "bg-black text-white dark:bg-white dark:text-black",
  down: "bg-gray-800 text-white dark:bg-gray-200 dark:text-black",
  stable: "bg-gray-300 text-black dark:bg-gray-600 dark:text-white",
};

const ARROW = { up: "▲", down: "▼", stable: "–" };

export function PayoutsCompareGrid({
  totals,
  previousTotals,
  deltas,
  loading,
}: {
  totals: PayoutTotals | null;
  previousTotals: PayoutTotals | null;
  deltas: PayoutDeltas | null;
  loading: boolean;
}) {
  if (loading || !totals) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-l-4 border-l-gray-200 bg-white p-4 dark:border-l-gray-700 dark:bg-card">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{kpi.label}</p>
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KPIS.map((kpi) => {
        const { value, suffix } = deltas ? kpi.delta(deltas) : { value: null, suffix: " %" };
        const dir = getDirection(value, kpi.polarity);
        return (
          <div key={kpi.label} className={`rounded-lg border bg-white p-4 shadow-sm ${BORDER[dir]} dark:bg-card`}>
            <div className="flex items-start justify-between gap-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-black dark:text-white">{kpi.label}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{kpi.explanation}</p>
              </div>
              {value !== null && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${DELTA_BG[dir]}`}>
                  {ARROW[dir]} {value > 0 ? "+" : ""}{value.toFixed(1)}{suffix}
                </span>
              )}
            </div>
            <p className="mt-2 text-xl font-extrabold tabular-nums text-black dark:text-white">
              {kpi.currentVal(totals)}
            </p>
            {previousTotals && (
              <p className="mt-0.5 text-xs tabular-nums text-gray-400 line-through">
                Vorperiode: {kpi.prevVal(previousTotals)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
