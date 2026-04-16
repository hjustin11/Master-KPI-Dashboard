import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import type {
  PayoutOverview,
  PayoutRow,
  PayoutTotals,
  PayoutDeltas,
  PayoutProductEntry,
} from "@/shared/lib/payouts/payoutTypes";

export const dynamic = "force-dynamic";

type DbRow = {
  id: string;
  marketplace_slug: string;
  period_from: string;
  period_to: string;
  settlement_id: string | null;
  gross_sales: number | null;
  refunds_amount: number | null;
  refunds_fees_returned: number | null;
  marketplace_fees: number | null;
  fulfillment_fees: number | null;
  advertising_fees: number | null;
  shipping_fees: number | null;
  promotion_discounts: number | null;
  other_fees: number | null;
  other_fees_breakdown: unknown;
  reserve_amount: number | null;
  net_payout: number | null;
  orders_count: number | null;
  returns_count: number | null;
  units_sold: number | null;
  payout_ratio: number | null;
  return_rate: number | null;
  acos: number | null;
  tacos: number | null;
  product_breakdown: unknown;
  currency: string;
  fetched_at: string;
};

function n(v: number | null): number {
  return v ?? 0;
}

function toPayoutRow(r: DbRow): PayoutRow {
  return {
    id: r.id,
    marketplaceSlug: r.marketplace_slug,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    settlementId: r.settlement_id,
    grossSales: n(r.gross_sales),
    refundsAmount: n(r.refunds_amount),
    refundsFeesReturned: n(r.refunds_fees_returned),
    marketplaceFees: n(r.marketplace_fees),
    fulfillmentFees: n(r.fulfillment_fees),
    advertisingFees: n(r.advertising_fees),
    shippingFees: n(r.shipping_fees),
    promotionDiscounts: n(r.promotion_discounts),
    otherFees: n(r.other_fees),
    otherFeesBreakdown: (r.other_fees_breakdown as Record<string, number>) ?? null,
    reserveAmount: n(r.reserve_amount),
    netPayout: n(r.net_payout),
    ordersCount: n(r.orders_count),
    returnsCount: n(r.returns_count),
    unitsSold: n(r.units_sold),
    payoutRatio: n(r.payout_ratio),
    returnRate: n(r.return_rate),
    acos: r.acos,
    tacos: r.tacos,
    productBreakdown: (r.product_breakdown as PayoutProductEntry[]) ?? null,
    currency: r.currency,
    fetchedAt: r.fetched_at,
  };
}

function sumTotals(rows: PayoutRow[]): PayoutTotals {
  let gross = 0, refunds = 0, mFees = 0, fFees = 0, ads = 0, ship = 0, promo = 0, other = 0, net = 0;
  let orders = 0, returns = 0;
  for (const r of rows) {
    gross += r.grossSales;
    refunds += r.refundsAmount;
    mFees += r.marketplaceFees;
    fFees += r.fulfillmentFees;
    ads += r.advertisingFees;
    ship += r.shippingFees;
    promo += r.promotionDiscounts;
    other += r.otherFees;
    net += r.netPayout;
    orders += r.ordersCount;
    returns += r.returnsCount;
  }
  return {
    grossSales: Math.round(gross * 100) / 100,
    refundsAmount: Math.round(refunds * 100) / 100,
    marketplaceFees: Math.round(mFees * 100) / 100,
    fulfillmentFees: Math.round(fFees * 100) / 100,
    advertisingFees: Math.round(ads * 100) / 100,
    shippingFees: Math.round(ship * 100) / 100,
    promotionDiscounts: Math.round(promo * 100) / 100,
    otherFees: Math.round(other * 100) / 100,
    netPayout: Math.round(net * 100) / 100,
    ordersCount: orders,
    returnsCount: returns,
    payoutRatio: gross > 0 ? Math.round((net / gross) * 10000) / 10000 : 0,
    returnRate: orders > 0 ? Math.round((returns / orders) * 10000) / 10000 : 0,
  };
}

function computeDeltas(current: PayoutTotals, previous: PayoutTotals): PayoutDeltas {
  const pctDelta = (c: number, p: number) => (p !== 0 ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : null);
  return {
    grossSales: pctDelta(current.grossSales, previous.grossSales),
    netPayout: pctDelta(current.netPayout, previous.netPayout),
    payoutRatio: current.payoutRatio - previous.payoutRatio,
    returnRate: current.returnRate - previous.returnRate,
    ordersCount: pctDelta(current.ordersCount, previous.ordersCount),
  };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server-Konfiguration unvollständig." }, { status: 503 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const marketplacesParam = url.searchParams.get("marketplaces") ?? "";
  const compare = url.searchParams.get("compare") !== "false";

  if (!from || !to) {
    return NextResponse.json({ error: "from und to sind Pflicht (YYYY-MM-DD)." }, { status: 400 });
  }

  const marketplaces = marketplacesParam
    ? marketplacesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Current period
  let query = admin
    .from("marketplace_payouts")
    .select("*")
    .gte("period_from", from)
    .lte("period_to", to)
    .order("period_from", { ascending: false });

  if (marketplaces.length > 0) {
    query = query.in("marketplace_slug", marketplaces);
  }

  const { data: currentRaw, error: currentErr } = await query;
  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 });

  const rows = (currentRaw ?? []).map((r) => toPayoutRow(r as DbRow));
  const totals = sumTotals(rows);

  // Previous period (mirror-Zeitraum)
  let previousTotals: PayoutTotals | null = null;
  let deltas: PayoutDeltas | null = null;
  let previousRows: PayoutRow[] = [];

  if (compare) {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const spanMs = toMs - fromMs;
    const prevFrom = new Date(fromMs - spanMs).toISOString().slice(0, 10);
    const prevTo = new Date(fromMs).toISOString().slice(0, 10);

    let prevQuery = admin
      .from("marketplace_payouts")
      .select("*")
      .gte("period_from", prevFrom)
      .lte("period_to", prevTo)
      .order("period_from", { ascending: false });

    if (marketplaces.length > 0) {
      prevQuery = prevQuery.in("marketplace_slug", marketplaces);
    }

    const { data: prevRaw } = await prevQuery;
    previousRows = (prevRaw ?? []).map((r) => toPayoutRow(r as DbRow));
    previousTotals = sumTotals(previousRows);
    deltas = computeDeltas(totals, previousTotals);
  }

  const payload: PayoutOverview = {
    period: { from, to },
    marketplaces: marketplaces.length > 0 ? marketplaces : [...new Set(rows.map((r) => r.marketplaceSlug))],
    totals,
    previousTotals,
    deltas,
    rows,
    previousRows,
  };

  return NextResponse.json(payload);
}
