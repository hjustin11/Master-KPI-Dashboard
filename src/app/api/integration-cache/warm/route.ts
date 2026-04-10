import { NextResponse } from "next/server";
import { primeAmazonOrdersForYmdRange } from "@/app/api/amazon/orders/route";
import {
  primeAllMarketplaceProductListsForWarm,
  type MarketplaceProductPrimeResult,
} from "@/shared/lib/marketplaceProductCachesPrime";
import { ymdRangeInclusiveDayCountLocal } from "@/shared/lib/orderDateParams";
import { primeMiscMarketplaceOrdersCaches } from "@/shared/lib/marketplaceOrdersCacheWarm";
import { primeXentralIntegrationCaches } from "@/shared/lib/xentralIntegrationCacheWarm";
import {
  FLEX_MARKETPLACE_EBAY_SPEC,
  FLEX_MARKETPLACE_MMS_SPEC,
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
  FLEX_MARKETPLACE_TIKTOK_SPEC,
  FLEX_MARKETPLACE_ZOOPLUS_SPEC,
  type FlexMarketplaceSpec,
  flexMissingKeysForConfig,
  getFlexIntegrationConfig,
  primeFlexOrdersCaches,
} from "@/shared/lib/flexMarketplaceApiClient";

export const maxDuration = 300;

const FLEX_SPECS: FlexMarketplaceSpec[] = [
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
  FLEX_MARKETPLACE_EBAY_SPEC,
  FLEX_MARKETPLACE_TIKTOK_SPEC,
  FLEX_MARKETPLACE_MMS_SPEC,
  FLEX_MARKETPLACE_ZOOPLUS_SPEC,
];

/** Kalendertage inkl. heute — passend zu Dashboard-Datepickern (z. B. 2 = gestern–heute). */
const DEFAULT_WARM_DAY_WINDOWS = [2, 7, 30];

function resolveWarmSecret(): string {
  return (process.env.CRON_SECRET ?? process.env.INTEGRATION_CACHE_WARM_SECRET ?? "").trim();
}

function checkWarmAuth(request: Request, secret: string): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

type WarmResult = {
  id: string;
  skipped?: string;
  windows?: Array<{ days: number; rawCount: number; normalizedCount: number; durationMs: number }>;
  error?: string;
};

async function runFlexMarketplaceWarm(dayWindows: number[]): Promise<WarmResult[]> {
  const results: WarmResult[] = [];

  for (const spec of FLEX_SPECS) {
    const config = await getFlexIntegrationConfig(spec);
    const missing = flexMissingKeysForConfig(config).filter((x) => x.missing);
    if (missing.length > 0) {
      results.push({
        id: spec.id,
        skipped: `missing_keys:${missing.map((m) => m.key).join(",")}`,
      });
      continue;
    }

    const windows: WarmResult["windows"] = [];
    try {
      for (const days of dayWindows) {
        const d = Math.min(Math.max(Math.floor(days), 1), 120);
        const started = Date.now();
        const { fromYmd, toYmd } = ymdRangeInclusiveDayCountLocal(d);
        const { rawCount, normalizedCount } = await primeFlexOrdersCaches(config, {
          fromYmd,
          toYmd,
        });
        windows.push({
          days: d,
          rawCount,
          normalizedCount,
          durationMs: Date.now() - started,
        });
      }
      results.push({ id: spec.id, windows });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id: spec.id, error: msg });
    }
  }

  return results;
}

async function handleWarm(request: Request): Promise<Response> {
  const secret = resolveWarmSecret();
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json(
      {
        error:
          "In Production: CRON_SECRET oder INTEGRATION_CACHE_WARM_SECRET setzen (Vercel hängt CRON_SECRET als Bearer an Cron-Requests).",
      },
      { status: 500 }
    );
  }
  if (!checkWarmAuth(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let dayWindows = [...DEFAULT_WARM_DAY_WINDOWS];
  if (request.method === "POST") {
    try {
      const text = await request.text();
      if (text.trim()) {
        const body = JSON.parse(text) as { dayWindows?: unknown };
        if (Array.isArray(body.dayWindows) && body.dayWindows.length > 0) {
          dayWindows = body.dayWindows
            .map((x) => (typeof x === "number" ? x : Number(x)))
            .filter((n) => Number.isFinite(n) && n > 0);
        }
      }
    } catch {
      /* use defaults */
    }
  }

  if (dayWindows.length === 0) dayWindows = [...DEFAULT_WARM_DAY_WINDOWS];

  const started = Date.now();
  const flex = await runFlexMarketplaceWarm(dayWindows);

  const miscOrdersStarted = Date.now();
  let miscOrders: Awaited<ReturnType<typeof primeMiscMarketplaceOrdersCaches>> & { durationMs: number };
  try {
    const mr = await primeMiscMarketplaceOrdersCaches(dayWindows);
    miscOrders = { ...mr, durationMs: Date.now() - miscOrdersStarted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    miscOrders = { durationMs: Date.now() - miscOrdersStarted, otto: { ok: false, error: msg } };
  }

  const amazonOrdersStarted = Date.now();
  let amazonOrders: { windows: Array<{ days: number; ok: boolean; count?: number; error?: string }>; durationMs: number };
  try {
    const winResults: Array<{ days: number; ok: boolean; count?: number; error?: string }> = [];
    for (const days of dayWindows) {
      const d = Math.min(Math.max(Math.floor(days), 1), 60);
      const { fromYmd, toYmd } = ymdRangeInclusiveDayCountLocal(d);
      const r = await primeAmazonOrdersForYmdRange(fromYmd, toYmd);
      winResults.push({
        days: d,
        ok: r.ok,
        count: r.count,
        error: r.error,
      });
    }
    amazonOrders = { windows: winResults, durationMs: Date.now() - amazonOrdersStarted };
  } catch (e) {
    amazonOrders = {
      windows: [],
      durationMs: Date.now() - amazonOrdersStarted,
    };
  }

  const marketplaceProductsStarted = Date.now();
  let marketplaceProducts: { rows: MarketplaceProductPrimeResult[]; durationMs: number };
  try {
    const rows = await primeAllMarketplaceProductListsForWarm();
    marketplaceProducts = { rows, durationMs: Date.now() - marketplaceProductsStarted };
  } catch {
    marketplaceProducts = { rows: [], durationMs: Date.now() - marketplaceProductsStarted };
  }

  const xentralStarted = Date.now();
  let xentral: Awaited<ReturnType<typeof primeXentralIntegrationCaches>> & { durationMs: number };
  try {
    const xr = await primeXentralIntegrationCaches();
    xentral = { ...xr, durationMs: Date.now() - xentralStarted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    xentral = {
      durationMs: Date.now() - xentralStarted,
      orders: { ok: false, durationMs: 0, recentDays: 90, error: msg },
      articles: { ok: false, durationMs: 0, error: msg },
    };
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    flex,
    miscOrders,
    amazonOrders,
    marketplaceProducts,
    xentral,
    dayWindows,
  });
}

export async function GET(request: Request) {
  try {
    return await handleWarm(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    return await handleWarm(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
