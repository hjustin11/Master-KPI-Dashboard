import { createAdminClient } from "@/shared/lib/supabase/admin";

/** In `next dev`: gleiche TTL-Logik wie in Supabase, aber ohne Netzwerk — zweiter Request oft sofort. */
function isDevMemoryMirrorEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    (process.env.INTEGRATION_CACHE_DEV_MEMORY ?? "").trim() !== "0"
  );
}

type DevMemoryEntry = {
  payload: unknown;
  freshUntil: number;
  staleUntil: number;
  updatedAtIso?: string;
};
const devIntegrationMemory = new Map<string, DevMemoryEntry>();

type CacheRow = {
  cache_key: string;
  source: string;
  payload: unknown;
  fresh_until: string;
  stale_until: string;
  updated_at: string;
};

export type CachedReadResult<T> =
  | { state: "fresh"; value: T }
  | { state: "stale"; value: T }
  | { state: "miss" };

export async function readIntegrationCache<T>(cacheKey: string): Promise<CachedReadResult<T>> {
  const now = Date.now();
  if (isDevMemoryMirrorEnabled()) {
    const mem = devIntegrationMemory.get(cacheKey);
    if (mem) {
      if (Number.isFinite(mem.freshUntil) && mem.freshUntil > now) {
        return { state: "fresh", value: mem.payload as T };
      }
      if (Number.isFinite(mem.staleUntil) && mem.staleUntil > now) {
        return { state: "stale", value: mem.payload as T };
      }
      devIntegrationMemory.delete(cacheKey);
    }
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_data_cache")
      .select("cache_key,source,payload,fresh_until,stale_until,updated_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error || !data) return { state: "miss" };
    const row = data as CacheRow;
    const freshUntil = Date.parse(row.fresh_until);
    const staleUntil = Date.parse(row.stale_until);
    if (isDevMemoryMirrorEnabled()) {
      devIntegrationMemory.set(cacheKey, {
        payload: row.payload,
        freshUntil,
        staleUntil,
        updatedAtIso: row.updated_at,
      });
    }
    if (Number.isFinite(freshUntil) && freshUntil > now) {
      return { state: "fresh", value: row.payload as T };
    }
    if (Number.isFinite(staleUntil) && staleUntil > now) {
      return { state: "stale", value: row.payload as T };
    }
    return { state: "miss" };
  } catch {
    return { state: "miss" };
  }
}

export async function writeIntegrationCache<T>(args: {
  cacheKey: string;
  source: string;
  value: T;
  freshMs: number;
  staleMs?: number;
}) {
  const now = Date.now();
  const freshMs = Math.max(10_000, args.freshMs);
  const staleMs = Math.max(freshMs, args.staleMs ?? freshMs * 3);

  if (isDevMemoryMirrorEnabled()) {
    devIntegrationMemory.set(args.cacheKey, {
      payload: args.value,
      freshUntil: now + freshMs,
      staleUntil: now + staleMs,
      updatedAtIso: new Date(now).toISOString(),
    });
  }

  try {
    const admin = createAdminClient();
    await admin.from("integration_data_cache").upsert(
      {
        cache_key: args.cacheKey,
        source: args.source,
        payload: args.value,
        fresh_until: new Date(now + freshMs).toISOString(),
        stale_until: new Date(now + staleMs).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "cache_key" }
    );

    // Cleanup: Einträge löschen die seit >7 Tagen abgelaufen sind.
    // Verhindert unbegrenztes Wachstum der Cache-Tabelle (~3.840 Upserts/Tag ohne Cleanup).
    // Probabilistisch: nur bei ~5% der Writes ausführen um DB-Last zu minimieren.
    if (Math.random() < 0.05) {
      const cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      await admin.from("integration_data_cache").delete().lt("stale_until", cutoff);
    }
  } catch {
    // Cache failures must not break live API responses.
  }
}

// ---------------------------------------------------------------------------
// In-flight promise deduplication: Verhindert, dass identische Cache-Keys
// gleichzeitig mehrere Loader starten (z.B. User Refresh + Background Sync +
// zweiter Tab). Ohne das: 3 parallele Requests × 17 Queries = 51 Supabase-Hits.
// ---------------------------------------------------------------------------
const _inflight = new Map<string, Promise<unknown>>();

export async function getIntegrationCachedOrLoad<T>(args: {
  cacheKey: string;
  source: string;
  freshMs: number;
  staleMs?: number;
  loader: () => Promise<T>;
}): Promise<T> {
  const hit = await readIntegrationCache<T>(args.cacheKey);
  if (hit.state === "fresh") return hit.value;

  if (hit.state === "stale") {
    // Background refresh — aber nur wenn nicht bereits einer läuft.
    if (!_inflight.has(args.cacheKey)) {
      const p = (async () => {
        try {
          const fresh = await args.loader();
          await writeIntegrationCache({
            cacheKey: args.cacheKey,
            source: args.source,
            value: fresh,
            freshMs: args.freshMs,
            staleMs: args.staleMs,
          });
        } catch {
          // keep stale fallback
        } finally {
          _inflight.delete(args.cacheKey);
        }
      })();
      _inflight.set(args.cacheKey, p);
    }
    return hit.value;
  }

  // Cache miss: dedupliziert — wenn ein anderer Request denselben Key gerade lädt, mithängen.
  const existing = _inflight.get(args.cacheKey);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    const value = await args.loader();
    await writeIntegrationCache({
      cacheKey: args.cacheKey,
      source: args.source,
      value,
      freshMs: args.freshMs,
      staleMs: args.staleMs,
    });
    return value;
  })();
  _inflight.set(args.cacheKey, p);
  try {
    return await p;
  } finally {
    _inflight.delete(args.cacheKey);
  }
}

/** Nur Supabase/Dev-Memory lesen — kein Live-Loader (Marktplatz-Dashboard). */
export type IntegrationDashboardCacheRead<T> =
  | { state: "miss" }
  | { state: "fresh" | "stale"; value: T; updatedAt: string };

export async function readIntegrationCacheForDashboard<T>(
  cacheKey: string
): Promise<IntegrationDashboardCacheRead<T>> {
  const now = Date.now();
  if (isDevMemoryMirrorEnabled()) {
    const mem = devIntegrationMemory.get(cacheKey);
    if (mem) {
      const updatedAt = mem.updatedAtIso ?? new Date().toISOString();
      if (Number.isFinite(mem.freshUntil) && mem.freshUntil > now) {
        return { state: "fresh", value: mem.payload as T, updatedAt };
      }
      if (Number.isFinite(mem.staleUntil) && mem.staleUntil > now) {
        return { state: "stale", value: mem.payload as T, updatedAt };
      }
      devIntegrationMemory.delete(cacheKey);
    }
    return { state: "miss" };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_data_cache")
      .select("payload,fresh_until,stale_until,updated_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error || !data) return { state: "miss" };
    const row = data as CacheRow;
    const freshUntil = Date.parse(row.fresh_until);
    const staleUntil = Date.parse(row.stale_until);
    const updatedAt =
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at
        : new Date().toISOString();
    if (Number.isFinite(freshUntil) && freshUntil > now) {
      return { state: "fresh", value: row.payload as T, updatedAt };
    }
    if (Number.isFinite(staleUntil) && staleUntil > now) {
      return { state: "stale", value: row.payload as T, updatedAt };
    }
    return { state: "miss" };
  } catch {
    return { state: "miss" };
  }
}
