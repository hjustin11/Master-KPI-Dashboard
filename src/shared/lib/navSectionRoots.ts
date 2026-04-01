/**
 * Sidebar-Oberpunkte mit Unterseiten: keine eigene Inhaltsseite — nur Gruppierung.
 * Breadcrumb-Zwischensegmente mit diesen Pfaden werden nicht verlinkt.
 * HTTP-Weiterleitungen: `next.config.ts` → SECTION_ROOT_REDIRECTS (Ziele hier synchron halten).
 */
export const SECTION_ROOT_PATHS = [
  "/amazon",
  "/ebay",
  "/otto",
  "/kaufland",
  "/fressnapf",
  "/mediamarkt-saturn",
  "/zooplus",
  "/tiktok",
  "/shopify",
  "/xentral",
  "/advertising",
  "/analytics",
  "/settings",
] as const;

export type SectionRootPath = (typeof SECTION_ROOT_PATHS)[number];

/** Erster Unterpunkt wie in AppSidebar navItems (sichtbare Reihenfolge). */
export const SECTION_ROOT_REDIRECT_TARGET: Record<SectionRootPath, string> = {
  "/amazon": "/amazon/orders",
  "/ebay": "/ebay/orders",
  "/otto": "/otto/orders",
  "/kaufland": "/kaufland/orders",
  "/fressnapf": "/fressnapf/orders",
  "/mediamarkt-saturn": "/mediamarkt-saturn/orders",
  "/zooplus": "/zooplus/orders",
  "/tiktok": "/tiktok/orders",
  "/shopify": "/shopify/orders",
  "/xentral": "/xentral/products",
  "/advertising": "/advertising/campaigns",
  "/analytics": "/analytics/marketplaces",
  "/settings": "/settings/users",
};

const SECTION_ROOT_SET = new Set<string>(SECTION_ROOT_PATHS);

export function isSectionRootPath(href: string): boolean {
  return SECTION_ROOT_SET.has(href);
}
