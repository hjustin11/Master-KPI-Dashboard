import { NextResponse } from "next/server";
import {
  buildXentralOrdersCacheKey,
  computeXentralOrdersPayload,
  XentralOrdersPayloadError,
  xentralOrdersCacheFreshMs,
  xentralOrdersCacheStaleMs,
} from "@/shared/lib/xentralOrdersPayload";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import {
  aggregateSkuSalesWithFileCache,
  berlinCalendarYmdNow,
  cacheExclusiveEndYmd,
  DELIVERY_SALES_ANCHOR_YMD,
  liveWindowStartYmd,
  loadDeliverySalesCacheFile,
  resolveDeliverySalesCachePath,
  resolveLiveWindowDays,
  resolveSyncPagesPerRun,
  subtractCalendarDaysFromYmd,
  syncDeliverySalesCacheStep,
} from "@/shared/lib/xentralDeliverySalesCache";
import { fetchXentralProjectByIdLookup } from "@/shared/lib/xentralProjectLookup";
import { warmProcurementLinesCache } from "@/shared/lib/procurement/procurementLinesPayload";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

async function resolveXentralConfig() {
  const baseUrl = await getIntegrationSecretValue("XENTRAL_BASE_URL");
  const token =
    (await getIntegrationSecretValue("XENTRAL_PAT")) || (await getIntegrationSecretValue("XENTRAL_KEY"));
  return { baseUrl, token };
}

function checkSyncAuth(request: Request): boolean {
  const secret = (process.env.XENTRAL_DELIVERY_SALES_SYNC_SECRET ?? "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET() {
  const cache = await loadDeliverySalesCacheFile();
  const dayKeys = Object.keys(cache.days);
  return NextResponse.json({
    path: resolveDeliverySalesCachePath(),
    anchorYmd: DELIVERY_SALES_ANCHOR_YMD,
    liveWindowDays: resolveLiveWindowDays(),
    liveWindowStartYmd: liveWindowStartYmd(),
    cacheExclusiveEndYmd: cacheExclusiveEndYmd(),
    dayCount: dayKeys.length,
    sync: cache.sync,
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !env("XENTRAL_DELIVERY_SALES_SYNC_SECRET")) {
    return NextResponse.json(
      { error: "XENTRAL_DELIVERY_SALES_SYNC_SECRET ist in Production erforderlich." },
      { status: 500 }
    );
  }
  if (!checkSyncAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { baseUrl, token } = await resolveXentralConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Xentral nicht konfiguriert (BASE_URL / PAT)." },
      { status: 500 }
    );
  }

  let body: {
    reset?: boolean;
    maxPages?: number;
    prewarm?: boolean;
    prewarmWindows?: number[];
    /** Default: true bei `prewarm` — Bestellungen-API in `integration_data_cache` füllen. */
    prewarmOrders?: boolean;
    /** Default: true bei `prewarm` — Beschaffung (`procurement:lines`) wärmen. */
    prewarmProcurement?: boolean;
    toYmd?: string;
    pageSize?: number;
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  const projectById = await fetchXentralProjectByIdLookup({ baseUrl, token });

  if (body.prewarm) {
    const windows = Array.from(
      new Set(
        (Array.isArray(body.prewarmWindows) ? body.prewarmWindows : [30, 60, 90])
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 7 && n <= 366)
          .map((n) => Math.floor(n))
      )
    ).sort((a, b) => a - b);
    const toYmd = /^\d{4}-\d{2}-\d{2}$/.test(body.toYmd ?? "") ? (body.toYmd as string) : berlinCalendarYmdNow();
    const pageSize =
      typeof body.pageSize === "number" && Number.isFinite(body.pageSize) && body.pageSize >= 10 && body.pageSize <= 200
        ? Math.floor(body.pageSize)
        : 50;

    const results: Array<{
      windowDays: number;
      fromYmd: string;
      toYmd: string;
      skuCount: number;
      durationMs: number;
      pagesFetched: number;
      cacheDaysUsed: number;
      liveWindowFromYmd?: string;
      liveWindowToYmd?: string;
      hitSalesPageCap?: boolean;
      stoppedEarly?: boolean;
      listOk?: boolean;
      listStatus?: number;
    }> = [];

    for (const days of windows) {
      const fromYmd = subtractCalendarDaysFromYmd(toYmd, days - 1);
      const startedAt = Date.now();
      const agg = await aggregateSkuSalesWithFileCache({
        baseUrl,
        token,
        projectById,
        fromYmd,
        toYmd,
        pageSize,
      });
      const durationMs = Date.now() - startedAt;
      results.push({
        windowDays: days,
        fromYmd,
        toYmd,
        skuCount: agg.bySku.size,
        durationMs,
        pagesFetched: agg.meta.pagesFetched,
        cacheDaysUsed: agg.meta.cacheDaysUsed ?? 0,
        liveWindowFromYmd: agg.meta.liveWindowFromYmd,
        liveWindowToYmd: agg.meta.liveWindowToYmd,
        hitSalesPageCap: agg.meta.hitSalesPageCap,
        stoppedEarly: agg.meta.stoppedEarly,
        listOk: agg.meta.listOk,
        listStatus: agg.meta.listStatus,
      });
    }

    let ordersPrewarm: { ok: boolean; durationMs?: number; error?: string } = { ok: false };
    if (body.prewarmOrders !== false) {
      const started = Date.now();
      const ordersUrl = new URL("http://internal/xentral/orders");
      ordersUrl.searchParams.set("recentDays", "90");
      ordersUrl.searchParams.set("limit", "50");
      const ordersReq = new Request(ordersUrl);
      try {
        await getIntegrationCachedOrLoad({
          cacheKey: buildXentralOrdersCacheKey(ordersUrl.searchParams),
          source: "xentral:orders",
          freshMs: xentralOrdersCacheFreshMs(),
          staleMs: xentralOrdersCacheStaleMs(),
          loader: () => computeXentralOrdersPayload(ordersReq, baseUrl, token),
        });
        ordersPrewarm = { ok: true, durationMs: Date.now() - started };
      } catch (e) {
        const msg =
          e instanceof XentralOrdersPayloadError
            ? String((e.body as { error?: string }).error ?? e.message)
            : e instanceof Error
              ? e.message
              : String(e);
        ordersPrewarm = { ok: false, durationMs: Date.now() - started, error: msg };
      }
    }

    let procurementPrewarm: {
      ok: boolean;
      skipped?: boolean;
      importId?: string;
      durationMs?: number;
      error?: string;
    } = { ok: false };
    if (body.prewarmProcurement !== false) {
      const started = Date.now();
      const pr = await warmProcurementLinesCache();
      procurementPrewarm = {
        ok: pr.ok,
        skipped: pr.skipped,
        importId: pr.importId,
        durationMs: Date.now() - started,
        error: pr.error,
      };
    }

    return NextResponse.json({
      ok: true,
      prewarm: true,
      anchorYmd: DELIVERY_SALES_ANCHOR_YMD,
      liveWindowStartYmd: liveWindowStartYmd(),
      cacheExclusiveEndYmd: cacheExclusiveEndYmd(),
      windows: results,
      ordersPrewarm,
      procurementPrewarm,
    });
  }

  const result = await syncDeliverySalesCacheStep({
    baseUrl,
    token,
    projectById,
    reset: Boolean(body.reset),
    maxPages:
      typeof body.maxPages === "number" && body.maxPages > 0
        ? Math.min(200, Math.floor(body.maxPages))
        : resolveSyncPagesPerRun(),
  });

  const status = result.ok ? 200 : 502;
  return NextResponse.json(result, { status });
}
