"use client";

import { useMemo } from "react";
import type { PayoutOverview, PayoutProductEntry } from "@/shared/lib/payouts/payoutTypes";

type Finding = {
  severity: "critical" | "warning" | "info" | "positive";
  title: string;
  body: string;
  action?: string;
};

type Recommendation = {
  urgency: string;
  title: string;
  description: string;
  potential?: string;
};

const SEV_STYLES = {
  critical: "border-l-4 border-l-black bg-gray-100 dark:border-l-white dark:bg-gray-800",
  warning: "border-l-4 border-l-gray-600 bg-gray-50 dark:border-l-gray-400 dark:bg-gray-800/60",
  info: "border-l-4 border-l-gray-400 bg-gray-50 dark:border-l-gray-500 dark:bg-gray-800/40",
  positive: "border-l-4 border-l-black bg-gray-100 dark:border-l-white dark:bg-gray-800",
};

const SEV_ICON = { critical: "🚨", warning: "⚠️", info: "ℹ️", positive: "✅" };

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function generateFindings(overview: PayoutOverview): Finding[] {
  const findings: Finding[] = [];
  const { totals: t, previousTotals: p, deltas: d } = overview;
  if (!p || !d) return findings;

  // 1. Payout drop
  if (d.netPayout !== null && d.netPayout < -20) {
    const absDiff = Math.abs(t.netPayout - p.netPayout);
    const grossDrop = d.grossSales !== null ? Math.abs(d.grossSales).toFixed(0) : null;
    findings.push({
      severity: "critical",
      title: `Auszahlung um ${formatEur(absDiff)} gesunken (${d.netPayout.toFixed(1)} %)`,
      body: `Die Netto-Auszahlung fiel von ${formatEur(p.netPayout)} auf ${formatEur(t.netPayout)}${grossDrop ? `, obwohl der Umsatz "nur" um ${grossDrop} % sank` : ""}. Die Lücke entsteht durch Gebühren, Retouren und/oder Werbekosten.`,
      action: "Sofort die größten Kostentreiber identifizieren — siehe Detail-Tabelle oben.",
    });
  }

  // 2. Returns increase
  const retDelta = d.refundsAmount;
  if (retDelta !== null && retDelta > 30) {
    findings.push({
      severity: "critical",
      title: `Retourenquote verdoppelt: ${(p.returnRate * 100).toFixed(1)} % → ${(t.returnRate * 100).toFixed(1)} %`,
      body: `Erstattungen stiegen von ${formatEur(Math.abs(p.refundsAmount))} auf ${formatEur(Math.abs(t.refundsAmount))} (+${retDelta.toFixed(0)} %). Bei ${t.ordersCount} Bestellungen wurden ${t.returnsCount} retourniert.`,
      action: "Kundenbewertungen und Retourengründe in Seller Central analysieren. Qualitätsprobleme ausschließen.",
    });
  } else if (retDelta !== null && retDelta > 10) {
    findings.push({
      severity: "warning",
      title: `Retouren um +${retDelta.toFixed(0)} % gestiegen`,
      body: `Erstattungen stiegen von ${formatEur(Math.abs(p.refundsAmount))} auf ${formatEur(Math.abs(t.refundsAmount))}.`,
    });
  }

  // 3. TACOS increase
  if (d.tacos > 5) {
    findings.push({
      severity: "warning",
      title: `Werbeeffizienz verschlechtert: TACOS ${p.tacos.toFixed(1)} % → ${t.tacos.toFixed(1)} % (+${d.tacos.toFixed(1)} pp)`,
      body: `Werbekosten blieben bei ${formatEur(Math.abs(t.advertisingFees))}, aber der Umsatz sank — jeder Werbe-Euro generiert weniger Umsatz. Das ist ein "stiller Profitfresser".`,
      action: "Werbebudget an aktuelles Umsatzniveau anpassen. Kampagnen mit hohem ACOS pausieren.",
    });
  } else if (d.tacos > 2) {
    findings.push({
      severity: "info",
      title: `TACOS leicht gestiegen: ${p.tacos.toFixed(1)} % → ${t.tacos.toFixed(1)} % (+${d.tacos.toFixed(1)} pp)`,
      body: `Die Werbekosten-Quote steigt leicht. Beobachten und bei weiterem Anstieg gegensteuern.`,
    });
  }

  // 4. Revenue drop
  if (d.grossSales !== null && d.grossSales < -30) {
    findings.push({
      severity: "critical",
      title: `Umsatz-Einbruch: ${Math.abs(d.grossSales).toFixed(0)} % ggü. Vorperiode`,
      body: `Bruttoumsatz fiel von ${formatEur(p.grossSales)} auf ${formatEur(t.grossSales)}. Fehlender Umsatz: ${formatEur(p.grossSales - t.grossSales)}.`,
      action: "Buy-Box-Status, Preis, Lagerbestand und BSR-Ranking aller Produkte prüfen.",
    });
  } else if (d.grossSales !== null && d.grossSales < -10) {
    findings.push({
      severity: "warning",
      title: `Umsatz um ${Math.abs(d.grossSales).toFixed(0)} % zurückgegangen`,
      body: `Bruttoumsatz fiel von ${formatEur(p.grossSales)} auf ${formatEur(t.grossSales)}.`,
    });
  }

  // 5. AOV drop
  if (d.aov !== null && d.aov < -15) {
    findings.push({
      severity: "warning",
      title: `Ø Bestellwert um ${Math.abs(d.aov).toFixed(0)} % gesunken (${formatEur(p.aov)} → ${formatEur(t.aov)})`,
      body: `Kunden kaufen günstigere Produkte oder weniger pro Bestellung. Das drückt den Umsatz selbst bei stabiler Bestellanzahl.`,
      action: "Prüfen ob hochpreisige Produkte Buy-Box verloren haben oder ausverkauft sind.",
    });
  }

  // 6. Product winners
  const productPerf = getProductPerformance(overview);
  const losers = productPerf.filter((p) => p.deltaGross < -50 && p.prevGross > 500);
  const winners = productPerf.filter((p) => p.deltaGross > 10 && p.currGross > 500);

  if (losers.length > 0) {
    const totalLost = losers.reduce((sum, l) => sum + (l.prevGross - l.currGross), 0);
    findings.push({
      severity: "critical",
      title: `${losers.length} Produkt(e) mit starkem Umsatzrückgang (−${formatEur(totalLost)})`,
      body: losers
        .slice(0, 4)
        .map((l) => `${l.title || l.sku}: ${l.deltaGross.toFixed(0)} % (${formatEur(l.prevGross)} → ${formatEur(l.currGross)})`)
        .join("\n"),
      action: "Listing-Check: Buy-Box, Preis, Bilder, Lagerbestand, Wettbewerber.",
    });
  }

  if (winners.length > 0) {
    findings.push({
      severity: "positive",
      title: `${winners.length} Produkt(e) wachsen gegen den Trend`,
      body: winners
        .slice(0, 3)
        .map((w) => `${w.title || w.sku}: +${w.deltaGross.toFixed(0)} % (${formatEur(w.currGross)})`)
        .join("\n"),
      action: "Werbebudget auf diese Hero-Produkte umschichten — sie funktionieren.",
    });
  }

  // 7. Promo reduction
  if (Math.abs(p.promotionDiscounts) > 100 && Math.abs(t.promotionDiscounts) < Math.abs(p.promotionDiscounts) * 0.5) {
    const drop = ((Math.abs(p.promotionDiscounts) - Math.abs(t.promotionDiscounts)) / Math.abs(p.promotionDiscounts) * 100).toFixed(0);
    findings.push({
      severity: "info",
      title: `Rabatte um ${drop} % reduziert (${formatEur(Math.abs(p.promotionDiscounts))} → ${formatEur(Math.abs(t.promotionDiscounts))})`,
      body: `Weniger Promo-Aktionen könnten zum Umsatzrückgang beitragen. Prüfen ob in der Vorperiode ein Deal/Event lief.`,
    });
  }

  return findings;
}

