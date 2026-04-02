import { createAdminClient } from "@/shared/lib/supabase/admin";

/** In `next dev`: gleiche TTL-Logik wie in Supabase, aber ohne Netzwerk — zweiter Request oft sofort. */
function useDevIntegrationMemoryMirror(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    (process.env.INTEGRATION_CACHE_DEV_MEMORY ?? "").trim() !== "0"
  );
}

type DevMemoryEntry = { payload: unknown; freshUntil: number; staleUntil: number };
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
  if (useDevIntegrationMemoryMirror()) {
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
    if (useDevIntegrationMemoryMirror()) {
      devIntegrationMemory.set(cacheKey, {
        payload: row.payload,
        freshUntil,
        staleUntil,
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

  if (useDevIntegrationMemoryMirror()) {
    devIntegrationMemory.set(args.cacheKey, {
      payload: args.value,
      freshUntil: now + freshMs,
      staleUntil: now + staleMs,
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
  } catch {
    // Cache failures must not break live API responses.
  }
}

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
    void (async () => {
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
      }
    })();
    return hit.value;
  }
  const value = await args.loader();
  await writeIntegrationCache({
    cacheKey: args.cacheKey,
    source: args.source,
    value,
    freshMs: args.freshMs,
    staleMs: args.staleMs,
  });
  return value;
}
