import { SIDEBAR_ITEM_CONFIG, type SidebarItemKey } from "@/shared/lib/access-control";

/** i18n-Schlüssel für Sidebar-Hauptpunkte (Tutorial-Editor / Hinweise). */
export const TUTORIAL_SIDEBAR_I18N_KEY: Record<SidebarItemKey, string> = {
  overview: "sidebarItems.overview",
  myArea: "sidebarItems.myArea",
  amazon: "nav.amazon",
  ebay: "nav.ebay",
  otto: "nav.otto",
  kaufland: "nav.kaufland",
  fressnapf: "nav.fressnapf",
  mediamarktSaturn: "nav.mediamarktSaturn",
  zooplus: "nav.zooplus",
  tiktok: "nav.tiktok",
  shopify: "nav.shopify",
  xentral: "nav.xentral",
  advertising: "nav.advertising",
  analytics: "nav.analytics",
  settings: "nav.settings",
  updates: "nav.updates",
};

const SIDEBAR_KEY_SET = new Set<string>(SIDEBAR_ITEM_CONFIG.map((item) => item.key));

export function isSidebarItemKey(value: string): value is SidebarItemKey {
  return SIDEBAR_KEY_SET.has(value);
}

export function sanitizeVisibleSidebarKeys(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const next = raw.filter((item): item is string => typeof item === "string" && isSidebarItemKey(item));
  return next;
}

export type TutorialHighlightMode = "spotlight" | "ring" | "ring_pulse";

export function sanitizeHighlightMode(raw: unknown): TutorialHighlightMode {
  if (raw === "ring" || raw === "ring_pulse" || raw === "spotlight") return raw;
  return "spotlight";
}

export function parseExtraHighlightSelectors(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // fall through
  }
  return text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function collectHighlightSelectors(args: {
  primary: string | null | undefined;
  extraRaw: string | null | undefined;
}): string[] {
  const out: string[] = [];
  if (args.primary?.trim()) out.push(args.primary.trim());
  out.push(...parseExtraHighlightSelectors(args.extraRaw ?? null));
  return [...new Set(out)];
}
