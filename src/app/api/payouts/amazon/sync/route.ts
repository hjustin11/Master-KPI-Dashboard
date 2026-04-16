import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  listAvailableSettlements,
  downloadAndParseSettlement,
} from "@/shared/lib/payouts/amazonSettlementFetch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    return NextResponse.json(
      { error: "Server-Konfiguration unvollständig." },
      { status: 503 }
    );
  }

  try {
    const settlements = await listAvailableSettlements(90);
    console.info(
      `[payouts:amazon:sync] ${settlements.length} verfügbare Settlements gefunden.`
    );

    if (settlements.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, message: "Keine Settlements gefunden." });
    }

    const MAX_PER_RUN = 10;
    let synced = 0;
    let skipped = 0;

    for (const meta of settlements.slice(0, MAX_PER_RUN)) {
      if (!meta.reportDocumentId) {
        console.warn(`[payouts:amazon:sync] Settlement ${meta.reportId}: kein reportDocumentId, skip.`);
        skipped++;
        continue;
      }

      // Duplikat-Check: settlement_id bereits vorhanden?
      const { data: existing } = await admin
        .from("marketplace_payouts")
        .select("id")
        .eq("marketplace_slug", "amazon")
        .eq("settlement_id", meta.reportId)
        .maybeSingle();

      if (existing) {
        console.info(`[payouts:amazon:sync] Settlement ${meta.reportId} bereits vorhanden, skip.`);
        skipped++;
        continue;
      }

      try {
        const parsed = await downloadAndParseSettlement(meta.reportDocumentId);

        const payoutRatio = parsed.grossSales > 0
          ? parsed.netPayout / parsed.grossSales
          : 0;
        const returnRate = parsed.ordersCount > 0
          ? parsed.returnsCount / parsed.ordersCount
          : 0;

        const { error: upsertErr } = await admin
          .from("marketplace_payouts")
          .upsert(
            {
              marketplace_slug: "amazon",
              settlement_id: parsed.settlementId || meta.reportId,
              period_from: parsed.periodFrom || meta.dataStartTime.slice(0, 10),
              period_to: parsed.periodTo || meta.dataEndTime.slice(0, 10),
              gross_sales: parsed.grossSales,
              refunds_amount: parsed.refundsAmount,
              refunds_fees_returned: parsed.refundsFeesReturned,
              marketplace_fees: parsed.marketplaceFees,
              fulfillment_fees: parsed.fulfillmentFees,
              advertising_fees: parsed.advertisingFees,
              shipping_fees: parsed.shippingFees,
              promotion_discounts: parsed.promotionDiscounts,
              other_fees: parsed.otherFees,
              other_fees_breakdown: parsed.otherFeesBreakdown,
              reserve_amount: parsed.reserveAmount,
              net_payout: parsed.netPayout,
              orders_count: parsed.ordersCount,
              returns_count: parsed.returnsCount,
              units_sold: parsed.unitsSold,
              payout_ratio: Math.round(payoutRatio * 10000) / 10000,
              return_rate: Math.round(returnRate * 10000) / 10000,
              product_breakdown: parsed.productBreakdown,
              currency: "EUR",
              fetched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "marketplace_slug,settlement_id" }
          );

        if (upsertErr) {
          console.error(
            `[payouts:amazon:sync] Upsert ${meta.reportId}: ${upsertErr.message}`,
            `gross=${parsed.grossSales} refunds=${parsed.refundsAmount} fees=${parsed.marketplaceFees} ` +
            `fulfillment=${parsed.fulfillmentFees} ads=${parsed.advertisingFees} shipping=${parsed.shippingFees} ` +
            `promos=${parsed.promotionDiscounts} other=${parsed.otherFees} reserve=${parsed.reserveAmount} ` +
            `net=${parsed.netPayout} orders=${parsed.ordersCount} returns=${parsed.returnsCount} units=${parsed.unitsSold}`
          );
        } else {
          synced++;
          console.info(
            `[payouts:amazon:sync] Settlement ${meta.reportId}: ${parsed.periodFrom}–${parsed.periodTo}, ` +
            `Brutto ${parsed.grossSales}€, Netto ${parsed.netPayout}€`
          );
        }
      } catch (err) {
        console.error(
          `[payouts:amazon:sync] Settlement ${meta.reportId} parse/download failed:`,
          err instanceof Error ? err.message : err
        );
        skipped++;
      }

      // Rate-Limit: 60s zwischen Settlements, Report-Downloads sind rate-limited
      await new Promise((r) => setTimeout(r, 5000));
    }

    return NextResponse.json({ synced, skipped, total: settlements.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
    console.error("[payouts:amazon:sync] FAILED:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
