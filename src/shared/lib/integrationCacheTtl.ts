/**
 * TTLs für `integration_data_cache` (Marktplatz-Orders u. ä.).
 * Längere Werte = schnellere Antworten aus Supabase, seltener kalter Miss.
 *
 * Env in Millisekunden (optional):
 * - INTEGRATION_CACHE_FRESH_MS — ab wann im Hintergrund revalidiert wird (Default 15 Min)
 * - INTEGRATION_CACHE_STALE_MS — bis wann noch aus DB bedient wird, dann Live-Fetch (Default 24 Std)
 */

const MIN_MS = 10_000;
const DEFAULT_FRESH_MS = 15 * 60 * 1000;
const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;

function parseEnvMs(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_MS) return fallback;
  return Math.floor(n);
}

export function marketplaceIntegrationFreshMs(): number {
  return parseEnvMs("INTEGRATION_CACHE_FRESH_MS", DEFAULT_FRESH_MS);
}

export function marketplaceIntegrationStaleMs(): number {
  const fresh = marketplaceIntegrationFreshMs();
  const stale = parseEnvMs("INTEGRATION_CACHE_STALE_MS", DEFAULT_STALE_MS);
  return Math.max(stale, fresh);
}
