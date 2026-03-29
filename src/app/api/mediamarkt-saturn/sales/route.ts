import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  MMS_DAY_MS,
  fetchMmsOrdersPaginated,
  filterOrdersByCreatedRange,
  getMmsIntegrationConfig,
  mmsMissingKeysForConfig,
  parseYmdParam,
  summarizeMmsOrders,
  ymdToUtcRangeExclusiveEnd,
} from "@/shared/lib/mmsApiClient";

async function writeSyncRecord(args: {
  fromYmd?: string;
  toYmd?: string;
  summary: ReturnType<typeof summarizeMmsOrders>["summary"];
  previousSummary?: ReturnType<typeof summarizeMmsOrders>["summary"];
  points: ReturnType<typeof summarizeMmsOrders>["points"];
  previousPoints?: ReturnType<typeof summarizeMmsOrders>["points"];
  revenueDeltaPct: number | null;
  meta: Record<string, unknown>;
}) {
  if (!args.fromYmd || !args.toYmd) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("mms_sync")
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
    const config = await getMmsIntegrationConfig();
    const missing = mmsMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "MediaMarkt & Saturn API ist nicht vollständig konfiguriert.",
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
      const spanDays = Math.round((currentEndMs - currentStartMs) / MMS_DAY_MS);
      if (spanDays < 1 || spanDays > 60) {
        return NextResponse.json({ error: "Zeitraum muss 1–60 Tage umfassen." }, { status: 400 });
      }
      days = spanDays;
      rangeFromLabel = fromYmd;
      rangeToLabel = toYmd;
      if (compare) {
        const len = currentEndMs - currentStartMs;
        prevEndMs = currentStartMs;
        prevStartMs = currentStartMs - len;
      }
    } else {
      days = Math.min(Math.max(Number(searchParams.get("days") ?? "7") || 7, 1), 60);
      currentStartMs = now - days * MMS_DAY_MS;
      currentEndMs = now;
      if (compare) {
        prevStartMs = now - days * 2 * MMS_DAY_MS;
        prevEndMs = now - days * MMS_DAY_MS;
      }
    }

    const allOrders = await fetchMmsOrdersPaginated(
      config,
      compare
        ? { createdFromMs: prevStartMs, createdToMsExclusive: currentEndMs }
        : { createdFromMs: currentStartMs, createdToMsExclusive: currentEndMs }
    );

    if (compare) {
      const currentRaw = filterOrdersByCreatedRange(allOrders, currentStartMs, currentEndMs);
      const previousRaw = filterOrdersByCreatedRange(allOrders, prevStartMs, prevEndMs);
      const current = summarizeMmsOrders(currentRaw);
      const previous = summarizeMmsOrders(previousRaw);
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
        source: "mms_orders" as const,
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
        revenueDeltaPct,
        points: current.points,
        previousPoints: previous.points,
      });
    }

    const filtered = filterOrdersByCreatedRange(allOrders, currentStartMs, currentEndMs);
    const current = summarizeMmsOrders(filtered);
    const meta = {
      days,
      compare: false as const,
      source: "mms_orders" as const,
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
      points: current.points,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
