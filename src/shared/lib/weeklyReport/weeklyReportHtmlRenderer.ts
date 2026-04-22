/**
 * HTML-Renderer für den Wochenbericht-Export.
 *
 * Generiert eine standalone HTML-Seite mit Inline-CSS, die im Browser-Print-Dialog
 * als PDF gespeichert werden kann. Layout: Querformat (A4 Landscape).
 */

import type {
  WeeklyMarketplaceData,
  WeeklyReportData,
  WeeklyReportNarrativeSegment,
  WeeklyTopSku,
} from "@/shared/lib/weeklyReport/weeklyReportService";

const PDF_TOP_SKU_LIMIT = 10;

const fmtEur = (v: number) => `${Math.round(v).toLocaleString("de-DE")} €`;
const fmtInt = (v: number) => v.toLocaleString("de-DE");
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
const fmtDeltaPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
const fmtPp = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} pp`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trendHexColor(delta: number): string {
  if (delta > 5) return "#15803d";
  if (delta < -5) return "#b91c1c";
  return "#64748b";
}

function sparklineSvg(values: number[]): string {
  if (values.length === 0) return "";
  const W = 80;
  const H = 22;
  const PAD_X = 2;
  const PAD_Y = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (W - PAD_X * 2) / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = PAD_X + i * xStep;
      const yNorm = (v - min) / range;
      const y = H - PAD_Y - yNorm * (H - PAD_Y * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = values.at(-1)! > values[0] ? "#639922" : values.at(-1)! < values[0] ? "#E24B4A" : "#888780";
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" /></svg>`;
}

function shareBar(percent: number, delta: number): string {
  const color = delta > 0 ? "#639922" : delta < 0 ? "#BA7517" : "#888780";
  const width = Math.min(100, Math.max(0, percent));
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
        <div style="width:${width}%;height:100%;background:${color};border-radius:3px;"></div>
      </div>
      <span style="font-size:10px;color:#64748b;min-width:34px;text-align:right;">${width.toFixed(1).replace(".", ",")} %</span>
    </div>`;
}

function renderNarrative(segments: WeeklyReportNarrativeSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === "text") return escapeHtml(seg.value);
      const color = seg.trend === "up" ? "#15803d" : seg.trend === "down" ? "#b91c1c" : "#1e293b";
      return `<span style="color:${color};font-weight:500;">${escapeHtml(seg.value)}</span>`;
    })
    .join("");
}

function renderKpi(label: string, value: string, delta: string, deltaColor: string, vs: string): string {
  return `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-delta" style="color:${deltaColor};">${escapeHtml(delta)} <span class="kpi-vs">${escapeHtml(vs)}</span></div>
    </div>`;
}

function renderTopList(title: string, items: WeeklyTopSku[], positive: boolean): string {
  const color = positive ? "#15803d" : "#b91c1c";
  const heading = `${escapeHtml(title)} <span class="count">(${items.length})</span>`;
  if (items.length === 0) {
    return `<div class="detail-block"><div class="detail-label">${heading}</div><div class="detail-empty">—</div></div>`;
  }
  const rows = items
    .slice(0, PDF_TOP_SKU_LIMIT)
    .map(
      (it, idx) =>
        `<li><span class="sku-rank">#${idx + 1}</span><span class="sku-code">${escapeHtml(it.sku)}</span><span class="sku-orders">${it.ordersCurrent} Best.</span><span style="color:${color};font-weight:500;">${fmtDeltaPct(it.deltaPercent)}</span></li>`
    )
    .join("");
  return `
    <div class="detail-block">
      <div class="detail-label">${heading}</div>
      <ul class="sku-list">${rows}</ul>
    </div>`;
}

