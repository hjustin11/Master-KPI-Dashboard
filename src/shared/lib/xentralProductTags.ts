const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type XentralProductTagDef = { id: string; color: string };

export function sanitizeTagColor(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return HEX_COLOR.test(t) ? t : null;
}

export function sanitizeTagDefs(raw: unknown): XentralProductTagDef[] {
  if (!Array.isArray(raw)) return [];
  const out: XentralProductTagDef[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const color = typeof o.color === "string" ? sanitizeTagColor(o.color) : null;
    if (!id || id.length > 200 || !color) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, color });
  }
  return out;
}

export function sanitizeSku(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > 512) return null;
  return t;
}
