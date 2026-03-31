import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  MAX_ANALYTICS_RANGE_DAYS,
  buildPartialNetBreakdown,
  resolveComparisonPreviousRange,
  type CompareMode,
} from "@/shared/lib/analytics-date-range";
import {
  EBAY_DAY_MS,
  ebayMissingKeysForConfig,
  fetchEbayOrdersPaginated,
  filterOrdersByCreatedRange,
  getEbayIntegrationConfig,
  parseYmdParam,
  summarizeEbayOrders,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/ebayApiClient";

async function writeSyncRecord(args: {
  fromYmd?: string;
  toYmd?: string;
  summary: ReturnType<typeof summarizeEbayOrders>["summary"];
  previousSummary?: ReturnType<typeof summarizeEbayOrders>["summary"];
  points: ReturnType<typeof summarizeEbayOrders>["points"];
  previousPoints?: ReturnType<typeof summarizeEbayOrders>["points"];
  revenueDeltaPct: number | null;
  meta: Record<string, unknown>;
}) {
  if (!args.fromYmd || !args.toYmd) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("ebay_sync")
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
    const config = await getEbayIntegrationConfig();
    const missing = ebayMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "eBay API ist nicht vollständig konfiguriert.",
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
      const spanDays = Math.round((currentEndMs - currentStartMs) / EBAY_DAY_MS);
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
      currentStartMs = now - days * EBAY_DAY_MS;
      currentEndMs = now;
      if (compare) {
        prevStartMs = now - days * 2 * EBAY_DAY_MS;
        prevEndMs = now - days * EBAY_DAY_MS;
      }
    }

    const allOrders = await fetchEbayOrdersPaginated(
      config,
      compare
        ? { createdFromMs: prevStartMs, createdToMsExclusive: currentEndMs }
        : { createdFromMs: currentStartMs, createdToMsExclusive: currentEndMs }
    );

    if (compare) {
      const currentRaw = filterOrdersByCreatedRange(allOrders, currentStartMs, currentEndMs);
      const previousRaw = filterOrdersByCreatedRange(allOrders, prevStartMs, prevEndMs);
      const current = summarizeEbayOrders(currentRaw);
      const previous = summarizeEbayOrders(previousRaw);
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
        source: "ebay_orders" as const,
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

      return NextResponse.json({
        meta,
        summary: current.summary,
        previousSummary: previous.summary,
        netBreakdown: buildPartialNetBreakdown(current.summary.salesAmount),
        previousNetBreakdown: buildPartialNetBreakdown(previous.summary.salesAmount),
        revenueDeltaPct,
        points: current.points,
        previousPoints: previous.points,
      });
    }

    const filtered = filterOrdersByCreatedRange(allOrders, currentStartMs, currentEndMs);
    const current = summarizeEbayOrders(filtered);
    const meta = {
      days,
      compare: false as const,
      source: "ebay_orders" as const,
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

    return NextResponse.json({
      meta,
      summary: current.summary,
      netBreakdown: buildPartialNetBreakdown(current.summary.salesAmount),
      points: current.points,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
