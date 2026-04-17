import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { getMarketplaceBySlug } from "@/shared/lib/analytics-marketplaces";

export const dynamic = "force-dynamic";

type ProductEntry = { sku: string; title?: string; gross: number; fees: number; refunds: number; ads: number; net: number; units: number; returns: number };

type ProductRow = {
  sku: string;
  name: string;
  revenueCurrent: number;
  revenuePrevious: number;
  ordersCurrent: number;
  ordersPrevious: number;
  returnsCurrent: number;
  returnsPrevious: number;
  deltaPct: number;
  status: "bestseller" | "newcomer" | "losing_ground" | "reviving" | "sunset" | "stable";
};

function classifyStatus(curr: number, prev: number, rankCurr: number): ProductRow["status"] {
  if (prev === 0 && curr > 200) return "newcomer";
  if (curr === 0 && prev > 200) return "sunset";
  const delta = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  if (delta < -30 && rankCurr <= 20) return "losing_ground";
  if (delta > 50 && prev < 500) return "reviving";
  if (rankCurr <= 10 && curr > 0) return "bestseller";
  return "stable";
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
  if (!marketplace) return NextResponse.json({ error: "Marktplatz nicht gefunden." }, { status: 404 });

  let admin;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "Server-Konfiguration." }, { status: 503 }); }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  // Previous period: same length directly before
  const spanMs = new Date(to).getTime() - new Date(from).getTime();
  const prevFrom = new Date(new Date(from).getTime() - spanMs).toISOString().slice(0, 10);
  const prevTo = new Date(new Date(from).getTime() - 86_400_000).toISOString().slice(0, 10);

  // Query payouts with product_breakdown for current + previous
  const { data: rows } = await admin
    .from("marketplace_payouts")
    .select("period_from, period_to, product_breakdown")
    .eq("marketplace_slug", slug === "amazon" ? "amazon-de" : slug)
    .gte("period_to", prevFrom)
    .lte("period_from", to)
    .not("product_breakdown", "is", null);

  const currMap = new Map<string, { gross: number; units: number; returns: number; name: string }>();
  const prevMap = new Map<string, { gross: number; units: number; returns: number; name: string }>();

  for (const row of rows ?? []) {
    const entries = (row.product_breakdown ?? []) as ProductEntry[];
    const midpoint = (new Date(row.period_from).getTime() + new Date(row.period_to).getTime()) / 2;
    const isCurrent = midpoint >= new Date(from).getTime() && midpoint < new Date(to).getTime() + 86_400_000;
    const isPrevious = midpoint >= new Date(prevFrom).getTime() && midpoint < new Date(from).getTime();

    const target = isCurrent ? currMap : isPrevious ? prevMap : null;
    if (!target) continue;

    for (const e of entries) {
      const existing = target.get(e.sku);
      if (existing) {
        existing.gross += e.gross ?? 0;
        existing.units += e.units ?? 0;
        existing.returns += e.returns ?? 0;
      } else {
        target.set(e.sku, { gross: e.gross ?? 0, units: e.units ?? 0, returns: e.returns ?? 0, name: e.title ?? e.sku });
      }
    }
  }

  // Build ranked list
  const allSkus = new Set([...currMap.keys(), ...prevMap.keys()]);
  const products: ProductRow[] = [];

  // Sort by current revenue for ranking
  const sortedByRevenue = [...allSkus].sort((a, b) => (currMap.get(b)?.gross ?? 0) - (currMap.get(a)?.gross ?? 0));

  for (let i = 0; i < sortedByRevenue.length; i++) {
    const sku = sortedByRevenue[i];
    const curr = currMap.get(sku);
    const prev = prevMap.get(sku);
    const revCurr = curr?.gross ?? 0;
    const revPrev = prev?.gross ?? 0;
    const deltaPct = revPrev > 0 ? ((revCurr - revPrev) / revPrev) * 100 : revCurr > 0 ? 100 : 0;

    products.push({
      sku,
      name: curr?.name ?? prev?.name ?? sku,
      revenueCurrent: Math.round(revCurr * 100) / 100,
      revenuePrevious: Math.round(revPrev * 100) / 100,
      ordersCurrent: curr?.units ?? 0,
      ordersPrevious: prev?.units ?? 0,
      returnsCurrent: curr?.returns ?? 0,
      returnsPrevious: prev?.returns ?? 0,
      deltaPct: Math.round(deltaPct * 10) / 10,
      status: classifyStatus(revCurr, revPrev, i + 1),
    });
  }

  return NextResponse.json({
    range: { from, to },
    previousRange: { from: prevFrom, to: prevTo },
    products: products.slice(0, 50),
    summary: {
      totalSkus: allSkus.size,
      newcomers: products.filter((p) => p.status === "newcomer").length,
      losingGround: products.filter((p) => p.status === "losing_ground").length,
      sunsets: products.filter((p) => p.status === "sunset").length,
    },
  });
}
