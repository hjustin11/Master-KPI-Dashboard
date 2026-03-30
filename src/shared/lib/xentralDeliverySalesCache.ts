/**
 * Lokaler Datei-Cache: Lieferschein-Verkäufe pro Kalendertag (Europe/Berlin).
 * - Historie ab {@link DELIVERY_SALES_ANCHOR_YMD} bis (live-Fenster − 1 Tag) aus Datei
 * - Letzte N Kalendertage inkl. heute live von Xentral
 *
 * Pfad: XENTRAL_DELIVERY_SALES_CACHE_PATH oder ./data/xentral-delivery-sales-cache.json
 * Hinweis: Auf serverless (Vercel) ist das Dateisystem flüchtig — für Produktion ggf. Blob/DB.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { consolidateArticleForecastSoldByProject } from "@/shared/lib/xentralArticleForecastProject";
import {
  aggregateSkuSalesInBerlinWindow,
  candidatesFromPayload,
  extractDeliveryNoteYmdFromItem,
  extractSalesLinesFromDeliveryNotesPage,
  fetchFirstV1DeliveryNotesPage,
  fetchV3DeliveryNotesPage,
  fetchV1DeliveryNotesPage,
  type SkuSalesWindowAggregationMeta,
  type SkuSalesWindowAggregationResult,
  v3LastPageFromPayload,
} from "@/shared/lib/xentralSkuSalesWindowAggregation";

export const DELIVERY_SALES_CACHE_VERSION = 1 as const;
export const DELIVERY_SALES_ANCHOR_YMD = "2024-01-01";

export type DeliverySalesSyncStateV1 = {
  source: "idle" | "v3" | "v1";
  v3NextPage: number;
  v1NextPage: number;
  v1ApiPath: string;
  v1SortField: string | null;
  backfillComplete: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type DeliverySalesCacheFileV1 = {
  version: 1;
  days: Record<string, Record<string, Record<string, number>>>;
  sync: DeliverySalesSyncStateV1;
};

function defaultSyncState(): DeliverySalesSyncStateV1 {
  return {
    source: "idle",
    v3NextPage: 1,
    v1NextPage: 1,
    v1ApiPath: "api/v1/deliveryNotes",
    v1SortField: "documentDate",
    backfillComplete: false,
    lastSyncedAt: null,
    lastError: null,
  };
}

function emptyCache(): DeliverySalesCacheFileV1 {
  return { version: 1, days: {}, sync: defaultSyncState() };
}

export function resolveDeliverySalesCachePath(): string {
  const raw = (process.env.XENTRAL_DELIVERY_SALES_CACHE_PATH ?? "").trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  return path.join(process.cwd(), "data", "xentral-delivery-sales-cache.json");
}

export function resolveLiveWindowDays(): number {
  const n = Number(process.env.XENTRAL_DELIVERY_SALES_LIVE_DAYS);
  return Number.isFinite(n) && n >= 7 && n <= 120 ? Math.floor(n) : 60;
}

export function berlinCalendarYmdNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

export function subtractCalendarDaysFromYmd(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]);
  let left = days;
  while (left > 0) {
    d -= 1;
    if (d < 1) {
      mo -= 1;
      if (mo < 1) {
        mo = 12;
        y -= 1;
      }
      d = new Date(y, mo, 0).getDate();
    }
    left -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function liveWindowStartYmd(): string {
  const days = resolveLiveWindowDays();
  return subtractCalendarDaysFromYmd(berlinCalendarYmdNow(), days - 1);
}

export function cacheExclusiveEndYmd(): string {
  return subtractCalendarDaysFromYmd(liveWindowStartYmd(), 1);
}

export async function loadDeliverySalesCacheFile(): Promise<DeliverySalesCacheFileV1> {
  const p = resolveDeliverySalesCachePath();
  try {
    const raw = await readFile(p, "utf8");
    const j = JSON.parse(raw) as DeliverySalesCacheFileV1;
    if (j?.version !== 1 || typeof j.days !== "object" || !j.sync) {
      return emptyCache();
    }
    return {
      version: 1,
      days: j.days ?? {},
      sync: { ...defaultSyncState(), ...j.sync },
    };
  } catch {
    return emptyCache();
  }
}

export async function saveDeliverySalesCacheFile(data: DeliverySalesCacheFileV1): Promise<void> {
  const p = resolveDeliverySalesCachePath();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(data, null, 0)}\n`, "utf8");
}

function applyLineToCache(
  days: DeliverySalesCacheFileV1["days"],
  ymd: string,
  skuKey: string,
  project: string,
  qty: number
) {
  if (!days[ymd]) days[ymd] = {};
  if (!days[ymd][skuKey]) days[ymd][skuKey] = {};
  days[ymd][skuKey][project] = (days[ymd][skuKey][project] ?? 0) + qty;
}

export function sumCachedSalesRange(
  cache: DeliverySalesCacheFileV1,
  fromYmd: string,
  toYmd: string
): Map<string, { soldByProject: Record<string, number> }> {
  const bySku = new Map<string, { soldByProject: Record<string, number> }>();
  for (const [ymd, bucket] of Object.entries(cache.days)) {
    if (ymd < fromYmd || ymd > toYmd) continue;
    for (const [skuKey, projects] of Object.entries(bucket)) {
      let rec = bySku.get(skuKey);
      if (!rec) {
        rec = { soldByProject: {} };
        bySku.set(skuKey, rec);
      }
      for (const [plabel, q] of Object.entries(projects)) {
        rec.soldByProject[plabel] = (rec.soldByProject[plabel] ?? 0) + q;
      }
    }
  }
  return bySku;
}

function mergeSkuMaps(
  dest: Map<string, { soldByProject: Record<string, number> }>,
  src: Map<string, { soldByProject: Record<string, number>; totalSold: number }>
) {
  for (const [sku, v] of src) {
    let rec = dest.get(sku);
    if (!rec) {
      rec = { soldByProject: {} };
      dest.set(sku, rec);
    }
    for (const [p, q] of Object.entries(v.soldByProject)) {
      rec.soldByProject[p] = (rec.soldByProject[p] ?? 0) + q;
    }
  }
}

function finalizeBySku(
  raw: Map<string, { soldByProject: Record<string, number> }>
): Map<string, { soldByProject: Record<string, number>; totalSold: number }> {
  const out = new Map<string, { soldByProject: Record<string, number>; totalSold: number }>();
  for (const [sku, rec] of raw) {
    const soldByProject = consolidateArticleForecastSoldByProject(rec.soldByProject);
    const totalSold = Object.values(soldByProject).reduce((s, n) => s + n, 0);
    out.set(sku, { soldByProject, totalSold });
  }
  return out;
}

function countCacheDaysInRange(cache: DeliverySalesCacheFileV1, fromYmd: string, toYmd: string): number {
  return Object.keys(cache.days).filter((d) => d >= fromYmd && d <= toYmd).length;
}

/**
 * Bedarfsprognose: ältere Tage aus Datei, Schnitt [from,to] ∩ [ANCHOR, cacheEnd];
 * Live [liveStart, min(to,today)] von Xentral.
 */
