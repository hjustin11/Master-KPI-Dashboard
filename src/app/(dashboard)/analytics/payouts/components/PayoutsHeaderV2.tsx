"use client";

import type { PayoutTotals, PayoutDeltas } from "@/shared/lib/payouts/payoutTypes";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function fmtDateDe(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

function fmtFullDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function PayoutsHeaderV2({
  period,
  previousPeriod,
  totals,
  previousTotals,
  deltas,
  settlementCount,
  marketplaceFilter,
  loading,
}: {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string } | null;
  totals: PayoutTotals | null;
  previousTotals: PayoutTotals | null;
  deltas: PayoutDeltas | null;
  settlementCount: number;
  marketplaceFilter: string[];
  loading: boolean;
}) {
  const daySpan = Math.round(
    (new Date(period.to).getTime() - new Date(period.from).getTime()) / 86_400_000
  );
  const netDelta = deltas?.netPayout;
  const hasSignificantDrop = netDelta !== null && netDelta !== undefined && netDelta < -15;
  const hasSignificantGrowth = netDelta !== null && netDelta !== undefined && netDelta > 15;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg bg-gradient-to-br from-[#1a2332] to-[#2d3e52] p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#ff9900]">Auszahlungs-Vergleich</p>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Perioden-Analyse: Entwicklung der Auszahlungen</h1>
        <p className="mt-1 text-sm text-white/50">
          {daySpan} Tage · {settlementCount} Abrechnungszeitr{settlementCount === 1 ? "aum" : "äume"}
          {marketplaceFilter.length > 0
            ? ` · ${marketplaceFilter.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(", ")}`
            : " · Alle Marktplätze"}
        </p>

        {previousPeriod && (
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-white/[0.06] p-5 sm:gap-6">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">Vorperiode</p>
              <p className="mt-1.5 text-sm font-semibold text-white/70">{fmtDateDe(previousPeriod.from)} – {fmtFullDate(previousPeriod.to)}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white/70 sm:text-3xl">
                {loading || !previousTotals ? "—" : formatEur(previousTotals.netPayout)}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl text-[#ff9900]">→</span>
              {netDelta !== null && netDelta !== undefined && (
                <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
                  {netDelta > 0 ? "+" : ""}{netDelta.toFixed(1)} %
                </span>
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">Aktuelle Periode</p>
              <p className="mt-1.5 text-sm font-semibold text-white/70">{fmtDateDe(period.from)} – {fmtFullDate(period.to)}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-white sm:text-3xl">
                {loading || !totals ? "—" : formatEur(totals.netPayout)}
              </p>
            </div>
          </div>
        )}
        <div className="mt-5 h-0.5 w-full bg-gradient-to-r from-[#ff9900] via-[#ff9900]/50 to-transparent" />
      </div>

      {/* Alert bei signifikantem Drop */}
      {!loading && totals && previousTotals && deltas && hasSignificantDrop && (
        <div className="rounded-lg border-l-4 border-l-black bg-gray-100 p-5 dark:border-l-white dark:bg-gray-800">
          <h2 className="text-sm font-extrabold text-black dark:text-white">
            Auszahlung um {formatEur(Math.abs(totals.netPayout - previousTotals.netPayout))} gesunken ({deltas.netPayout?.toFixed(1)} %)
          </h2>
          <p className="mt-2 text-sm text-black/80 dark:text-white/80">
            Netto-Auszahlung fiel von <strong>{formatEur(previousTotals.netPayout)}</strong> auf <strong>{formatEur(totals.netPayout)}</strong>.
            {deltas.grossSales !== null && deltas.grossSales < -10 && <> Bruttoumsatz −{Math.abs(deltas.grossSales).toFixed(0)} %.</>}
            {deltas.refundsAmount !== null && deltas.refundsAmount > 20 && <> Retouren +{deltas.refundsAmount.toFixed(0)} %.</>}
            {deltas.tacos > 3 && <> TACOS {previousTotals.tacos.toFixed(1)} % → {totals.tacos.toFixed(1)} %.</>}
          </p>
        </div>
      )}

      {!loading && totals && previousTotals && hasSignificantGrowth && (
        <div className="rounded-lg border-l-4 border-l-black bg-gray-100 p-5 dark:border-l-white dark:bg-gray-800">
          <h2 className="text-sm font-extrabold text-black dark:text-white">
            Auszahlung um {formatEur(totals.netPayout - previousTotals.netPayout)} gestiegen (+{netDelta?.toFixed(1)} %)
          </h2>
          <p className="mt-2 text-sm text-black/80 dark:text-white/80">
            Auszahlung stieg von <strong>{formatEur(previousTotals.netPayout)}</strong> auf <strong>{formatEur(totals.netPayout)}</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
