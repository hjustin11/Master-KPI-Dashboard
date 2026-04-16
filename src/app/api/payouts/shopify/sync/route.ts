import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  getFlexIntegrationConfig,
  flexGet,
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
} from "@/shared/lib/flexMarketplaceApiClient";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LOG = "[payouts:shopify]";

type ShopifyPayout = {
  id: number;
  date: string;
  amount: string;
  currency: string;
  status: string;
};

type ShopifyTransaction = {
  type: string;
  amount: string;
  fee: string;
  net: string;
  source_type: string;
};

export async function POST() {
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

  let config;
  try {
    config = await getFlexIntegrationConfig(FLEX_MARKETPLACE_SHOPIFY_SPEC);
    if (!config.baseUrl || !config.apiKey) {
      return NextResponse.json({ error: "Shopify nicht konfiguriert.", synced: 0 });
    }
  } catch {
    return NextResponse.json({ error: "Shopify-Konfiguration nicht ladbar.", synced: 0 });
  }

  try {
    // Shopify Payments Payouts API
    const payoutsRes = await flexGet(config, "/admin/api/2024-10/shopify_payments/payouts.json?limit=20");
    if (!payoutsRes.ok) {
      const text = await payoutsRes.text();
      console.error(`${LOG} payouts API: HTTP ${payoutsRes.status}`, text.slice(0, 300));
      const scopeError = text.includes("read_shopify_payments_payouts");
      return NextResponse.json({
        error: scopeError
          ? "Shopify Payouts erfordern den API-Scope 'read_shopify_payments_payouts'. Bitte in der Shopify Admin App unter Apps → App entwickeln die Berechtigung aktivieren."
          : `Shopify Payments API: HTTP ${payoutsRes.status}`,
        synced: 0,
        scopeMissing: scopeError,
      });
    }

    const payoutsBody = (await payoutsRes.json().catch(() => null)) as {
      payouts?: ShopifyPayout[];
    } | null;
    const payouts = payoutsBody?.payouts ?? [];
    console.info(`${LOG} ${payouts.length} Payouts gefunden.`);

    let synced = 0;
    let skipped = 0;

    for (const payout of payouts) {
      if (payout.status !== "paid") {
        skipped++;
        continue;
      }

      // Balance Transactions for this payout
      const txRes = await flexGet(
        config,
        `/admin/api/2024-10/shopify_payments/balance/transactions.json?payout_id=${payout.id}&limit=250`
      );
      let grossSales = 0;
      let fees = 0;
      let refunds = 0;
      let ordersCount = 0;

      if (txRes.ok) {
        const txBody = (await txRes.json().catch(() => null)) as {
          transactions?: ShopifyTransaction[];
        } | null;
        for (const tx of txBody?.transactions ?? []) {
          const amount = parseFloat(tx.amount) || 0;
          const fee = parseFloat(tx.fee) || 0;
          if (tx.type === "charge" || tx.type === "sale") {
            grossSales += amount;
            fees += Math.abs(fee);
            ordersCount++;
          } else if (tx.type === "refund") {
            refunds += Math.abs(amount);
          }
        }
      }

      const netPayout = parseFloat(payout.amount) || 0;
      const payoutRatio = grossSales > 0 ? netPayout / grossSales : 0;
      const payoutDate = payout.date.slice(0, 10);

      const { error: upsertErr } = await admin
        .from("marketplace_payouts")
        .upsert(
          {
            marketplace_slug: "shopify",
            settlement_id: String(payout.id),
            period_from: payoutDate,
            period_to: payoutDate,
            gross_sales: Math.round(grossSales * 100) / 100,
            refunds_amount: Math.round(refunds * 100) / 100,
            refunds_fees_returned: 0,
            marketplace_fees: Math.round(fees * 100) / 100,
            fulfillment_fees: 0,
            advertising_fees: 0,
            shipping_fees: 0,
            promotion_discounts: 0,
            other_fees: 0,
            reserve_amount: 0,
            net_payout: Math.round(netPayout * 100) / 100,
            orders_count: ordersCount,
            returns_count: 0,
            units_sold: 0,
            payout_ratio: Math.round(payoutRatio * 10000) / 10000,
            return_rate: 0,
            currency: payout.currency || "EUR",
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "marketplace_slug,settlement_id" }
        );

      if (upsertErr) {
        console.error(`${LOG} upsert payout ${payout.id}: ${upsertErr.message}`);
        skipped++;
      } else {
        synced++;
      }

      await new Promise((r) => setTimeout(r, 500)); // Shopify rate-limit
    }

    return NextResponse.json({ synced, skipped, total: payouts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
    console.error(`${LOG} FAILED:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
