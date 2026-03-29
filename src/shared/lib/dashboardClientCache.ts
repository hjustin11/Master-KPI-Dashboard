/**
 * Einheitliche Client-Cache-Strategie (wie Xentral-Bestellungen):
 * optional localStorage hydratisieren → API immer anfragen → periodisch still abgleichen.
 */

export const DASHBOARD_CLIENT_BACKGROUND_SYNC_MS = 5 * 60 * 1000;

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
