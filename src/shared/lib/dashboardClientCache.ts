/**
 * Einheitliche Client-Cache-Strategie (wie Xentral-Bestellungen):
 * optional localStorage hydratisieren → API immer anfragen → periodisch still abgleichen.
 */

/** An Supabase-Cache-TTL (Cron 15 Min) angeglichen — Poll trifft nur leichte GETs. */
export const DASHBOARD_CLIENT_BACKGROUND_SYNC_MS = 15 * 60 * 1000;

/** Reduziert unnötige Polling-Last in versteckten Browser-Tabs. */
export function shouldRunBackgroundSync(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function readLocalJsonCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeLocalJsonCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota, private mode */
  }
}

/** Sales-Compare-Payload wie von den Analytics-API-Sales-Routen (summary erforderlich). */
type SalesCompareLike = {
  summary?: { orderCount: number; salesAmount: number; units: number; currency: string };
  error?: string;
};

/**
 * Liest den zuletzt gespeicherten Vergleich für einen Zeitraum (localStorage).
 * Nur im Browser sinnvoll — bei SSR immer leer, damit keine Hydration-Konflikte.
 */
export function readAnalyticsSalesCompareInitial<T extends SalesCompareLike>(
  cacheKey: string
): { data: T | null; loading: boolean } {
  if (typeof window === "undefined") return { data: null, loading: true };
  const parsed = readLocalJsonCache<{ savedAt: number } & T>(cacheKey);
  if (parsed?.summary && !parsed.error) {
    return { data: parsed as unknown as T, loading: false };
  }
  return { data: null, loading: true };
}