function generateRecommendations(overview: PayoutOverview): Recommendation[] {
  const recs: Recommendation[] = [];
  const { totals: t, previousTotals: p, deltas: d } = overview;
  if (!p || !d) return recs;

  if (d.grossSales !== null && d.grossSales < -20) {
    recs.push({
      urgency: "Sofort (diese Woche)",
      title: "Produkt-Listings prüfen",
      description: "Buy-Box-Status, Preis, Verfügbarkeit und Wettbewerber-Check für alle Produkte mit Umsatzrückgang.",
      potential: `+${formatEur(Math.abs(p.grossSales - t.grossSales) * 0.3)}–${formatEur(Math.abs(p.grossSales - t.grossSales) * 0.6)}`,
    });
  }

  if (d.tacos > 3) {
    recs.push({
      urgency: "Nächste 7 Tage",
      title: "Werbebudget umschichten",
      description: `TACOS von ${t.tacos.toFixed(1)} % auf unter 15 % senken. Budget von Verlust-SKUs auf profitable Produkte umlenken.`,
      potential: `+${formatEur(Math.abs(t.advertisingFees) * 0.15)}–${formatEur(Math.abs(t.advertisingFees) * 0.3)}/Zyklus`,
    });
  }

  if (d.refundsAmount !== null && d.refundsAmount > 20) {
    recs.push({
      urgency: "Nächste 2 Wochen",
      title: "Retouren-Ursachen analysieren",
      description: "Retourengründe in Seller Central auswerten, Listings/Produktqualität überarbeiten.",
      potential: `+${formatEur(Math.abs(t.refundsAmount) * 0.2)}`,
    });
  }

  recs.push({
    urgency: "Laufend",
    title: "Wöchentlicher Campaign Report",
    description: "ACOS pro Kampagne analysieren, Negative Keywords pflegen, Budget-Caps prüfen.",
  });

  return recs;
}

