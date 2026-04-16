import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  fetchMiraklInvoices,
  MIRAKL_PAYOUT_SLUGS,
  type MiraklInvoice,
} from "@/shared/lib/payouts/miraklSettlementFetch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function invoiceToRow(slug: string, inv: MiraklInvoice) {
  const grossSales = inv.totalAmount + inv.commissionAmount + inv.refundsAmount;
  const netPayout = inv.totalAmount;
  const payoutRatio = grossSales > 0 ? netPayout / grossSales : 0;

  return {
    marketplace_slug: slug,
    settlement_id: inv.invoiceId,
    period_from: inv.startDate || inv.dateCreated.slice(0, 10),
    period_to: inv.endDate || inv.dateCreated.slice(0, 10),
    gross_sales: Math.round(grossSales * 100) / 100,
    refunds_amount: Math.round(inv.refundsAmount * 100) / 100,
    refunds_fees_returned: 0,
    marketplace_fees: Math.round(inv.commissionAmount * 100) / 100,
    fulfillment_fees: 0,
    advertising_fees: 0,
    shipping_fees: Math.round(inv.shippingAmount * 100) / 100,
    promotion_discounts: 0,
    other_fees: Math.round(inv.otherAmount * 100) / 100,
    reserve_amount: 0,
    net_payout: Math.round(netPayout * 100) / 100,
    orders_count: inv.ordersCount,
    returns_count: 0,
    units_sold: 0,
    payout_ratio: Math.round(payoutRatio * 10000) / 10000,
    return_rate: 0,
    currency: inv.currency || "EUR",
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
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
  const slugParam = url.searchParams.get("slug")?.trim() ?? "";
  const slugs = slugParam ? [slugParam] : MIRAKL_PAYOUT_SLUGS;

  const results: Record<string, { synced: number; skipped: number; error?: string }> = {};

  for (const slug of slugs) {
    try {
      const invoices = await fetchMiraklInvoices(slug, 90);
      let synced = 0;
      let skipped = 0;

      for (const inv of invoices) {
        const row = invoiceToRow(slug, inv);
        const { error: upsertErr } = await admin
          .from("marketplace_payouts")
          .upsert(row, { onConflict: "marketplace_slug,settlement_id" });

        if (upsertErr) {
          console.error(`[payouts:mirakl:${slug}] upsert ${inv.invoiceId}: ${upsertErr.message}`);
          skipped++;
        } else {
          synced++;
        }
      }

      results[slug] = { synced, skipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      console.error(`[payouts:mirakl:${slug}] FAILED:`, msg);
      results[slug] = { synced: 0, skipped: 0, error: msg };
    }
  }

  return NextResponse.json({ results });
}
