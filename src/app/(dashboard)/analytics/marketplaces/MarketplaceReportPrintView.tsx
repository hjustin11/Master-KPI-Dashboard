"use client";

import { format } from "date-fns";

export type MarketplaceReportRow = {
  id: string;
  label: string;
  currency: string;
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
  previousOrders: number;
  currentUnits: number;
  previousUnits: number;
  currentFbaUnits: number;
  previousFbaUnits: number;
  currentReturns: number;
  previousReturns: number;
  currentReturned: number;
  previousReturned: number;
  currentCancelled: number;
  previousCancelled: number;
  currentFees: number;
  previousFees: number;
  currentAds: number;
  previousAds: number;
  currentNet: number;
  previousNet: number;
  feeSource: "api" | "configured_percentage" | "default_percentage";
  returnsSource: "api" | "status_based" | "none";
  costCoverage: "api" | "estimated" | "mixed";
};

function aggregateRows(rows: MarketplaceReportRow[]): MarketplaceReportRow | null {
  if (rows.length === 0) return null;
  const currency = rows[0]?.currency || "EUR";
  const sameCurrency = rows.filter((r) => r.currency === currency);
  if (sameCurrency.length === 0) return null;
  return {
    id: "total",
    label: "Gesamtbetrachtung",
    currency,
    currentRevenue: sameCurrency.reduce((s, r) => s + r.currentRevenue, 0),
    previousRevenue: sameCurrency.reduce((s, r) => s + r.previousRevenue, 0),
    currentOrders: sameCurrency.reduce((s, r) => s + r.currentOrders, 0),
    previousOrders: sameCurrency.reduce((s, r) => s + r.previousOrders, 0),
    currentUnits: sameCurrency.reduce((s, r) => s + r.currentUnits, 0),
    previousUnits: sameCurrency.reduce((s, r) => s + r.previousUnits, 0),
    currentFbaUnits: sameCurrency.reduce((s, r) => s + r.currentFbaUnits, 0),
    previousFbaUnits: sameCurrency.reduce((s, r) => s + r.previousFbaUnits, 0),
    currentReturns: sameCurrency.reduce((s, r) => s + r.currentReturns, 0),
    previousReturns: sameCurrency.reduce((s, r) => s + r.previousReturns, 0),
    currentReturned: sameCurrency.reduce((s, r) => s + r.currentReturned, 0),
    previousReturned: sameCurrency.reduce((s, r) => s + r.previousReturned, 0),
    currentCancelled: sameCurrency.reduce((s, r) => s + r.currentCancelled, 0),
    previousCancelled: sameCurrency.reduce((s, r) => s + r.previousCancelled, 0),
    currentFees: sameCurrency.reduce((s, r) => s + r.currentFees, 0),
    previousFees: sameCurrency.reduce((s, r) => s + r.previousFees, 0),
    currentAds: sameCurrency.reduce((s, r) => s + r.currentAds, 0),
    previousAds: sameCurrency.reduce((s, r) => s + r.previousAds, 0),
    currentNet: sameCurrency.reduce((s, r) => s + r.currentNet, 0),
    previousNet: sameCurrency.reduce((s, r) => s + r.previousNet, 0),
    feeSource: "configured_percentage",
    returnsSource: "status_based",
    costCoverage: "mixed",
  };
}