function renderDailyPriceChart(dailyRevenue: number[], dailyOrders: number[], strokeColor: string): string {
  const dailyAvg = dailyRevenue.map((rev, i) => {
    const o = dailyOrders[i] ?? 0;
    return o > 0 ? rev / o : 0;
  });
  const hasData = dailyAvg.some((v) => v > 0);
  if (!hasData) return '<div class="price-chart-empty">Keine Tageswerte</div>';
  const W = 420;
  const H = 40;
  const PAD_X = 4;
  const PAD_Y = 4;
  const nonZero = dailyAvg.filter((v) => v > 0);
  const min = Math.min(...nonZero);
  const max = Math.max(...nonZero);
  const range = max - min || 1;
  const xStep = (W - PAD_X * 2) / Math.max(dailyAvg.length - 1, 1);
  const points = dailyAvg
    .map((v, i) => {
      const x = PAD_X + i * xStep;
      const yNorm = v > 0 ? (v - min) / range : 0;
      const y = H - PAD_Y - yNorm * (H - PAD_Y * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const legend = days
    .map((d, i) =>
      dailyAvg[i] > 0
        ? `<span>${d} <span class="muted">${Math.round(dailyAvg[i])}€</span></span>`
        : `<span>${d} <span class="muted">—</span></span>`
    )
    .join("");
  return `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="1.5" /></svg>
    <div class="price-legend">${legend}</div>`;
}

function renderMarketplaceRow(mp: WeeklyMarketplaceData, totalRevenue: number): string {
  const share = totalRevenue > 0 ? (mp.current.revenue / totalRevenue) * 100 : 0;
  const deltaColor = trendHexColor(mp.deltas.revenuePercent);
  return `
    <tr>
      <td class="mp-cell">
        <div class="mp-name">${escapeHtml(mp.name)}</div>
      </td>
      <td class="num">
        <div class="num-value">${escapeHtml(fmtEur(mp.current.revenue))}</div>
        <div class="num-delta" style="color:${deltaColor};">${escapeHtml(fmtDeltaPct(mp.deltas.revenuePercent))}</div>
      </td>
      <td>${shareBar(share, mp.deltas.revenuePercent)}</td>
      <td class="num">${escapeHtml(fmtInt(mp.current.orders))}</td>
      <td class="num">${mp.current.returnRate > 0 ? escapeHtml(fmtPct(mp.current.returnRate)) : "—"}</td>
      <td>${sparklineSvg(mp.dailyRevenue)}</td>
    </tr>`;
}

function renderDetailRow(mp: WeeklyMarketplaceData): string {
  const gainers = renderTopList("Top-Gewinner", mp.topGainers, true);
  const losers = renderTopList("Top-Verlierer", mp.topLosers, false);
  const trend = mp.averagePriceTrend;
  const trendColor = trend.deltaPercent >= 0 ? "#15803d" : "#b91c1c";
  const priceBlock = `
    <div class="detail-block detail-price-wide">
      <div class="detail-label">Preisentwicklung</div>
      <div class="detail-price-summary">
        <span><span class="muted">Ø-Preis aktuell:</span> <strong>${escapeHtml(fmtEur(trend.current))}</strong></span>
        <span><span class="muted">Vorwoche:</span> ${escapeHtml(fmtEur(trend.previous))}</span>
        <span style="color:${trendColor};font-weight:500;">Trend: ${escapeHtml(fmtDeltaPct(trend.deltaPercent))}</span>
      </div>
      <div class="price-chart">
        ${renderDailyPriceChart(mp.dailyRevenue, mp.dailyOrders, trendColor)}
      </div>
    </div>`;
  return `
    <tr class="detail-row">
      <td colspan="6">
        <div class="detail-grid-two">
          ${gainers}
          ${losers}
        </div>
        ${priceBlock}
      </td>
    </tr>`;
}

export function renderWeeklyReportHtml(data: WeeklyReportData): string {
  const currentWeek = data.weeks.current;
  const previousWeek = data.weeks.previous;
  const totals = data.totals;

  const totalRevenue = data.marketplaces.reduce((acc, m) => acc + m.current.revenue, 0);
  const marketRows = data.marketplaces
    .map((mp) => renderMarketplaceRow(mp, totalRevenue) + renderDetailRow(mp))
    .join("");

  const revTrendColor = trendHexColor(totals.deltas.revenuePercent);
  const ordersTrendColor = trendHexColor(totals.deltas.ordersPercent);
  const aovTrendColor = trendHexColor(totals.deltas.avgOrderValuePercent);
  const returnsTrendColor = trendHexColor(-totals.deltas.returnRatePp);

  const title = `Wochenbericht KW ${currentWeek.week} / ${currentWeek.year}`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 11px; background: #fff; }
    body { padding: 12px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    .h-badge { display: inline-block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; background: #f1f5f9; padding: 2px 8px; border-radius: 999px; margin-bottom: 4px; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .h-range { font-size: 10px; color: #64748b; margin-top: 2px; }
    .story { background: #f8fafc; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; }
    .story-label { font-size: 9px; text-transform: uppercase; color: #64748b; letter-spacing: 0.06em; }
    .story-text { font-size: 13px; margin-top: 2px; line-height: 1.4; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .kpi { background: #f8fafc; border-radius: 6px; padding: 10px 14px; }
    .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .kpi-value { font-size: 18px; font-weight: 500; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .kpi-delta { font-size: 11px; margin-top: 2px; font-weight: 500; }
    .kpi-vs { color: #94a3b8; font-weight: 400; margin-left: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { text-align: left; background: #f8fafc; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 9px; text-transform: uppercase; color: #64748b; letter-spacing: 0.06em; font-weight: 500; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .num-value { font-weight: 500; }
    .num-delta { font-size: 9px; margin-top: 1px; }
    .mp-name { font-weight: 500; }
    .detail-row td { background: #f8fafc; padding: 10px 16px; }
    .detail-grid-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 10px; }
    .detail-block { }
    .detail-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
    .detail-label .count { color: #94a3b8; font-weight: 400; }
    .sku-list { list-style: none; padding: 0; margin: 0; }
    .sku-list li { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 8px; align-items: baseline; padding: 3px 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 2px; font-size: 10px; }
    .sku-rank { color: #94a3b8; font-weight: 500; font-variant-numeric: tabular-nums; }
    .sku-code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.5px; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sku-orders { color: #64748b; font-size: 9px; font-variant-numeric: tabular-nums; }
    .detail-empty { font-size: 10px; color: #94a3b8; padding: 6px; border: 1px dashed #e2e8f0; border-radius: 4px; text-align: center; }
    .detail-price-wide { background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; }
    .detail-price-summary { display: flex; gap: 18px; flex-wrap: wrap; font-size: 10px; margin-bottom: 6px; }
    .detail-price-summary .muted { color: #64748b; }
    .price-chart { border-top: 1px solid #f1f5f9; padding-top: 6px; }
    .price-chart-empty { color: #94a3b8; font-size: 10px; padding: 6px 0; }
    .price-legend { display: flex; justify-content: space-between; margin-top: 2px; font-size: 8.5px; color: #64748b; }
    .price-legend .muted { color: #94a3b8; }
    footer { margin-top: 14px; font-size: 8px; color: #94a3b8; text-align: right; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="h-badge">Wochenbericht · Präsentationssicht</div>
      <h1>KW ${currentWeek.week} vs. KW ${previousWeek.week}</h1>
      <div class="h-range">${escapeHtml(formatRange(currentWeek.start, currentWeek.end))} · verglichen mit ${escapeHtml(formatRange(previousWeek.start, previousWeek.end))}</div>
    </div>
    <div style="text-align:right;font-size:9px;color:#94a3b8;">
      Erstellt am ${new Date().toLocaleDateString("de-DE")}
    </div>
  </header>

  <div class="story">
    <div class="story-label">Kernaussage</div>
    <div class="story-text">${renderNarrative(data.narrative.segments)}</div>
  </div>

  <div class="kpi-grid">
    ${renderKpi("Umsatz", fmtEur(totals.current.revenue), fmtDeltaPct(totals.deltas.revenuePercent), revTrendColor, "vs. Vorwoche")}
    ${renderKpi("Bestellungen", fmtInt(totals.current.orders), fmtDeltaPct(totals.deltas.ordersPercent), ordersTrendColor, "vs. Vorwoche")}
    ${renderKpi("Ø Bestellwert", fmtEur(totals.current.avgOrderValue), fmtDeltaPct(totals.deltas.avgOrderValuePercent), aovTrendColor, "vs. Vorwoche")}
    ${renderKpi("Retouren", fmtPct(totals.current.returnRate), fmtPp(totals.deltas.returnRatePp), returnsTrendColor, "vs. Vorwoche")}
  </div>

  <table>
    <thead>
      <tr>
        <th>Marktplatz</th>
        <th style="text-align:right;">Umsatz</th>
        <th>Anteil</th>
        <th style="text-align:right;">Bestellungen</th>
        <th style="text-align:right;">Retouren</th>
        <th>Trend (7 Tage)</th>
      </tr>
    </thead>
    <tbody>${marketRows}</tbody>
  </table>

  <footer>${escapeHtml(title)} · Master Dashboard</footer>

  <script>
    window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });
  </script>
</body>
</html>`;
}

function formatRange(start: Date, end: Date): string {
  const dStart = start.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  const dEnd = end.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  return `${dStart} – ${dEnd}`;
}
