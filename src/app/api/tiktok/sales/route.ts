import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  MAX_ANALYTICS_RANGE_DAYS,
  resolveComparisonPreviousRange,
  type CompareMode,
} from "@/shared/lib/analytics-date-range";
import {
  TIKTOK_DAY_MS,
  fetchTiktokOrdersPaginated,
  filterOrdersByCreatedRange,
  getTiktokIntegrationConfig,
  parseYmdParam,
  summarizeTiktokOrders,
  tiktokMissingKeysForConfig,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/tiktokApiClient";
import {
  buildNetBreakdown,
  estimateMarketplaceFeeAmount,
  getMarketplaceFeePolicy,
  sumStatusAmounts,
} from "@/shared/lib/marketplace-profitability";

async function writeSyncRecord(args: {
  fromYmd?: string;
  toYmd?: string;
  summary: ReturnType<typeof summarizeTiktokOrders>["summary"];
  previousSummary?: ReturnType<typeof summarizeTiktokOrders>["summary"];
  points: ReturnType<typeof summarizeTiktokOrders>["points"];
  previousPoints?: ReturnType<typeof summarizeTiktokOrders>["points"];
  revenueDeltaPct: number | null;
  meta: Record<string, unknown>;
}) {
  if (!args.fromYmd || !args.toYmd) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("tiktok_sync")
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
    const feePolicy = await getMarketplaceFeePolicy("tiktok");
    const config = await getTiktokIntegrationConfig();
    const missing = tiktokMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "TikTok Shop API ist nicht vollständig konfiguriert.",
          missingKeys: missing.map((m) => m.key),
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
      const spanDays = Math.round((currentEndMs - currentStartMs) / TIKTOK_DAY_MS);
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
      currentStartMs = now - days * TIKTOK_DAY_MS;
      currentEndMs = now;
      if (compare) {
        prevStartMs = now - days * 2 * TIKTOK_DAY_MS;
        prevEndMs = now - days * TIKTOK_DAY_MS;
      }
    }

    const allOrders = await fetchTiktokOrdersPaginated(
      config,
      compare
        ? { createdFromMs: prevStartMs, createdToMsExclusive: currentEndMs }
        : { createdFromMs: currentStartMs, createdToMsExclusive: currentEndMs }
    );

    if (compare) {
      const currentRaw = filterOrdersByCreatedRange(allOrders, currentStartMs, currentEndMs);
      const previousRaw = filterOrdersByCreatedRange(allOrders, prevStartMs, prevEndMs);
      const current = summarizeTiktokOrders(currentRaw);
      const previous = summarizeTiktokOrders(previousRaw);
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
        source: "tiktok_orders" as const,
        baseUrl: config.baseUrl,
        ordersPath: config.ordersPath,
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
        items: currentRaw,
        getStatus: (order) => order.status,
        getAmount: (order) => order.amount,
      });
      const previousReturns = sumStatusAmounts({
        items: previousRaw,
        getStatus: (order) => order.status,
        getAmount: (order) => order.amount,
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
          feeSource: currentFee.feeSource,
          returnsSource: currentReturns.returnsSource,
        }),
        previousNetBreakdown: buildNetBreakdown({
          salesAmount: previous.summary.salesAmount,
          returnedAmount: previousReturns.returnedAmount,
          cancelledAmount: previousReturns.cancelledAmount,
          feesAmount: previousFee.feesAmount,
          feeSource: previousFee.feeSource,
          returnsSource: previousReturns.returnsSource,
        }),
        revenueDeltaPct,
        points: current.points,
        previousPoints: previous.points,
      });
    }

    const filtered = filterOrdersByCreatedRange(allOrders, currentStartMs, currentEndMs);
    const current = summarizeTiktokOrders(filtered);
    const meta = {
      days,
      compare: false as const,
      source: "tiktok_orders" as const,
      baseUrl: config.baseUrl,
      ordersPath: config.ordersPath,
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
      items: filtered,
      getStatus: (order) => order.status,
      getAmount: (order) => order.amount,
    });

    return NextResponse.json({
      meta,
      summary: current.summary,
      netBreakdown: buildNetBreakdown({
        salesAmount: current.summary.salesAmount,
        returnedAmount: returns.returnedAmount,
        cancelledAmount: returns.cancelledAmount,
        feesAmount: fee.feesAmount,
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
