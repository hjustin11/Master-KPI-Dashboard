"use client";

import type { SalesCompareResponseLike } from "./buildMarketplaceReportRowFromCompare";

export type DevReportChannelId =
  | "amazon"
  | "ebay"
  | "otto"
  | "kaufland"
  | "fressnapf"
  | "mediamarkt-saturn"
  | "zooplus"
  | "tiktok"
  | "shopify";

export type CompareModeParam = "previous" | "yoy";

/** YoY hat oft Cache-Hits, kann aber bei Last trotzdem länger dauern. */
export const DEV_REPORT_SALES_FETCH_TIMEOUT_MS_YOY = 120_000;
/** Vorperiode lädt typischerweise schwerer/kalter. */
export const DEV_REPORT_SALES_FETCH_TIMEOUT_MS_PREVIOUS = 180_000;
export const DEV_REPORT_ARTICLE_FETCH_TIMEOUT_MS = 75_000;

export const DEV_REPORT_SALES_CHANNELS: Array<{ id: DevReportChannelId; apiPath: string }> = [
  { id: "amazon", apiPath: "/api/amazon/sales" },
  { id: "ebay", apiPath: "/api/ebay/sales" },
  { id: "otto", apiPath: "/api/otto/sales" },
  { id: "kaufland", apiPath: "/api/kaufland/sales" },
  { id: "fressnapf", apiPath: "/api/fressnapf/sales" },
  { id: "mediamarkt-saturn", apiPath: "/api/mediamarkt-saturn/sales" },
  { id: "zooplus", apiPath: "/api/zooplus/sales" },
  { id: "tiktok", apiPath: "/api/tiktok/sales" },
  { id: "shopify", apiPath: "/api/shopify/sales" },
];

export const DEV_REPORT_ARTICLE_MARKETPLACES: DevReportChannelId[] = [
  "ebay",
  "otto",
  "kaufland",
  "fressnapf",
  "mediamarkt-saturn",
  "zooplus",
  "tiktok",
  "shopify",
];

/** Gleiche Präfixe wie in page.tsx für schnellen localStorage-Warmstart. */
export const DEV_REPORT_ANALYTICS_SALES_CACHE_PREFIX: Record<DevReportChannelId, string> = {
  amazon: "analytics_amazon_sales_compare_v1",
  ebay: "analytics_ebay_sales_compare_v1",
  otto: "analytics_otto_sales_compare_v1",
  kaufland: "analytics_kaufland_sales_compare_v1",
  fressnapf: "analytics_fressnapf_sales_compare_v1",
  "mediamarkt-saturn": "analytics_mms_sales_compare_v1",
  zooplus: "analytics_zooplus_sales_compare_v1",
  tiktok: "analytics_tiktok_sales_compare_v1",
  shopify: "analytics_shopify_sales_compare_v1",
};

export function salesCompareCacheKey(id: DevReportChannelId, from: string, to: string): string {
  return `${DEV_REPORT_ANALYTICS_SALES_CACHE_PREFIX[id]}:${from}:${to}`;
}

export function devReportSalesLocalStorageKey(
  id: DevReportChannelId,
  from: string,
  to: string,
  mode: CompareModeParam
): string {
  const base = salesCompareCacheKey(id, from, to);
  return mode === "previous" ? `${base}:devReport_previous` : base;
}

export function parseCachedAnalyticsSalesCompare(raw: unknown): SalesCompareResponseLike | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.error === "string" && o.error.length > 0) return null;
  const summary = o.summary;
  if (!summary || typeof summary !== "object") return null;
  const { savedAt: _, ...rest } = o;
  return rest as SalesCompareResponseLike;
}

function timeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as unknown as { timeout?: (n: number) => AbortSignal };
  if (typeof AS.timeout === "function") return AS.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export async function fetchDevReportSalesCompareWithTimeout(args: {
  apiPath: string;
  from: string;
  to: string;
  compareMode: CompareModeParam;
  timeoutMs: number;
}): Promise<SalesCompareResponseLike & { error?: string }> {
  const params = new URLSearchParams({
    compare: "true",
    compareMode: args.compareMode,
    from: args.from,
    to: args.to,
  });
  try {
    const res = await fetch(`${args.apiPath}?${params}`, {
      cache: "no-store",
      signal: timeoutSignal(args.timeoutMs),
    });
    const payload = (await res.json()) as SalesCompareResponseLike & { error?: string };
    if (!res.ok) return { ...payload, error: payload.error ?? `HTTP ${String(res.status)}` };
    return payload;
  } catch (e) {
    if (isAbortError(e)) return { error: "__FETCH_TIMEOUT__" };
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function fetchMarketplaceArticleSalesWithTimeout(args: {
  marketplace: string;
  from: string;
  to: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const params = new URLSearchParams({
    marketplace: args.marketplace,
    from: args.from,
    to: args.to,
  });
  try {
    const res = await fetch(`/api/analytics/marketplace-article-sales?${params}`, {
      cache: "no-store",
      signal: timeoutSignal(args.timeoutMs),
    });
    const data = (await res.json().catch(() => ({}))) as unknown;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (isAbortError(e)) return { ok: false, status: 0, data: { error: "__FETCH_TIMEOUT__" } };
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : "Network error" } };
  }
}

/** Führt Worker mit begrenzter Parallelität aus, damit Timeouts nicht durch Browser-Queue entstehen. */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const max = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  const runners = Array.from({ length: max }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}
