import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const marketplace = getMarketplaceBySlug(slug);
  if (!marketplace) {
    return NextResponse.json({ error: "Marktplatz nicht gefunden." }, { status: 404 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  // Defaults: letzte 30 Tage
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const defaultFrom = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const rangeFrom = from || defaultFrom;
  const rangeTo = to || defaultTo;

  // Proxy zum bestehenden Sales-Endpoint des Marktplatzes
  const baseUrl = new URL(request.url).origin;
  const salesUrl = `${baseUrl}/api/${slug}/sales?fromYmd=${rangeFrom}&toYmd=${rangeTo}&compare=1`;

  let salesData: Record<string, unknown> | null = null;
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const res = await fetch(salesUrl, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (res.ok) {
      salesData = (await res.json()) as Record<string, unknown>;
    }
  } catch {
    // Sales-API nicht verfügbar — Platzhalter-Daten
  }

  const summary = (salesData?.summary ?? {}) as Record<string, unknown>;
  const previousSummary = (salesData?.previousSummary ?? {}) as Record<string, unknown>;
  const netBreakdown = (salesData?.netBreakdown ?? {}) as Record<string, unknown>;

  const grossSales = Number(summary.salesAmount ?? 0);
  const orders = Number(summary.orderCount ?? 0);
  const prevGross = Number(previousSummary.salesAmount ?? 0);
  const prevOrders = Number(previousSummary.orderCount ?? 0);
  const aov = orders > 0 ? grossSales / orders : 0;
  const prevAov = prevOrders > 0 ? prevGross / prevOrders : 0;

  const pctDelta = (c: number, p: number) =>
    p !== 0 ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : null;

  const payload = {
    marketplace: {
      slug: marketplace.slug,
      name: marketplace.label,
      logo: marketplace.logo,
      connected: !!salesData,
    },
    range: { from: rangeFrom, to: rangeTo },
    totals: {
      grossSales: Math.round(grossSales * 100) / 100,
      orders,
      avgOrderValue: Math.round(aov * 100) / 100,
      units: Number(summary.units ?? 0),
      returnAmount: Math.abs(Number(netBreakdown.returnedAmount ?? 0)),
      returnRate: grossSales > 0 ? Math.abs(Number(netBreakdown.returnedAmount ?? 0)) / grossSales : 0,
      adSpend: Math.abs(Number(netBreakdown.adSpendAmount ?? 0)),
      fees: Math.abs(Number(netBreakdown.feesAmount ?? 0)),
      netPayout: grossSales - Math.abs(Number(netBreakdown.returnedAmount ?? 0)) - Math.abs(Number(netBreakdown.feesAmount ?? 0)) - Math.abs(Number(netBreakdown.adSpendAmount ?? 0)),
    },
    previous: {
      grossSales: Math.round(prevGross * 100) / 100,
      orders: prevOrders,
      avgOrderValue: Math.round(prevAov * 100) / 100,
    },
    deltas: {
      grossSales: pctDelta(grossSales, prevGross),
      orders: pctDelta(orders, prevOrders),
      avgOrderValue: pctDelta(aov, prevAov),
    },
    points: salesData?.points ?? [],
    previousPoints: salesData?.previousPoints ?? [],
    narrative: "Executive Summary wird in PROMPT 1 implementiert.",
  };

  return NextResponse.json(payload);
}
