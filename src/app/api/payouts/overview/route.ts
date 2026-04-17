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

function num(v: number | null): number {
  return v ?? 0;
}

function toPayoutRow(r: DbRow): PayoutRow {
  return {
    id: r.id,
    marketplaceSlug: r.marketplace_slug,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    settlementId: r.settlement_id,
    grossSales: num(r.gross_sales),
    refundsAmount: num(r.refunds_amount),
    refundsFeesReturned: num(r.refunds_fees_returned),
    marketplaceFees: num(r.marketplace_fees),
    fulfillmentFees: num(r.fulfillment_fees),
    advertisingFees: num(r.advertising_fees),
    shippingFees: num(r.shipping_fees),
    promotionDiscounts: num(r.promotion_discounts),
    otherFees: num(r.other_fees),
    otherFeesBreakdown: (r.other_fees_breakdown as Record<string, number>) ?? null,
    reserveAmount: num(r.reserve_amount),
    netPayout: num(r.net_payout),
    ordersCount: num(r.orders_count),
    returnsCount: num(r.returns_count),
    unitsSold: num(r.units_sold),
    payoutRatio: num(r.payout_ratio),
    returnRate: num(r.return_rate),
    acos: r.acos,
    tacos: r.tacos,
    productBreakdown: (r.product_breakdown as PayoutProductEntry[]) ?? null,
    currency: r.currency,
    fetchedAt: r.fetched_at,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumTotals(rows: PayoutRow[]): PayoutTotals {
  let gross = 0, refunds = 0, mFees = 0, fFees = 0, ads = 0, ship = 0, promo = 0, other = 0, net = 0;
  let orders = 0, returns = 0, units = 0;
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
    units += r.unitsSold;
  }

  const totalFees = round2(Math.abs(mFees) + Math.abs(fFees) + Math.abs(ship) + Math.abs(promo) + Math.abs(other));
  const payoutRatio = gross > 0 ? Math.round((net / gross) * 10000) / 10000 : 0;
  const returnRate = orders > 0 ? Math.round((returns / orders) * 10000) / 10000 : 0;
  const aov = orders > 0 ? round2(gross / orders) : 0;
  const tacos = gross > 0 ? round2((Math.abs(ads) / gross) * 100) : 0;

  return {
    grossSales: round2(gross),
    refundsAmount: round2(refunds),
    marketplaceFees: round2(mFees),
    fulfillmentFees: round2(fFees),
    advertisingFees: round2(ads),
    shippingFees: round2(ship),
    promotionDiscounts: round2(promo),
    otherFees: round2(other),
    netPayout: round2(net),
    ordersCount: orders,
    returnsCount: returns,
    unitsSold: units,
    payoutRatio,
    returnRate,
    aov,
    tacos,
    totalFees,
  };
}

function computeDeltas(current: PayoutTotals, previous: PayoutTotals): PayoutDeltas {
  const pctDelta = (c: number, p: number) =>
    p !== 0 ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : null;
  return {
    grossSales: pctDelta(current.grossSales, previous.grossSales),
    netPayout: pctDelta(current.netPayout, previous.netPayout),
    payoutRatio: Math.round((current.payoutRatio - previous.payoutRatio) * 10000) / 10000,
    returnRate: Math.round((current.returnRate - previous.returnRate) * 10000) / 10000,
    ordersCount: pctDelta(current.ordersCount, previous.ordersCount),
    refundsAmount: pctDelta(Math.abs(current.refundsAmount), Math.abs(previous.refundsAmount)),
    advertisingFees: pctDelta(Math.abs(current.advertisingFees), Math.abs(previous.advertisingFees)),
    aov: pctDelta(current.aov, previous.aov),
    tacos: round2(current.tacos - previous.tacos),
  };
}

function midpointDate(from: string, to: string): number {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  return f + (t - f) / 2;
}

function isInRange(settlementFrom: string, settlementTo: string, rangeFrom: string, rangeTo: string): boolean {
  const mid = midpointDate(settlementFrom, settlementTo);
  const rFrom = new Date(rangeFrom).getTime();
  const rTo = new Date(rangeTo).getTime() + 86_400_000;
  return mid >= rFrom && mid < rTo;
}

async function queryAllSettlements(
  admin: ReturnType<typeof createAdminClient>,
  fromEarliest: string,
  toLatest: string,
  marketplaces: string[]
) {
  let query = admin
    .from("marketplace_payouts")
    .select("*")
    .gte("period_to", fromEarliest)
    .lte("period_from", toLatest)
    .order("period_from", { ascending: false });

  if (marketplaces.length > 0) {
    query = query.in("marketplace_slug", marketplaces);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toPayoutRow(r as DbRow));
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

  // "amazon" (legacy) expandieren auf "amazon-de" + alle anderen amazon-<country> Slugs,
  // damit alte UI-Filter weiterhin alle Amazon-Settlements liefern.
  const parsedMarketplaces = marketplacesParam
    ? marketplacesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const marketplaces = parsedMarketplaces.flatMap((s) => {
    if (s !== "amazon") return [s];
    // 'amazon' wird zu allen Amazon-Country-Slugs + legacy 'amazon' expandiert.
    return [
      "amazon",
      "amazon-de",
      "amazon-fr",
      "amazon-it",
      "amazon-es",
      "amazon-nl",
      "amazon-pl",
      "amazon-se",
      "amazon-be",
      "amazon-uk",
    ];
  });

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const spanMs = toMs - fromMs;
  const prevFrom = new Date(fromMs - spanMs).toISOString().slice(0, 10);
  const prevTo = new Date(fromMs - 86_400_000).toISOString().slice(0, 10);

  const earliestFrom = compare ? prevFrom : from;

  let allRows: PayoutRow[];
  try {
    allRows = await queryAllSettlements(admin, earliestFrom, to, marketplaces);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "DB-Fehler" }, { status: 500 });
  }

  const currentRows: PayoutRow[] = [];
  const previousRows: PayoutRow[] = [];

  for (const row of allRows) {
    if (isInRange(row.periodFrom, row.periodTo, from, to)) {
      currentRows.push(row);
    } else if (compare && isInRange(row.periodFrom, row.periodTo, prevFrom, prevTo)) {
      previousRows.push(row);
    }
  }

  const totals = sumTotals(currentRows);
  let previousTotals: PayoutTotals | null = null;
  let deltas: PayoutDeltas | null = null;

  if (compare) {
    previousTotals = sumTotals(previousRows);
    deltas = computeDeltas(totals, previousTotals);
  }

  const payload: PayoutOverview = {
    period: { from, to },
    previousPeriod: compare ? { from: prevFrom, to: prevTo } : null,
    marketplaces: marketplaces.length > 0
      ? marketplaces
      : [...new Set([...currentRows, ...previousRows].map((r) => r.marketplaceSlug))],
    totals,
    previousTotals,
    deltas,
    rows: currentRows,
    previousRows,
  };

  return NextResponse.json(payload);
}
