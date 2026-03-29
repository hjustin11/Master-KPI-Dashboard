import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  cacheExclusiveEndYmd,
  DELIVERY_SALES_ANCHOR_YMD,
  liveWindowStartYmd,
  loadDeliverySalesCacheFile,
  resolveDeliverySalesCachePath,
  resolveLiveWindowDays,
  resolveSyncPagesPerRun,
  syncDeliverySalesCacheStep,
} from "@/shared/lib/xentralDeliverySalesCache";
import { fetchXentralProjectByIdLookup } from "@/shared/lib/xentralProjectLookup";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

async function getSupabaseSecret(key: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return "";
  return ((data?.value as string | undefined) ?? "").trim();
}

async function resolveXentralConfig() {
  const baseUrl = env("XENTRAL_BASE_URL") || (await getSupabaseSecret("XENTRAL_BASE_URL"));
  const token =
    env("XENTRAL_PAT") ||
    env("XENTRAL_KEY") ||
    (await getSupabaseSecret("XENTRAL_PAT")) ||
    (await getSupabaseSecret("XENTRAL_KEY"));
  return { baseUrl, token };
}

function checkSyncAuth(request: Request): boolean {
  const secret = (process.env.XENTRAL_DELIVERY_SALES_SYNC_SECRET ?? "").trim();
  if (!secret) return true;
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

  let body: { reset?: boolean; maxPages?: number } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  const projectById = await fetchXentralProjectByIdLookup({ baseUrl, token });
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