export async function aggregateSkuSalesWithFileCache(args: {
  baseUrl: string;
  token: string;
  projectById: Map<string, string>;
  fromYmd: string;
  toYmd: string;
  pageSize?: number;
}): Promise<SkuSalesWindowAggregationResult> {
  if (process.env.XENTRAL_DELIVERY_SALES_CACHE_DISABLE === "1") {
    return aggregateSkuSalesInBerlinWindow(args);
  }

  const { baseUrl, token, projectById, fromYmd, toYmd } = args;
  const liveStart = liveWindowStartYmd();
  const cacheEnd = cacheExclusiveEndYmd();
  const today = berlinCalendarYmdNow();
  const toCap = toYmd > today ? today : toYmd;

  const cache = await loadDeliverySalesCacheFile();

  const cacheTo = toCap <= cacheEnd ? toCap : cacheEnd;
  const useCache = fromYmd <= cacheTo && cacheTo >= DELIVERY_SALES_ANCHOR_YMD;
  const effectiveCacheFrom = useCache
    ? (fromYmd < DELIVERY_SALES_ANCHOR_YMD ? DELIVERY_SALES_ANCHOR_YMD : fromYmd)
    : null;
  const effectiveCacheTo = useCache ? cacheTo : null;

  const useLive = toCap >= liveStart;
  const liveFrom = useLive ? (fromYmd > liveStart ? fromYmd : liveStart) : null;
  const liveTo = useLive ? toCap : null;
  const useLiveFetch = liveFrom != null && liveTo != null && liveFrom <= liveTo;

  const mergedRaw = new Map<string, { soldByProject: Record<string, number> }>();

  let cacheDaysUsed = 0;
  if (effectiveCacheFrom && effectiveCacheTo) {
    const slice = sumCachedSalesRange(cache, effectiveCacheFrom, effectiveCacheTo);
    for (const [sku, rec] of slice) {
      mergedRaw.set(sku, { soldByProject: { ...rec.soldByProject } });
    }
    cacheDaysUsed = countCacheDaysInRange(cache, effectiveCacheFrom, effectiveCacheTo);
  }

  let liveResult: SkuSalesWindowAggregationResult | null = null;
  if (useLiveFetch && liveFrom && liveTo) {
    liveResult = await aggregateSkuSalesInBerlinWindow({
      baseUrl,
      token,
      projectById,
      fromYmd: liveFrom,
      toYmd: liveTo,
      pageSize: args.pageSize,
    });
    mergeSkuMaps(mergedRaw, liveResult.bySku);
  }

  const bySku = finalizeBySku(mergedRaw);

  const meta: SkuSalesWindowAggregationMeta = liveResult
    ? {
        ...liveResult.meta,
        deliveryNotesInWindow: liveResult.meta.deliveryNotesInWindow,
        cacheDaysUsed,
        liveWindowFromYmd: liveFrom ?? undefined,
        liveWindowToYmd: liveTo ?? undefined,
      }
    : {
        deliveryNotesInWindow: 0,
        lineItemsParsed: 0,
        pagesFetched: 0,
        stoppedEarly: false,
        hitSalesPageCap: false,
        listOk: true,
        source: "v3_delivery_notes",
        cacheDaysUsed,
        liveWindowFromYmd: undefined,
        liveWindowToYmd: undefined,
      };

  return { bySku, meta };
}

