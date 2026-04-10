"use client";

import type { MarketplaceReportRow } from "./MarketplaceReportPrintView";

function esc(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function fmtPct(current: number, previous: number, intlTag: string): string {
  if (!Number.isFinite(previous) || previous === 0) return "—";
  const p = ((current - previous) / Math.abs(previous)) * 100;
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toLocaleString(intlTag, { maximumFractionDigits: 1 })} %`;
}

export function buildDevelopmentReportHtml(args: {
  rows: MarketplaceReportRow[];
  periodFrom: string;
  periodTo: string;
  previousFrom: string;
  previousTo: string;
  generatedAt: Date;
  intlTag: string;
}): string {
  const nfInt = new Intl.NumberFormat(args.intlTag);
  const fCur = (n: number, c: string) =>
    new Intl.NumberFormat(args.intlTag, { style: "currency", currency: c || "EUR" }).format(n);

  const rows = args.rows
    .map(
      (r) => `
        <tr>
          <td>${esc(r.label)}</td>
          <td class="num">${fCur(r.currentRevenue, r.currency)}</td>
          <td class="num">${fCur(r.previousRevenue, r.currency)}</td>
          <td class="num">${fmtPct(r.currentRevenue, r.previousRevenue, args.intlTag)}</td>
          <td class="num">${nfInt.format(r.currentUnits)}</td>
          <td class="num">${nfInt.format(r.previousUnits)}</td>
          <td class="num">${fmtPct(r.currentUnits, r.previousUnits, args.intlTag)}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Entwicklungsbericht</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 20px; color: #111; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 2px 0; font-size: 12px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; }
    th { background: #f6f6f6; text-align: left; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <h1>Entwicklungsbericht Marktplätze</h1>
  <p>Berichtszeitraum: ${args.periodFrom} bis ${args.periodTo}</p>
  <p>Vergleichszeitraum: ${args.previousFrom} bis ${args.previousTo}</p>
  <p>Generiert: ${args.generatedAt.toLocaleString(args.intlTag)}</p>
  <table>
    <thead>
      <tr>
        <th>Marktplatz</th>
        <th class="num">Umsatz aktuell</th>
        <th class="num">Umsatz Vergleich</th>
        <th class="num">Δ Umsatz</th>
        <th class="num">Einheiten aktuell</th>
        <th class="num">Einheiten Vergleich</th>
        <th class="num">Δ Einheiten</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

