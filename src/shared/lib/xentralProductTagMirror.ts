/**
 * Lokaler Spiegel der Xentral-Artikel-Tags (Browser).
 * Wird sofort bei Änderungen geschrieben (vor / parallel zum API-Call);
 * Supabase bleibt die globale Quelle, dieser Cache sichert UX & Offline-Lesezugriff.
 */

const STORAGE_KEY = "master-dashboard:xentral-product-tags-mirror:v1";

export type XentralTagMirrorPayload = {
  tagDefs: Array<{ id: string; color: string }>;
  tagBySku: Record<string, string | null>;
  savedAt: number;
};

export function writeXentralTagMirror(
  tagBySku: Record<string, string | null>,
  tagDefs: Array<{ id: string; color: string }>
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: XentralTagMirrorPayload = {
      tagBySku,
      tagDefs,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readXentralTagMirror(): XentralTagMirrorPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const tagBySku = o.tagBySku;
    const tagDefs = o.tagDefs;
    const savedAt = o.savedAt;
    if (!tagBySku || typeof tagBySku !== "object" || Array.isArray(tagBySku)) return null;
    if (!Array.isArray(tagDefs)) return null;
    if (typeof savedAt !== "number") return null;
    return {
      tagBySku: tagBySku as Record<string, string | null>,
      tagDefs: tagDefs as Array<{ id: string; color: string }>,
      savedAt,
    };
  } catch {
    return null;
  }
}