type ProductPerf = {
  sku: string;
  title: string;
  prevGross: number;
  currGross: number;
  prevUnits: number;
  currUnits: number;
  prevReturns: number;
  currReturns: number;
  deltaGross: number;
};

function getProductPerformance(overview: PayoutOverview): ProductPerf[] {
  const currMap = new Map<string, PayoutProductEntry>();
  const prevMap = new Map<string, PayoutProductEntry>();

  for (const row of overview.rows) {
    for (const p of row.productBreakdown ?? []) {
      const existing = currMap.get(p.sku);
      if (existing) {
        existing.gross += p.gross;
        existing.units += p.units;
        existing.returns += p.returns;
      } else {
        currMap.set(p.sku, { ...p });
      }
    }
  }

  for (const row of overview.previousRows) {
    for (const p of row.productBreakdown ?? []) {
      const existing = prevMap.get(p.sku);
      if (existing) {
        existing.gross += p.gross;
        existing.units += p.units;
        existing.returns += p.returns;
      } else {
        prevMap.set(p.sku, { ...p });
      }
    }
  }

  const allSkus = new Set([...currMap.keys(), ...prevMap.keys()]);
  const result: ProductPerf[] = [];

  for (const sku of allSkus) {
    const c = currMap.get(sku);
    const prev = prevMap.get(sku);
    const currGross = c?.gross ?? 0;
    const prevGross = prev?.gross ?? 0;
    const deltaGross = prevGross > 0 ? ((currGross - prevGross) / prevGross) * 100 : currGross > 0 ? 100 : 0;

    result.push({
      sku,
      title: c?.title ?? prev?.title ?? sku,
      prevGross,
      currGross,
      prevUnits: prev?.units ?? 0,
      currUnits: c?.units ?? 0,
      prevReturns: prev?.returns ?? 0,
      currReturns: c?.returns ?? 0,
      deltaGross,
    });
  }

  result.sort((a, b) => a.deltaGross - b.deltaGross);
  return result;
}

