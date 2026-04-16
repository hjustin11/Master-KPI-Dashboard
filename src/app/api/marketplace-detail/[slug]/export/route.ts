import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";

export const dynamic = "force-dynamic";

function formatEur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const supabase = await createServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const marketplace = getMarketplaceBySlug(slug);
  if (!marketplace) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  // Proxy overview data
  const baseUrl = new URL(request.url).origin;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const cookieHeader = request.headers.get("cookie") ?? "";

  const overviewUrl = `${baseUrl}/api/marketplace-detail/${slug}/overview?from=${from}&to=${to}`;
  const overviewRes = await fetch(overviewUrl, { headers: { cookie: cookieHeader }, cache: "no-store" });
  const overview = overviewRes.ok ? (await overviewRes.json()) as Record<string, unknown> : null;

  const totals = (overview?.totals ?? {}) as Record<string, number>;
  const previous = (overview?.previous ?? {}) as Record<string, number>;
  const range = (overview?.range ?? {}) as Record<string, string>;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${marketplace.label} — Marktplatz-Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; color: #111; line-height: 1.5; padding: 24px; }
  .container { max-width: 900px; margin: 0 auto; }
  .header { background: #111; color: white; padding: 32px; border-radius: 12px; margin-bottom: 24px; }
  .header h1 { font-size: 28px; }
  .header .subtitle { color: #999; font-size: 14px; margin-top: 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { background: white; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; text-align: center; }
  .kpi .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 700; }
  .kpi .value { font-size: 24px; font-weight: 800; margin-top: 4px; }
  .card { background: white; border: 1px solid #e5e5e5; border-radius: 8px; padding: 24px; margin-bottom: 16px; }
  .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 700; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; border-bottom: 2px solid #eee; }
  td { padding: 8px; border-bottom: 1px solid #f0f0f0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { text-align: center; color: #999; font-size: 11px; padding: 16px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${marketplace.label}</h1>
    <div class="subtitle">Marktplatz-Report · ${fmtDate(range.from ?? "")} — ${fmtDate(range.to ?? "")}</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">Bruttoumsatz</div><div class="value">${formatEur(totals.grossSales ?? 0)}</div></div>
    <div class="kpi"><div class="label">Bestellungen</div><div class="value">${totals.orders ?? 0}</div></div>
    <div class="kpi"><div class="label">Ø Bestellwert</div><div class="value">${formatEur(totals.avgOrderValue ?? 0)}</div></div>
    <div class="kpi"><div class="label">Retourenquote</div><div class="value">${((totals.returnRate ?? 0) * 100).toFixed(1)} %</div></div>
    <div class="kpi"><div class="label">Netto</div><div class="value">${formatEur(totals.netPayout ?? 0)}</div></div>
  </div>
  <div class="card">
    <h2>Vergleich mit Vorperiode</h2>
    <table>
      <tr><th>Metrik</th><th style="text-align:right">Vorperiode</th><th style="text-align:right">Aktuell</th></tr>
      <tr><td>Bruttoumsatz</td><td class="num">${formatEur(previous.grossSales ?? 0)}</td><td class="num">${formatEur(totals.grossSales ?? 0)}</td></tr>
      <tr><td>Bestellungen</td><td class="num">${previous.orders ?? 0}</td><td class="num">${totals.orders ?? 0}</td></tr>
      <tr><td>Ø Bestellwert</td><td class="num">${formatEur(previous.avgOrderValue ?? 0)}</td><td class="num">${formatEur(totals.avgOrderValue ?? 0)}</td></tr>
    </table>
  </div>
  <div class="footer">Erstellt am ${fmtDate(new Date().toISOString())} · ${marketplace.label} Marktplatz-Report</div>
</div>
</body>
</html>`;

  const filename = `marketplace-${slug}-report-${range.from ?? "unknown"}-${range.to ?? "unknown"}.html`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