export function resolveSyncPagesPerRun(): number {
  const n = Number(process.env.XENTRAL_DELIVERY_SALES_SYNC_PAGES_PER_RUN);
  return Number.isFinite(n) && n >= 1 && n <= 200 ? Math.floor(n) : 8;
}

export function resolveSyncPageSize(): number {
  const n = Number(process.env.XENTRAL_DELIVERY_SALES_SYNC_PAGE_SIZE);
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.floor(n) : 50;
}

/**
 * Ein Schritt: bis zu `maxPages` Lieferschein-Seiten laden und in den Cache schreiben (nur ANCHOR ≤ Belegdatum &lt; liveStart).
 */
export async function syncDeliverySalesCacheStep(args: {
  baseUrl: string;
  token: string;
  projectById: Map<string, string>;
  maxPages?: number;
  /** Cache leeren und Sync neu starten */
  reset?: boolean;
}): Promise<{
  ok: boolean;
  pagesFetched: number;
  linesWritten: number;
  backfillComplete: boolean;
  source: string;
  nextPage?: number;
  skipped?: boolean;
  error?: string;
}> {
  const maxPages = args.maxPages ?? resolveSyncPagesPerRun();
  const pageSize = resolveSyncPageSize();
  const cache = args.reset ? emptyCache() : await loadDeliverySalesCacheFile();

  if (cache.sync.backfillComplete && !args.reset) {
    return {
      ok: true,
      pagesFetched: 0,
      linesWritten: 0,
      backfillComplete: true,
      source: cache.sync.source,
      nextPage: cache.sync.v3NextPage,
      skipped: true,
    };
  }
  const liveStart = liveWindowStartYmd();
  const anchor = DELIVERY_SALES_ANCHOR_YMD;
  let linesWritten = 0;
  let pagesFetched = 0;

  const ingestPage = (payload: unknown, source: "v3" | "v1") => {
    const lines = extractSalesLinesFromDeliveryNotesPage(payload, args.projectById, source);
    for (const line of lines) {
      if (line.ymd < anchor || line.ymd >= liveStart) continue;
      applyLineToCache(cache.days, line.ymd, line.skuKey, line.marketplaceLabel, line.quantity);
      linesWritten += 1;
    }
  };

  try {
    const v3Probe = await fetchV3DeliveryNotesPage({
      baseUrl: args.baseUrl,
      token: args.token,
      page: 1,
      perPage: pageSize,
    });

    const useV3 =
      v3Probe.res.ok &&
      v3Probe.json &&
      v3Probe.res.status !== 401 &&
      v3Probe.res.status !== 403;

    if (useV3) {
      cache.sync.source = "v3";
      if (args.reset) {
        cache.sync.v3NextPage = 1;
        cache.sync.backfillComplete = false;
      }

      let page = Math.max(1, cache.sync.v3NextPage);
      const hardCap = 2000;

      for (let i = 0; i < maxPages; i += 1) {
        const res =
          page === 1 && i === 0
            ? v3Probe
            : await fetchV3DeliveryNotesPage({
                baseUrl: args.baseUrl,
                token: args.token,
                page,
                perPage: pageSize,
              });

        if (!res.res.ok || !res.json) {
          cache.sync.lastError = `v3 HTTP ${res.res.status}`;
          break;
        }

        ingestPage(res.json, "v3");
        pagesFetched += 1;

        const batch = candidatesFromPayload(res.json);
        if (!batch.length) {
          cache.sync.backfillComplete = true;
          cache.sync.v3NextPage = 1;
          break;
        }

        const allBeforeAnchor = batch.every((item) => {
          const ymd = extractDeliveryNoteYmdFromItem(item);
          return ymd == null || ymd < anchor;
        });
        if (allBeforeAnchor) {
          cache.sync.backfillComplete = true;
          cache.sync.v3NextPage = 1;
          break;
        }

        const lastPage = v3LastPageFromPayload(res.json);
        if (lastPage != null && page >= lastPage) {
          cache.sync.backfillComplete = true;
          cache.sync.v3NextPage = 1;
          break;
        }
        if (page >= hardCap) {
          cache.sync.v3NextPage = page + 1;
          break;
        }

        page += 1;
        cache.sync.v3NextPage = page;
      }

      cache.sync.lastSyncedAt = new Date().toISOString();
      if (!cache.sync.lastError) cache.sync.lastError = null;
      await saveDeliverySalesCacheFile(cache);
      return {
        ok: true,
        pagesFetched,
        linesWritten,
        backfillComplete: cache.sync.backfillComplete,
        source: "v3",
        nextPage: cache.sync.v3NextPage,
      };
    }

    const { first, apiPath, sortField } = await fetchFirstV1DeliveryNotesPage({
      baseUrl: args.baseUrl,
      token: args.token,
      pageNumber: 1,
      pageSize,
    });

    if (!first.res.ok || !first.json) {
      return {
        ok: false,
        pagesFetched: 0,
        linesWritten: 0,
        backfillComplete: false,
        source: "v1",
        error: `v1 first page failed HTTP ${first.res.status}`,
      };
    }

    cache.sync.source = "v1";
    cache.sync.v1ApiPath = apiPath;
    cache.sync.v1SortField = sortField;
    if (args.reset) {
      cache.sync.v1NextPage = 1;
      cache.sync.backfillComplete = false;
    }

    let page = Math.max(1, cache.sync.v1NextPage);

    for (let i = 0; i < maxPages; i += 1) {
      const res =
        page === 1 && i === 0
          ? first
          : await fetchV1DeliveryNotesPage({
              baseUrl: args.baseUrl,
              token: args.token,
              apiPath,
              page,
              pageSize,
              sortField,
            });

      if (!res.res.ok || !res.json) {
        cache.sync.lastError = `v1 HTTP ${res.res.status}`;
        break;
      }

      ingestPage(res.json, "v1");
      pagesFetched += 1;

      const batch = candidatesFromPayload(res.json);
      if (!batch.length) {
        cache.sync.backfillComplete = true;
        cache.sync.v1NextPage = 1;
        break;
      }

      const allBeforeAnchor = batch.every((item) => {
        const ymd = extractDeliveryNoteYmdFromItem(item);
        return ymd == null || ymd < anchor;
      });
      if (allBeforeAnchor) {
        cache.sync.backfillComplete = true;
        cache.sync.v1NextPage = 1;
        break;
      }

      page += 1;
      cache.sync.v1NextPage = page;
    }

    cache.sync.lastSyncedAt = new Date().toISOString();
    if (!cache.sync.lastError) cache.sync.lastError = null;
    await saveDeliverySalesCacheFile(cache);
    return {
      ok: true,
      pagesFetched,
      linesWritten,
      backfillComplete: cache.sync.backfillComplete,
      source: "v1",
      nextPage: cache.sync.v1NextPage,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    cache.sync.lastError = msg;
    await saveDeliverySalesCacheFile(cache);
    return {
      ok: false,
      pagesFetched,
      linesWritten,
      backfillComplete: cache.sync.backfillComplete,
      source: cache.sync.source,
      error: msg,
    };
  }
}
