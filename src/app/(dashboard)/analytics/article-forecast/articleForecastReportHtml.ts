import type { ArticleForecastExportRow } from "@/shared/lib/articleForecastReportExport";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ArticleForecastSummaryFact = {
  label: string;
  value: string;
  fullWidth?: boolean;
};

export type BuildArticleForecastReportHtmlArgs = {
  docTitle: string;
  heading: string;
  /** Same-origin path, e.g. `/brand/petrhein-logo-attached.png` */
  logoSrc: string;
  metaLines: string[];
  /** Two-column summary above the table. */
  summaryFacts?: ArticleForecastSummaryFact[];
  /** Used only when summaryFacts is empty. */
  narrative?: string;
  /** `<html lang="…">` */
  htmlLang?: string;
  headers: string[];
  rows: ArticleForecastExportRow[];
  intlTag: string;
};

export function buildArticleForecastReportHtml(args: BuildArticleForecastReportHtmlArgs): string {
  const nfInt = new Intl.NumberFormat(args.intlTag, { maximumFractionDigits: 0 });

  const headCells = args.headers
    .map((h, i) => `<th${i >= 2 ? ' class="r"' : ""}>${escapeHtml(h)}</th>`)
    .join("");
  const bodyRows = args.rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.sku)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td class="r">${nfInt.format(r.sold)}</td>
      <td class="r">${nfInt.format(r.stock)}</td>
      <td class="r">${Number.isFinite(r.dailySold) ? nfInt.format(r.dailySold) : "—"}</td>
      <td class="r">${nfInt.format(r.projected)}</td>
    </tr>`
    )
    .join("");

  const metaHtml = args.metaLines
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p class="meta">${escapeHtml(line)}</p>`)
    .join("");

  const summaryHtml =
    args.summaryFacts && args.summaryFacts.length > 0
      ? `<div class="summary-grid">${args.summaryFacts
          .map(
            (f) => `
    <div class="summary-item${f.fullWidth ? " summary-item-full" : ""}">
      <span class="summary-label">${escapeHtml(f.label)}</span>
      <span class="summary-value">${escapeHtml(f.value)}</span>
    </div>`
          )
          .join("")}</div>`
      : args.narrative
        ? `<p class="narrative">${escapeHtml(args.narrative)}</p>`
        : "";

  const lang = args.htmlLang ?? "en";

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(args.docTitle)}</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 22px; color: #111827; font-size: 13px; }
      .logo-wrap { text-align: center; margin: 0 0 16px; }
      .logo-wrap img { max-height: 48px; width: auto; }
      h1 { font-size: 20px; font-weight: 800; margin: 0 0 14px; text-align: center; letter-spacing: -0.02em; color: #030712; }
      .meta { color: #4b5563; font-size: 12px; margin: 0 0 4px; line-height: 1.35; }
      .summary-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 28px;
        margin: 0 0 20px;
        padding: 16px 18px;
        background: #f9fafb;
        border: 2px solid #e5e7eb;
        border-radius: 12px;
        page-break-inside: avoid;
      }
      .summary-item { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .summary-item-full { grid-column: 1 / -1; padding-top: 10px; margin-top: 4px; border-top: 2px solid #e5e7eb; }
      .summary-label { font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; }
      .summary-value { font-weight: 600; font-size: 14px; line-height: 1.4; color: #111827; }
      .summary-item-full .summary-value { font-size: 13px; font-weight: 700; color: #1e3a5f; }
      .narrative {
        color: #374151;
        font-size: 12px;
        line-height: 1.5;
        margin: 14px 0 16px;
        text-align: left;
        white-space: pre-line;
      }
      .table-wrap { border: 2px solid #d1d5db; border-radius: 10px; overflow: hidden; page-break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 7px 6px; text-align: left; word-wrap: break-word; }
      th { font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; background: #f3f4f6; color: #374151; }
      tr:last-child td { border-bottom: none; }
      td.r, th.r { text-align: right; }
      td, th { vertical-align: top; font-variant-numeric: tabular-nums; }
      tbody td { font-weight: 500; }
      col.sku { width: 11%; }
      col.name { width: 34%; }
      col.num { width: 11%; }
      @media print { body { margin: 10mm; } }
    </style>
  </head>
  <body>
    <div class="logo-wrap">
      <img src="${escapeHtml(args.logoSrc)}" alt="Petrhein" />
    </div>
    <h1>${escapeHtml(args.heading)}</h1>
    ${metaHtml}
    ${summaryHtml}
    <div class="table-wrap">
      <table>
        <colgroup>
          <col class="sku" /><col class="name" /><col class="num" /><col class="num" /><col class="num" /><col class="num" />
        </colgroup>
        <thead><tr>${headCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

/** Browser print dialog (save as PDF), same pattern as Analytics → Marktplätze. */
export function printArticleForecastReport(html: string): void {
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (popup) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    const triggerPrint = () => {
      popup.focus();
      popup.print();
    };
    popup.addEventListener("load", triggerPrint, { once: true });
    window.setTimeout(triggerPrint, 350);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 700);
  };
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    cleanup();
  };
  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    cleanup();
  }, 400);
}
