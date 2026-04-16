"use client";

import type { PayoutTotals } from "@/shared/lib/payouts/payoutTypes";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function DeltaPill({ pctChange, suffix }: { pctChange: string; suffix?: string }) {
  const isPos = pctChange.startsWith("+");
  const isZero = ["0.0", "0", "+0.0", "-0.0", "—"].includes(pctChange);
  const cls = isZero
    ? "bg-gray-200 text-black dark:bg-gray-700 dark:text-white"
    : isPos
      ? "bg-black text-white dark:bg-white dark:text-black"
      : "bg-gray-700 text-white dark:bg-gray-300 dark:text-black";
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {pctChange}{suffix ?? " %"}
    </span>
  );
}

type Row = { label: string; prev: string; curr: string; delta: string; deltaSuffix?: string };
type Section = { title: string; rows: Row[] };

function pctStr(curr: number, prev: number): string {
  if (prev === 0) return "—";
  const v = ((curr - prev) / Math.abs(prev)) * 100;
  return (v > 0 ? "+" : "") + v.toFixed(1);
}

function buildSections(t: PayoutTotals, p: PayoutTotals): Section[] {
  const aovC = t.ordersCount > 0 ? t.grossSales / t.ordersCount : 0;
  const aovP = p.ordersCount > 0 ? p.grossSales / p.ordersCount : 0;
  const retRateC = t.grossSales > 0 ? (Math.abs(t.refundsAmount) / t.grossSales) * 100 : 0;
  const retRateP = p.grossSales > 0 ? (Math.abs(p.refundsAmount) / p.grossSales) * 100 : 0;

  return [
    {
      title: "Einnahmen",
      rows: [
        { label: "Artikelpreise (Brutto)", prev: formatEur(p.grossSales), curr: formatEur(t.grossSales), delta: pctStr(t.grossSales, p.grossSales) },
        { label: "Bestellungen", prev: p.ordersCount.toLocaleString("de-DE"), curr: t.ordersCount.toLocaleString("de-DE"), delta: pctStr(t.ordersCount, p.ordersCount) },
        { label: "Ø Bestellwert", prev: formatEur(aovP), curr: formatEur(aovC), delta: pctStr(aovC, aovP) },
      ],
    },
    {
      title: "Retouren",
      rows: [
        { label: "Erstattete Artikel", prev: formatEur(p.refundsAmount), curr: formatEur(t.refundsAmount), delta: pctStr(Math.abs(t.refundsAmount), Math.abs(p.refundsAmount)) },
        { label: "Anzahl Retouren", prev: p.returnsCount.toLocaleString("de-DE"), curr: t.returnsCount.toLocaleString("de-DE"), delta: pctStr(t.returnsCount, p.returnsCount) },
        { label: "Retourenquote (€)", prev: `${retRateP.toFixed(1)} %`, curr: `${retRateC.toFixed(1)} %`, delta: (retRateC - retRateP > 0 ? "+" : "") + (retRateC - retRateP).toFixed(1), deltaSuffix: " pp" },
      ],
    },
    {
      title: "Amazon-Gebühren",
      rows: [
        { label: "Verkaufs- & FBA-Gebühren", prev: formatEur(p.marketplaceFees + p.fulfillmentFees), curr: formatEur(t.marketplaceFees + t.fulfillmentFees), delta: pctStr(Math.abs(t.marketplaceFees + t.fulfillmentFees), Math.abs(p.marketplaceFees + p.fulfillmentFees)) },
        { label: "Rabatte / Coupons", prev: formatEur(p.promotionDiscounts), curr: formatEur(t.promotionDiscounts), delta: pctStr(Math.abs(t.promotionDiscounts), Math.abs(p.promotionDiscounts)) },
        { label: "Service-Gebühren gesamt", prev: formatEur(p.totalFees), curr: formatEur(t.totalFees), delta: pctStr(t.totalFees, p.totalFees) },
      ],
    },
    {
      title: "Werbung",
      rows: [
        { label: "Werbekosten (Sponsored Ads)", prev: formatEur(p.advertisingFees), curr: formatEur(t.advertisingFees), delta: pctStr(Math.abs(t.advertisingFees), Math.abs(p.advertisingFees)) },
        { label: "TACOS (Ads / Umsatz)", prev: `${p.tacos.toFixed(1)} %`, curr: `${t.tacos.toFixed(1)} %`, delta: (t.tacos - p.tacos > 0 ? "+" : "") + (t.tacos - p.tacos).toFixed(1), deltaSuffix: " pp" },
      ],
    },
  ];
}