export function PayoutsFindings({
  overview,
  loading,
}: {
  overview: PayoutOverview | null;
  loading: boolean;
}) {
  const findings = useMemo(() => {
    if (!overview) return [];
    return generateFindings(overview);
  }, [overview]);

  const recommendations = useMemo(() => {
    if (!overview) return [];
    return generateRecommendations(overview);
  }, [overview]);

  const products = useMemo(() => {
    if (!overview) return [];
    return getProductPerformance(overview);
  }, [overview]);

  if (loading || !overview) return null;

  const significantProducts = products.filter(
    (p) => p.prevGross > 200 || p.currGross > 200
  );

  const hasComparison = !!overview.previousTotals;

  return (
    <>
      {/* Product performance table */}
      {significantProducts.length > 0 && hasComparison && (
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
          <h2 className="mb-1 text-base font-bold text-black dark:text-white">Produkt-Performance im Vergleich</h2>
          <p className="mb-4 text-xs text-gray-500">Dunkel hinterlegt = starker Rückgang, hell = Wachstum</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="border-b-2 border-gray-200 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Produkt</th>
                  <th className="border-b-2 border-gray-200 px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Einh. Vor</th>
                  <th className="border-b-2 border-gray-200 px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Einh. Akt.</th>
                  <th className="border-b-2 border-gray-200 px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Umsatz Vor</th>
                  <th className="border-b-2 border-gray-200 px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Umsatz Akt.</th>
                  <th className="border-b-2 border-gray-200 px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Δ</th>
                </tr>
              </thead>
              <tbody>
                {significantProducts.slice(0, 15).map((p) => {
                  const isLoser = p.deltaGross < -50;
                  const isWinner = p.deltaGross > 10;
                  const bgCls = isLoser
                    ? "bg-gray-200 dark:bg-gray-700"
                    : isWinner
                      ? "bg-gray-50 dark:bg-gray-800/30"
                      : "";
                  return (
                    <tr key={p.sku} className={`border-b border-gray-100 dark:border-gray-800 ${bgCls}`}>
                      <td className="max-w-[280px] truncate px-3 py-2.5 font-medium text-black dark:text-white" title={p.title}>
                        {p.title || p.sku}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{p.prevUnits}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-black dark:text-white">{p.currUnits}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                        {p.prevGross.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-black dark:text-white">
                        {p.currGross.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-black dark:text-white">
                        {p.deltaGross > 0 ? "+" : ""}{p.deltaGross.toFixed(1)} %
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-card">
          <h2 className="mb-1 text-base font-bold text-black dark:text-white">
            Analyse & Erkenntnisse
          </h2>
          <p className="mb-5 text-xs text-gray-500">
            Automatisch erkannte Auffälligkeiten und deren Ursachen
          </p>
          <div className="space-y-3">
            {findings.map((f, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-4 ${SEV_STYLES[f.severity]}`}
              >
                <p className="flex items-center gap-2 text-sm font-extrabold text-black dark:text-white">
                  <span>{SEV_ICON[f.severity]}</span>
                  {f.title}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-black/80 dark:text-white/80">
                  {f.body}
                </p>
                {f.action && (
                  <p className="mt-2 text-[12px] font-bold text-black dark:text-white">
                    → {f.action}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && hasComparison && (
        <div className="rounded-xl bg-gradient-to-br from-[#1a2332] to-[#2d3e52] p-6 text-white shadow-xl">
          <h2 className="mb-1 text-lg font-bold">Handlungsempfehlungen</h2>
          <p className="mb-5 text-xs text-gray-400">
            Priorisiert nach erwartetem Effekt auf die Auszahlung
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="rounded-lg bg-white/[0.07] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#ff9900]">
                  {rec.urgency}
                </p>
                <p className="mt-1.5 text-sm font-bold text-white">{rec.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-300">
                  {rec.description}
                </p>
                {rec.potential && (
                  <p className="mt-2 text-[12px] font-semibold text-white/80">
                    Potenzial: {rec.potential}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
