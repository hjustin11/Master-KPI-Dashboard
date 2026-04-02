import { NextResponse } from "next/server";
import { primeAmazonProductsIntegrationCache } from "@/shared/lib/amazonProductsSpApiCatalog";
import { primeXentralIntegrationCaches } from "@/shared/lib/xentralIntegrationCacheWarm";
import {
  FLEX_DAY_MS,
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

/** Häufige Analytics-Zeiträume — je Spezifikation zwei Cache-Keys. */
const DEFAULT_WARM_DAY_WINDOWS = [7, 30];

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
  const now = Date.now();
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
        const span = d * FLEX_DAY_MS;
        const { rawCount, normalizedCount } = await primeFlexOrdersCaches(config, {
          createdFromMs: now - span,
          createdToMsExclusive: now,
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

  const amazonStarted = Date.now();
  let amazon: Awaited<ReturnType<typeof primeAmazonProductsIntegrationCache>> & { durationMs: number };
  try {
    const ar = await primeAmazonProductsIntegrationCache();
    amazon = { ...ar, durationMs: Date.now() - amazonStarted };
  } catch (e) {
    amazon = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - amazonStarted,
    };
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
    amazon,
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