function formatCurrency(amount: number, currency: string, intlTag: string) {
  return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: currency || "EUR",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatInt(value: number, intlTag: string) {
  return new Intl.NumberFormat(intlTag).format(Number.isFinite(value) ? value : 0);
}

function yoyPct(current: number, previous: number): string {
  if (!Number.isFinite(previous) || previous <= 0) return "—";
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)} %`;
}

function valueToneClass(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "text-emerald-700" : "text-rose-700";
}

export function MarketplaceReportPrintView({
  rows,
  periodFrom,
  periodTo,
  mode,
  generatedAt,
  intlTag,
}: {
  rows: MarketplaceReportRow[];
  periodFrom: string;
  periodTo: string;
  mode: "all" | "single" | "selected";
  generatedAt: Date;
  intlTag: string;
}) {
  const totalRow = aggregateRows(rows);
  return (
    <div className="space-y-4 print:space-y-3">
      <div className="border-b border-border/60 pb-2">
        <h2 className="text-base font-semibold">Marktplatzbericht (YoY)</h2>
        <p className="text-xs text-muted-foreground">
          Zeitraum: {periodFrom} bis {periodTo} · Vergleich zum Vorjahreszeitraum · Modus:{" "}
          {mode === "all" ? "Alle Marktplätze" : mode === "single" ? "Einzel-Marktplatz" : "Ausgewählte Marktplätze"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Generiert am {format(generatedAt, "dd.MM.yyyy HH:mm")}
        </p>
      </div>

      {rows.map((row) => (
        <section key={row.id} className="rounded-lg border border-border/50 p-3 print:break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold">{row.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-xs [font-variant-numeric:tabular-nums]">
              <colgroup>
                <col className="w-[42%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="py-1 pr-2">Kennzahl</th>
                  <th className="py-1 pr-2 text-right">Aktuell</th>
                  <th className="py-1 pr-2 text-right">Vorjahr</th>
                  <th className="py-1 text-right">YoY</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1 pr-2">Umsatz</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentRevenue, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousRevenue, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentRevenue - row.previousRevenue)}`}>
                    {yoyPct(row.currentRevenue, row.previousRevenue)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">Bestellungen</td>
                  <td className="py-1 pr-2 text-right">{formatInt(row.currentOrders, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatInt(row.previousOrders, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentOrders - row.previousOrders)}`}>
                    {yoyPct(row.currentOrders, row.previousOrders)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">Einheiten</td>
                  <td className="py-1 pr-2 text-right">{formatInt(row.currentUnits, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatInt(row.previousUnits, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentUnits - row.previousUnits)}`}>
                    {yoyPct(row.currentUnits, row.previousUnits)}
                  </td>
                </tr>
                {row.id === "amazon" ? (
                  <tr>
                    <td className="py-1 pr-2">FBA Artikel (Menge)</td>
                    <td className="py-1 pr-2 text-right">{formatInt(row.currentFbaUnits, intlTag)}</td>
                    <td className="py-1 pr-2 text-right">{formatInt(row.previousFbaUnits, intlTag)}</td>
                    <td className={`py-1 text-right ${valueToneClass(row.currentFbaUnits - row.previousFbaUnits)}`}>
                      {yoyPct(row.currentFbaUnits, row.previousFbaUnits)}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td className="py-1 pr-2">Retouren (returned)</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentReturned, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousReturned, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentReturned - row.previousReturned)}`}>
                    {yoyPct(row.currentReturned, row.previousReturned)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">Erstattungen/Storno (cancelled)</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentCancelled, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousCancelled, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentCancelled - row.previousCancelled)}`}>
                    {yoyPct(row.currentCancelled, row.previousCancelled)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">Retouren</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentReturns, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousReturns, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentReturns - row.previousReturns)}`}>
                    {yoyPct(row.currentReturns, row.previousReturns)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">Marktplatzgebühren</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentFees, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousFees, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentFees - row.previousFees)}`}>
                    {yoyPct(row.currentFees, row.previousFees)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2">Anzeigenkosten</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentAds, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousAds, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentAds - row.previousAds)}`}>
                    {yoyPct(row.currentAds, row.previousAds)}
                  </td>
                </tr>
                <tr className="border-t border-border/50 font-semibold">
                  <td className="py-1 pr-2">Netto</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.currentNet, row.currency, intlTag)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(row.previousNet, row.currency, intlTag)}</td>
                  <td className={`py-1 text-right ${valueToneClass(row.currentNet - row.previousNet)}`}>
                    {yoyPct(row.currentNet, row.previousNet)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Datendeckung: {row.costCoverage} · Gebührenquelle: {row.feeSource} · Retourenquelle: {row.returnsSource}
          </p>
        </section>
      ))}

      {totalRow ? (
        <section className="rounded-lg border border-border/50 bg-muted/10 p-3 print:break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold">{totalRow.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-xs [font-variant-numeric:tabular-nums]">
              <colgroup>
                <col className="w-[42%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="py-1 pr-2">Kennzahl</th>
                  <th className="py-1 pr-2 text-right">Aktuell</th>
                  <th className="py-1 pr-2 text-right">Vorjahr</th>
                  <th className="py-1 text-right">YoY</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="py-1 pr-2">Umsatz</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.currentRevenue, totalRow.currency, intlTag)}</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.previousRevenue, totalRow.currency, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentRevenue-totalRow.previousRevenue)}`}>{yoyPct(totalRow.currentRevenue,totalRow.previousRevenue)}</td></tr>
                <tr><td className="py-1 pr-2">Bestellungen</td><td className="py-1 pr-2 text-right">{formatInt(totalRow.currentOrders, intlTag)}</td><td className="py-1 pr-2 text-right">{formatInt(totalRow.previousOrders, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentOrders-totalRow.previousOrders)}`}>{yoyPct(totalRow.currentOrders,totalRow.previousOrders)}</td></tr>
                <tr><td className="py-1 pr-2">Einheiten</td><td className="py-1 pr-2 text-right">{formatInt(totalRow.currentUnits, intlTag)}</td><td className="py-1 pr-2 text-right">{formatInt(totalRow.previousUnits, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentUnits-totalRow.previousUnits)}`}>{yoyPct(totalRow.currentUnits,totalRow.previousUnits)}</td></tr>
                <tr><td className="py-1 pr-2">Retouren</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.currentReturns, totalRow.currency, intlTag)}</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.previousReturns, totalRow.currency, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentReturns-totalRow.previousReturns)}`}>{yoyPct(totalRow.currentReturns,totalRow.previousReturns)}</td></tr>
                <tr><td className="py-1 pr-2">Marktplatzgebühren</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.currentFees, totalRow.currency, intlTag)}</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.previousFees, totalRow.currency, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentFees-totalRow.previousFees)}`}>{yoyPct(totalRow.currentFees,totalRow.previousFees)}</td></tr>
                <tr><td className="py-1 pr-2">Anzeigenkosten</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.currentAds, totalRow.currency, intlTag)}</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.previousAds, totalRow.currency, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentAds-totalRow.previousAds)}`}>{yoyPct(totalRow.currentAds,totalRow.previousAds)}</td></tr>
                <tr className="border-t border-border/50 font-semibold"><td className="py-1 pr-2">Netto</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.currentNet, totalRow.currency, intlTag)}</td><td className="py-1 pr-2 text-right">{formatCurrency(totalRow.previousNet, totalRow.currency, intlTag)}</td><td className={`py-1 text-right ${valueToneClass(totalRow.currentNet-totalRow.previousNet)}`}>{yoyPct(totalRow.currentNet,totalRow.previousNet)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <style jsx>{`
        @media print {
          .print\\:break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

export function buildMarketplaceReportHtml(args: {
  periodFrom: string;
  periodTo: string;
  mode: "all" | "single" | "selected";
  rows: MarketplaceReportRow[];
  intlTag: string;
}) {
  const generated = format(new Date(), "dd.MM.yyyy HH:mm");
  const sections = args.rows
    .map((row) => {
      const yoy = (current: number, previous: number) => {
        if (!Number.isFinite(previous) || previous <= 0) return "—";
        const pct = ((current - previous) / previous) * 100;
        const sign = pct > 0 ? "+" : "";
        return `${sign}${pct.toFixed(1)} %`;
      };
      const yoyClass = (current: number, previous: number) => {
        const delta = current - previous;
        if (!Number.isFinite(delta) || delta === 0) return "";
        return delta > 0 ? "pos" : "neg";
      };
      const money = (value: number) =>
        new Intl.NumberFormat(args.intlTag, { style: "currency", currency: row.currency || "EUR" }).format(
          Number.isFinite(value) ? value : 0
        );
      const num = (value: number) =>
        new Intl.NumberFormat(args.intlTag).format(Number.isFinite(value) ? value : 0);

      return `
        <section class="section">
          <h3>${row.label}</h3>
          <table class="report-table">
            <colgroup>
              <col style="width:42%" />
              <col style="width:19%" />
              <col style="width:19%" />
              <col style="width:20%" />
            </colgroup>
            <thead><tr><th>Kennzahl</th><th class="r">Aktuell</th><th class="r">Vorjahr</th><th class="r">YoY</th></tr></thead>
            <tbody>
              <tr><td>Umsatz</td><td class="r">${money(row.currentRevenue)}</td><td class="r">${money(row.previousRevenue)}</td><td class="r ${yoyClass(row.currentRevenue, row.previousRevenue)}">${yoy(row.currentRevenue, row.previousRevenue)}</td></tr>
              <tr><td>Bestellungen</td><td class="r">${num(row.currentOrders)}</td><td class="r">${num(row.previousOrders)}</td><td class="r ${yoyClass(row.currentOrders, row.previousOrders)}">${yoy(row.currentOrders, row.previousOrders)}</td></tr>
              <tr><td>Einheiten</td><td class="r">${num(row.currentUnits)}</td><td class="r">${num(row.previousUnits)}</td><td class="r ${yoyClass(row.currentUnits, row.previousUnits)}">${yoy(row.currentUnits, row.previousUnits)}</td></tr>
              ${row.id === "amazon" ? `<tr><td>FBA Artikel (Menge)</td><td class="r">${num(row.currentFbaUnits)}</td><td class="r">${num(row.previousFbaUnits)}</td><td class="r ${yoyClass(row.currentFbaUnits, row.previousFbaUnits)}">${yoy(row.currentFbaUnits, row.previousFbaUnits)}</td></tr>` : ""}
              <tr><td>Retouren</td><td class="r">${money(row.currentReturns)}</td><td class="r">${money(row.previousReturns)}</td><td class="r ${yoyClass(row.currentReturns, row.previousReturns)}">${yoy(row.currentReturns, row.previousReturns)}</td></tr>
              <tr><td>Retouren (returned)</td><td class="r">${money(row.currentReturned)}</td><td class="r">${money(row.previousReturned)}</td><td class="r ${yoyClass(row.currentReturned, row.previousReturned)}">${yoy(row.currentReturned, row.previousReturned)}</td></tr>
              <tr><td>Erstattungen/Storno (cancelled)</td><td class="r">${money(row.currentCancelled)}</td><td class="r">${money(row.previousCancelled)}</td><td class="r ${yoyClass(row.currentCancelled, row.previousCancelled)}">${yoy(row.currentCancelled, row.previousCancelled)}</td></tr>
              <tr><td>Marktplatzgebühren</td><td class="r">${money(row.currentFees)}</td><td class="r">${money(row.previousFees)}</td><td class="r ${yoyClass(row.currentFees, row.previousFees)}">${yoy(row.currentFees, row.previousFees)}</td></tr>
              <tr><td>Anzeigenkosten</td><td class="r">${money(row.currentAds)}</td><td class="r">${money(row.previousAds)}</td><td class="r ${yoyClass(row.currentAds, row.previousAds)}">${yoy(row.currentAds, row.previousAds)}</td></tr>
              <tr class="total"><td>Netto</td><td class="r">${money(row.currentNet)}</td><td class="r">${money(row.previousNet)}</td><td class="r ${yoyClass(row.currentNet, row.previousNet)}">${yoy(row.currentNet, row.previousNet)}</td></tr>
            </tbody>
          </table>
          <p class="note">Datendeckung: ${row.costCoverage} · Gebührenquelle: ${row.feeSource} · Retourenquelle: ${row.returnsSource}</p>
        </section>
      `;
    })
    .join("");

  const totalRow = aggregateRows(args.rows);
  const totalSection = totalRow
    ? `
      <section class="section">
        <h3>Gesamtbetrachtung</h3>
        <table class="report-table">
          <colgroup><col style="width:42%" /><col style="width:19%" /><col style="width:19%" /><col style="width:20%" /></colgroup>
          <thead><tr><th>Kennzahl</th><th class="r">Aktuell</th><th class="r">Vorjahr</th><th class="r">YoY</th></tr></thead>
          <tbody>
            <tr><td>Umsatz</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.currentRevenue)}</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.previousRevenue)}</td><td class="r">${yoyPct(totalRow.currentRevenue, totalRow.previousRevenue)}</td></tr>
            <tr><td>Bestellungen</td><td class="r">${new Intl.NumberFormat(args.intlTag).format(totalRow.currentOrders)}</td><td class="r">${new Intl.NumberFormat(args.intlTag).format(totalRow.previousOrders)}</td><td class="r">${yoyPct(totalRow.currentOrders, totalRow.previousOrders)}</td></tr>
            <tr><td>Einheiten</td><td class="r">${new Intl.NumberFormat(args.intlTag).format(totalRow.currentUnits)}</td><td class="r">${new Intl.NumberFormat(args.intlTag).format(totalRow.previousUnits)}</td><td class="r">${yoyPct(totalRow.currentUnits, totalRow.previousUnits)}</td></tr>
            <tr><td>Retouren</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.currentReturns)}</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.previousReturns)}</td><td class="r">${yoyPct(totalRow.currentReturns, totalRow.previousReturns)}</td></tr>
            <tr><td>Marktplatzgebühren</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.currentFees)}</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.previousFees)}</td><td class="r">${yoyPct(totalRow.currentFees, totalRow.previousFees)}</td></tr>
            <tr><td>Anzeigenkosten</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.currentAds)}</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.previousAds)}</td><td class="r">${yoyPct(totalRow.currentAds, totalRow.previousAds)}</td></tr>
            <tr class="total"><td>Netto</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.currentNet)}</td><td class="r">${new Intl.NumberFormat(args.intlTag, { style: "currency", currency: totalRow.currency || "EUR" }).format(totalRow.previousNet)}</td><td class="r">${yoyPct(totalRow.currentNet, totalRow.previousNet)}</td></tr>
          </tbody>
        </table>
      </section>
    `
    : "";

  return `
    <!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Marktplatzbericht</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; margin: 22px; color: #111827; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          h3 { font-size: 14px; margin: 0 0 8px; }
          .meta { color: #4b5563; font-size: 12px; margin-bottom: 16px; }
          .section { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px; margin-bottom: 12px; page-break-inside: avoid; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; }
          th { font-weight: 600; }
          td.r, th.r { text-align: right; }
          td, th { vertical-align: middle; font-variant-numeric: tabular-nums; }
          .pos { color: #047857; font-weight: 600; }
          .neg { color: #be123c; font-weight: 600; }
          tr.total td { border-top: 1px solid #d1d5db; font-weight: 700; }
          .note { margin: 8px 0 0; color: #6b7280; font-size: 11px; }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Marktplatzbericht (YoY)</h1>
        <p class="meta">Zeitraum: ${args.periodFrom} bis ${args.periodTo} · Vergleich zum Vorjahreszeitraum · Modus: ${
    args.mode === "all" ? "Alle Marktplätze" : args.mode === "single" ? "Einzel-Marktplatz" : "Ausgewählte Marktplätze"
  } · Generiert am ${generated}</p>
        ${sections}
        ${totalSection}
      </body>
    </html>
  `;
}
