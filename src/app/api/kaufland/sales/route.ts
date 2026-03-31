import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  MAX_ANALYTICS_RANGE_DAYS,
  resolveComparisonPreviousRange,
  type CompareMode,
} from "@/shared/lib/analytics-date-range";
import {
  KAUFLAND_DAY_MS,
  centsToAmount,
  fetchKauflandOrderUnitsAllStatuses,
  filterOrderUnitsByCreatedRange,
  getKauflandIntegrationConfig,
  parseYmdParam,
  ymdToUtcRangeExclusiveEnd,
  type KauflandOrderUnit,
} from "@/shared/lib/kauflandApiClient";
import {
  buildNetBreakdown,
  estimateMarketplaceFeeAmount,
  getMarketplaceFeePolicy,
  sumStatusAmounts,
} from "@/shared/lib/marketplace-profitability";

type KauflandSalesPoint = {
  date: string;
  orders: number;
  amount: number;
  units: number;
};

type KauflandSummary = {
  orderCount: number;
  salesAmount: number;
  units: number;
  currency: string;
};

function isoDate(value: string) {
  return value.slice(0, 10);
}

function summarizeUnits(units: KauflandOrderUnit[]): { summary: KauflandSummary; points: KauflandSalesPoint[] } {
  const pointsMap = new Map<
    string,
    { date: string; orderIds: Set<string>; amount: number; units: number }
  >();
  const allOrderIds = new Set<string>();
  let totalAmount = 0;

  for (const u of units) {
    const raw = u.ts_created_iso;
    if (!raw) continue;
    const ymd = isoDate(raw);
    const oid = typeof u.id_order === "string" ? u.id_order.trim() : "";
    if (oid) allOrderIds.add(oid);

    const cents =
      typeof u.price === "number"
        ? u.price
        : typeof u.revenue_gross === "number"
          ? u.revenue_gross
          : 0;
    const amt = centsToAmount(cents);
    totalAmount += amt;

    const prev = pointsMap.get(ymd) ?? {
      date: ymd,
      orderIds: new Set<string>(),
      amount: 0,
      units: 0,
    };
    prev.units += 1;
    prev.amount = Number((prev.amount + amt).toFixed(2));
    if (oid) prev.orderIds.add(oid);
    pointsMap.set(ymd, prev);
  }

  const points: KauflandSalesPoint[] = Array.from(pointsMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date,
      orders: p.orderIds.size,
      amount: p.amount,
      units: p.units,
    }));

  return {
    summary: {
      orderCount: allOrderIds.size,
      salesAmount: Number(totalAmount.toFixed(2)),
      units: units.length,
      currency: "EUR",
    },
    points,
  };
}

async function writeSyncRecord(args: {
  fromYmd?: string;
  toYmd?: string;
  summary: KauflandSummary;
  previousSummary?: KauflandSummary;
  points: KauflandSalesPoint[];
  previousPoints?: KauflandSalesPoint[];
  revenueDeltaPct: number | null;
  meta: Record<string, unknown>;
}) {
  if (!args.fromYmd || !args.toYmd) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("kaufland_sync")
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
    const feePolicy = await getMarketplaceFeePolicy("kaufland");
    const config = await getKauflandIntegrationConfig();
    const missing = {
      KAUFLAND_CLIENT_KEY: !config.clientKey,
      KAUFLAND_SECRET_KEY: !config.secretKey,
    };
    if (Object.values(missing).some(Boolean)) {
      return NextResponse.json(
        {
          error: "Kaufland API ist nicht vollständig konfiguriert.",
          missingKeys: Object.entries(missing).filter(([, v]) => v).map(([k]) => k),
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
      const spanDays = Math.round((currentEndMs - currentStartMs) / KAUFLAND_DAY_MS);
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
      currentStartMs = now - days * KAUFLAND_DAY_MS;
      currentEndMs = now;
      if (compare) {
        prevStartMs = now - days * 2 * KAUFLAND_DAY_MS;
        prevEndMs = now - days * KAUFLAND_DAY_MS;
      }
    }

    const allUnits = await fetchKauflandOrderUnitsAllStatuses({ config });

    const filterRange = (start: number, end: number) =>
      filterOrderUnitsByCreatedRange(allUnits, start, end);

    if (compare) {
      const currentUnits = filterRange(currentStartMs, currentEndMs);
      const previousUnits = filterRange(prevStartMs, prevEndMs);
      const current = summarizeUnits(currentUnits);
      const previous = summarizeUnits(previousUnits);
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
        source: "order_units_v2" as const,
        baseUrl: config.baseUrl,
        storefront: config.storefront,
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
        items: currentUnits,
        getStatus: (unit) => unit.status,
        getAmount: (unit) => centsToAmount(typeof unit.price === "number" ? unit.price : unit.revenue_gross),
      });
      const previousReturns = sumStatusAmounts({
        items: previousUnits,
        getStatus: (unit) => unit.status,
        getAmount: (unit) => centsToAmount(typeof unit.price === "number" ? unit.price : unit.revenue_gross),
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

    const units = filterRange(currentStartMs, currentEndMs);
    const current = summarizeUnits(units);
    const meta = {
      days,
      compare: false as const,
      source: "order_units_v2" as const,
      baseUrl: config.baseUrl,
      storefront: config.storefront,
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
      items: units,
      getStatus: (unit) => unit.status,
      getAmount: (unit) => centsToAmount(typeof unit.price === "number" ? unit.price : unit.revenue_gross),
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
