import type { SidebarItemKey } from "@/shared/lib/access-control";

/** Längster-Pfad-Match zu den Dashboard-Routen (analog zu AppSidebar `navItems`). */
const PREFIXES: Array<{ prefix: string; key: SidebarItemKey }> = [
  { prefix: "/mein-bereich", key: "myArea" },
  { prefix: "/advertising", key: "advertising" },
  { prefix: "/amazon", key: "amazon" },
  { prefix: "/ebay", key: "ebay" },
  { prefix: "/otto", key: "otto" },
  { prefix: "/kaufland", key: "kaufland" },
  { prefix: "/fressnapf", key: "fressnapf" },
  { prefix: "/mediamarkt-saturn", key: "mediamarktSaturn" },
  { prefix: "/zooplus", key: "zooplus" },
  { prefix: "/tiktok", key: "tiktok" },
  { prefix: "/shopify", key: "shopify" },
  { prefix: "/xentral", key: "xentral" },
  { prefix: "/analytics", key: "analytics" },
  { prefix: "/settings", key: "settings" },
  { prefix: "/updates", key: "updates" },
];

export function resolveSidebarItemKeyFromDashboardPath(pathname: string): SidebarItemKey | null {
  const path = pathname || "/";
  if (path === "/" || path === "") return "overview";
  const sorted = [...PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, key } of sorted) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  }
  return null;
}