export function PayoutsDetailTable({
  totals,
  previousTotals,
  loading,
}: {
  totals: PayoutTotals | null;
  previousTotals: PayoutTotals | null;
  deltas: unknown;
  loading: boolean;
}) {
  if (loading || !totals || !previousTotals) {
    return (
      <div className="rounded-lg border bg-white p-6 dark:bg-card">
        <h2 className="text-base font-bold text-black dark:text-white">Detail-Vergleich</h2>
        <p className="mt-3 text-sm text-gray-500">Wähle einen Zeitraum mit Vergleichsdaten.</p>
      </div>
    );
  }

  const sections = buildSections(totals, previousTotals);
  const payoutQuoteC = totals.grossSales > 0 ? (totals.netPayout / totals.grossSales) * 100 : 0;
  const payoutQuoteP = previousTotals.grossSales > 0 ? (previousTotals.netPayout / previousTotals.grossSales) * 100 : 0;

  return (
    <div className="rounded-lg border bg-white shadow-sm dark:bg-card">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <h2 className="text-base font-bold text-black dark:text-white">Detail-Vergleich</h2>
        <p className="mt-0.5 text-xs text-gray-500">Vorperiode vs. aktuelle Periode — alle Positionen</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60">
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Position</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Vorperiode</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Aktuell</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Veränderung</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <SectionBlock key={s.title} section={s} />
            ))}
            <tr className="border-t-2 border-black bg-gray-100 dark:border-white dark:bg-gray-800">
              <td className="px-4 py-3.5 text-sm font-extrabold text-black dark:text-white">Netto-Auszahlung</td>
              <td className="px-4 py-3.5 text-right text-sm font-bold tabular-nums text-black dark:text-white">{formatEur(previousTotals.netPayout)}</td>
              <td className="px-4 py-3.5 text-right text-sm font-bold tabular-nums text-black dark:text-white">{formatEur(totals.netPayout)}</td>
              <td className="px-4 py-3.5 text-right"><DeltaPill pctChange={pctStr(totals.netPayout, previousTotals.netPayout)} /></td>
            </tr>
            <tr className="bg-gray-50 dark:bg-gray-800/40">
              <td className="px-4 py-2 text-xs font-semibold text-black dark:text-white">Auszahlungsquote</td>
              <td className="px-4 py-2 text-right text-xs tabular-nums text-gray-500">{payoutQuoteP.toFixed(1)} %</td>
              <td className="px-4 py-2 text-right text-xs font-bold tabular-nums text-black dark:text-white">{payoutQuoteC.toFixed(1)} %</td>
              <td className="px-4 py-2 text-right"><DeltaPill pctChange={(payoutQuoteC - payoutQuoteP > 0 ? "+" : "") + (payoutQuoteC - payoutQuoteP).toFixed(1)} suffix=" pp" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <>
      <tr className="bg-gray-100 dark:bg-gray-800/80">
        <td colSpan={4} className="px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-black dark:text-white">{section.title}</td>
      </tr>
      {section.rows.map((row) => (
        <tr key={row.label} className="border-b border-gray-100 dark:border-gray-800">
          <td className="px-4 py-2 font-medium text-black dark:text-white">{row.label}</td>
          <td className="px-4 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{row.prev}</td>
          <td className="px-4 py-2 text-right tabular-nums font-semibold text-black dark:text-white">{row.curr}</td>
          <td className="px-4 py-2 text-right"><DeltaPill pctChange={row.delta} suffix={row.deltaSuffix} /></td>
        </tr>
      ))}
    </>
  );
}
