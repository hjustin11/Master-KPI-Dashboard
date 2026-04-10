import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  MAX_ANALYTICS_RANGE_DAYS,
  resolveComparisonPreviousRange,
  type CompareMode,
} from "@/shared/lib/analytics-date-range";
import { INTEGRATION_SECRETS_CONFIGURATION_HINT_DE } from "@/shared/lib/integrationSecrets";
import type { OttoOrder } from "@/shared/lib/ottoApiClient";
import {
  OTTO_DAY_MS,
  fetchOttoOrdersRange,
  getOttoAccessToken,
  getOttoIntegrationConfig,
  parseYmdParam,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/ottoApiClient";
import {
  buildNetBreakdown,
  estimateMarketplaceFeeAmount,
  getMarketplaceFeePolicy,
  sumStatusAmounts,
} from "@/shared/lib/marketplace-profitability";

export const maxDuration = 60;

type OttoSalesPoint = {
  date: string;
  orders: number;
  amount: number;
  units: number;
};

type OttoSummary = {
  orderCount: number;
  salesAmount: number;
  units: number;
  currency: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isoDate(value: string) {
  return value.slice(0, 10);
}

function summarizeOrders(orders: OttoOrder[]): { summary: OttoSummary; points: OttoSalesPoint[] } {
  const pointsMap = new Map<string, OttoSalesPoint>();
  let totalAmount = 0;
  let totalUnits = 0;
  let currency = "EUR";

  for (const order of orders) {
    const orderDate =
      typeof order.order_date === "string"
        ? order.order_date
        : typeof order.orderDate === "string"
          ? order.orderDate
          : "";
    if (!orderDate) continue;
    const ymd = isoDate(orderDate);
    const positionItems = Array.isArray(order.position_items)
      ? order.position_items
      : Array.isArray(order.positionItems)
        ? order.positionItems
        : [];

    let amountPerOrder = 0;
    let unitsPerOrder = 0;

    for (const item of positionItems) {
      const reduced = item.item_value_reduced_gross_price ?? item.itemValueReducedGrossPrice;
      const gross = item.item_value_gross_price ?? item.itemValueGrossPrice;
      const price = reduced ?? gross;
      const amount = toNumber(price?.amount ?? 0);
      const code = price?.currency;
      if (typeof code === "string" && code) currency = code;
      amountPerOrder += amount;
      unitsPerOrder += 1;
    }

    totalAmount += amountPerOrder;
    totalUnits += unitsPerOrder;

    const prev = pointsMap.get(ymd) ?? { date: ymd, orders: 0, amount: 0, units: 0 };
    prev.orders += 1;
    prev.amount = Number((prev.amount + amountPerOrder).toFixed(2));
    prev.units += unitsPerOrder;
    pointsMap.set(ymd, prev);
  }

  const points = Array.from(pointsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  return {
    summary: {
      orderCount: orders.length,
      salesAmount: Number(totalAmount.toFixed(2)),
      units: totalUnits,
      currency,
    },
    points,
  };
}

function orderStatus(order: OttoOrder): string {
  const statusParts = [
    typeof order.order_lifecycle_status === "string" ? order.order_lifecycle_status : "",
    typeof order.orderLifecycleStatus === "string" ? order.orderLifecycleStatus : "",
    typeof order.fulfillment_status === "string" ? order.fulfillment_status : "",
    typeof order.fulfillmentStatus === "string" ? order.fulfillmentStatus : "",
    typeof order.status === "string" ? order.status : "",
    typeof order.order_status === "string" ? order.order_status : "",
    typeof order.orderStatus === "string" ? order.orderStatus : "",
    typeof order.payment_status === "string" ? order.payment_status : "",
    typeof order.paymentStatus === "string" ? order.paymentStatus : "",
    typeof order.cancel_reason === "string" ? order.cancel_reason : "",
    typeof order.cancellation_reason === "string" ? order.cancellation_reason : "",
    order.cancelled_at ? "cancelled" : "",
    order.refunded_at ? "refunded" : "",
    order.returned_at ? "returned" : "",
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return statusParts.join(" ");
}

function orderAmount(order: OttoOrder): number {
  const positionItems = Array.isArray(order.position_items)
    ? order.position_items
    : Array.isArray(order.positionItems)
      ? order.positionItems
      : [];
  let amount = 0;
  for (const item of positionItems) {
    const reduced = item.item_value_reduced_gross_price ?? item.itemValueReducedGrossPrice;
    const gross = item.item_value_gross_price ?? item.itemValueGrossPrice;
    const price = reduced ?? gross;
    amount += toNumber(price?.amount ?? 0);
  }
  return Number(amount.toFixed(2));
}

async function writeSyncRecord(args: {
  fromYmd?: string;
  toYmd?: string;
  summary: OttoSummary;
  previousSummary?: OttoSummary;
  points: OttoSalesPoint[];
  previousPoints?: OttoSalesPoint[];
  revenueDeltaPct: number | null;
  meta: Record<string, unknown>;
}) {
  if (!args.fromYmd || !args.toYmd) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("otto_sync")
      .upsert(
        {
          period_from: args.fromYmd,
          period_to: args.toYmd,
          status: "ok",
          error: null,
          summary: args.summary,
          previous_summary: args.previousSummary ?? null,
          points: args.points,
          previous_points: args.previousPoints ?? null,
          revenue_delta_pct: args.revenueDeltaPct,
          meta: args.meta,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "period_from,period_to" }
      );
  } catch {
    // Sync persistence should not fail KPI response.
  }
}

export async function GET(request: Request) {
  try {
    const feePolicy = await getMarketplaceFeePolicy("otto");
    const config = await getOttoIntegrationConfig();
    const missing = {
      OTTO_API_CLIENT_ID: !config.clientId,
      OTTO_API_CLIENT_SECRET: !config.clientSecret,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Otto API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing).filter(([, v]) => v).map(([k]) => k),
          hint: INTEGRATION_SECRETS_CONFIGURATION_HINT_DE,
          integrationSecretsLoadErrors: config.integrationSecretsLoadErrors,
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const compare =
      searchParams.get("compare") === "1" ||
      searchParams.get("compare") === "true" ||
      searchParams.get("compare") === "yes";
    const compareMode: CompareMode = searchParams.get("compareMode") === "previous" ? "previous" : "yoy";
    const fromYmd = parseYmdParam(searchParams.get("from"));
    const toYmd = parseYmdParam(searchParams.get("to"));

    const now = Date.now();
    let days: number;
    let currentStartMs: number;
    let currentEndMs: number;
    let prevStartMs = 0;
    let prevEndMs = 0;
    let rangeFromLabel: string | undefined;
    let rangeToLabel: string | undefined;

    if (fromYmd && toYmd) {
      if (fromYmd > toYmd) {
        return NextResponse.json(
          { error: "Ungültiger Zeitraum: „von“ muss vor oder gleich „bis“ liegen." },
          { status: 400 }
        );
      }
      const r = ymdToUtcRangeExclusiveEnd(fromYmd, toYmd);
      currentStartMs = r.startMs;
      currentEndMs = r.endMs;
      const spanDays = Math.round((currentEndMs - currentStartMs) / OTTO_DAY_MS);
      if (spanDays < 1 || spanDays > MAX_ANALYTICS_RANGE_DAYS) {
        return NextResponse.json(
          { error: `Zeitraum muss 1–${String(MAX_ANALYTICS_RANGE_DAYS)} Tage umfassen.` },
          { status: 400 }
        );
      }
      days = spanDays;
      rangeFromLabel = fromYmd;
      rangeToLabel = toYmd;
      if (compare) {
        const previous = resolveComparisonPreviousRange(currentStartMs, currentEndMs, compareMode);
        prevStartMs = previous.prevStartMs;
        prevEndMs = previous.prevEndMs;
      }
    } else {
      days = Math.min(
        Math.max(Number(searchParams.get("days") ?? "7") || 7, 1),
        MAX_ANALYTICS_RANGE_DAYS
      );
      currentStartMs = now - days * OTTO_DAY_MS;
      currentEndMs = now;
      if (compare) {
        prevStartMs = now - days * 2 * OTTO_DAY_MS;
        prevEndMs = now - days * OTTO_DAY_MS;
      }
    }

    const token = await getOttoAccessToken(config);

    if (compare) {
      const [currentOrders, previousOrders] = await Promise.all([
        fetchOttoOrdersRange({
          baseUrl: config.baseUrl,
          token,
          startMs: currentStartMs,
          endMs: currentEndMs,
        }),
        fetchOttoOrdersRange({
          baseUrl: config.baseUrl,
          token,
          startMs: prevStartMs,
          endMs: prevEndMs,
        }),
      ]);

      const current = summarizeOrders(currentOrders);
      const previous = summarizeOrders(previousOrders);
      const revenueDeltaPct =
        previous.summary.salesAmount > 0
          ? Number(
              (
                ((current.summary.salesAmount - previous.summary.salesAmount) /
                  previous.summary.salesAmount) *
                100
              ).toFixed(1)
            )
          : null;

      const meta = {
        days,
        compare: true as const,
        source: "orders_v4" as const,
        baseUrl: config.baseUrl,
        scopes: config.scopes,
        ...(rangeFromLabel && rangeToLabel ? { from: rangeFromLabel, to: rangeToLabel } : {}),
      };

      await writeSyncRecord({
        fromYmd: rangeFromLabel,
        toYmd: rangeToLabel,
        summary: current.summary,
        previousSummary: previous.summary,
        points: current.points,
        previousPoints: previous.points,
        revenueDeltaPct,
        meta,
      });

      const currentFee = estimateMarketplaceFeeAmount({
        salesAmount: current.summary.salesAmount,
        orderCount: current.summary.orderCount,
        policy: feePolicy,
      });
      const previousFee = estimateMarketplaceFeeAmount({
        salesAmount: previous.summary.salesAmount,
        orderCount: previous.summary.orderCount,
        policy: feePolicy,
      });
      const currentReturns = sumStatusAmounts({
        items: currentOrders,
        getStatus: orderStatus,
        getAmount: orderAmount,
      });
      const previousReturns = sumStatusAmounts({
        items: previousOrders,
        getStatus: orderStatus,
        getAmount: orderAmount,
      });
      return NextResponse.json({
        meta,
        summary: current.summary,
        previousSummary: previous.summary,
        netBreakdown: buildNetBreakdown({
          salesAmount: current.summary.salesAmount,
          returnedAmount: currentReturns.returnedAmount,
          cancelledAmount: currentReturns.cancelledAmount,
          feesAmount: currentFee.feesAmount,
          adSpendAmount: 0,
          feeSource: currentFee.feeSource,
          returnsSource: currentReturns.returnsSource,
        }),
        previousNetBreakdown: buildNetBreakdown({
          salesAmount: previous.summary.salesAmount,
          returnedAmount: previousReturns.returnedAmount,
          cancelledAmount: previousReturns.cancelledAmount,
          feesAmount: previousFee.feesAmount,
          adSpendAmount: 0,
          feeSource: previousFee.feeSource,
          returnsSource: previousReturns.returnsSource,
        }),
        revenueDeltaPct,
        points: current.points,
        previousPoints: previous.points,
      });
    }

    const orders = await fetchOttoOrdersRange({
      baseUrl: config.baseUrl,
      token,
      startMs: currentStartMs,
      endMs: currentEndMs,
    });
    const current = summarizeOrders(orders);
    const meta = {
      days,
      compare: false as const,
      source: "orders_v4" as const,
      baseUrl: config.baseUrl,
      scopes: config.scopes,
      ...(rangeFromLabel && rangeToLabel ? { from: rangeFromLabel, to: rangeToLabel } : {}),
    };

    await writeSyncRecord({
      fromYmd: rangeFromLabel,
      toYmd: rangeToLabel,
      summary: current.summary,
      points: current.points,
      revenueDeltaPct: null,
      meta,
    });

    const fee = estimateMarketplaceFeeAmount({
      salesAmount: current.summary.salesAmount,
      orderCount: current.summary.orderCount,
      policy: feePolicy,
    });
    const returns = sumStatusAmounts({
      items: orders,
      getStatus: orderStatus,
      getAmount: orderAmount,
    });
    return NextResponse.json({
      meta,
      summary: current.summary,
      netBreakdown: buildNetBreakdown({
        salesAmount: current.summary.salesAmount,
        returnedAmount: returns.returnedAmount,
        cancelledAmount: returns.cancelledAmount,
        feesAmount: fee.feesAmount,
        adSpendAmount: 0,
        feeSource: fee.feeSource,
        returnsSource: returns.returnsSource,
      }),
      points: current.points,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
