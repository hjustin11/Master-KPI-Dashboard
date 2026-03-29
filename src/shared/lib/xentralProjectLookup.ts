/**
 * Xentral REST: Projekt-Liste (api/v1/projects) und lesbare Marktplatz-Namen — für Bestellungen, Artikel, …
 */

export function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function pickFirstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function extractAttributes(obj: Record<string, unknown>): Record<string, unknown> {
  const attrs = obj.attributes;
  if (attrs && typeof attrs === "object") return attrs as Record<string, unknown>;
  return obj;
}

/** Projekt-keyName (Xentral) → lesbarer Marktplatz in der UI */
export const MARKETPLACE_KEY_DISPLAY: Record<string, string> = {
  FN: "FRESSNAPF",
  KL: "KAUFLAND",
  AP: "SHOPIFY",
  TT: "TIKTOK",
};

export function expandMarketplaceKeyName(label: string): string {
  if (label === "—") return label;
  const key = label.trim().toUpperCase();
  return MARKETPLACE_KEY_DISPLAY[key] ?? label;
}

/**
 * Xentral liefert oft nur project: { id: "4" }. Kurzname (Kennung) steht in
 * GET /api/v1/projects als keyName (z. B. AMZ-FBM), Anzeigename als name.
 */
export async function fetchXentralProjectByIdLookup(args: {
  baseUrl: string;
  token: string;
}): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    for (let page = 1; page <= 200; page++) {
      const url = new URL(joinUrl(args.baseUrl, "api/v1/projects"));
      url.searchParams.set("page[number]", String(page));
      url.searchParams.set("page[size]", "50");

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${args.token}`,
        },
        cache: "no-store",
      });
      if (!res.ok) break;

      let json: unknown;
      try {
        json = (await res.json()) as unknown;
      } catch {
        break;
      }
      const root = json as Record<string, unknown>;
      const data = Array.isArray(root?.data) ? (root.data as unknown[]) : [];
      if (!data.length) break;

      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const attr = extractAttributes(obj);
        const id = pickFirstString(obj.id) ?? pickFirstString(attr.id);
        if (!id) continue;
        const keyName = pickFirstString(attr.keyName) ?? pickFirstString(attr.key_name);
        const name = pickFirstString(attr.name);
        const label = (keyName?.trim() || name?.trim() || id).trim();
        map.set(id, label);
      }

      if (data.length < 50) break;
    }
  } catch {
    /* ohne Lookup fortfahren */
  }
  return map;
}
