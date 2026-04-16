import type { Role } from "@/shared/lib/invitations";

export type DashboardPageAccessKey =
  | "overview.home"
  | "myArea.page"
  | "updates.page"
  | "settings.users"
  | "settings.profile"
  | "settings.tutorials"
  | "analytics.marketplaces"
  | "analytics.payouts"
  | "analytics.articleForecast"
  | "analytics.procurement"
  | "advertising.campaigns"
  | "advertising.performance"
  | "xentral.products"
  | "xentral.orders"
  | "amazon.orders"
  | "amazon.products"
  | "ebay.orders"
  | "ebay.products"
  | "otto.orders"
  | "otto.products"
  | "kaufland.orders"
  | "kaufland.products"
  | "fressnapf.orders"
  | "fressnapf.products"
  | "mms.orders"
  | "mms.products"
  | "zooplus.orders"
  | "zooplus.products"
  | "tiktok.orders"
  | "tiktok.products"
  | "shopify.orders"
  | "shopify.products";

export const DASHBOARD_PAGE_ACCESS_CONFIG: Array<{
  key: DashboardPageAccessKey;
  label: string;
  path: string;
}> = [
  { key: "overview.home", label: "Mein Bereich", path: "/" },
  { key: "myArea.page", label: "Mein Bereich · Privat", path: "/mein-bereich" },
  { key: "updates.page", label: "Update & Feedback", path: "/updates" },
  { key: "settings.users", label: "Administration · Benutzerverwaltung", path: "/settings/users" },
  { key: "settings.profile", label: "Administration · Profil", path: "/settings/profile" },
  { key: "settings.tutorials", label: "Administration · Tutorial-Editor", path: "/settings/tutorials" },
  { key: "analytics.marketplaces", label: "Analytics · Marktplätze", path: "/analytics/marketplaces" },
  { key: "analytics.payouts", label: "Analytics · Auszahlungen", path: "/analytics/payouts" },
  { key: "analytics.articleForecast", label: "Analytics · Bedarfsprognose", path: "/analytics/article-forecast" },
  { key: "analytics.procurement", label: "Analytics · Beschaffung", path: "/analytics/procurement" },
  { key: "advertising.campaigns", label: "Werbung · Kampagnen", path: "/advertising/campaigns" },
  { key: "advertising.performance", label: "Werbung · Performance", path: "/advertising/performance" },
  { key: "xentral.products", label: "Xentral · Artikel", path: "/xentral/products" },
  { key: "xentral.orders", label: "Xentral · Aufträge", path: "/xentral/orders" },
  { key: "amazon.orders", label: "Amazon · Bestellungen", path: "/amazon/orders" },
  { key: "amazon.products", label: "Amazon · Produkte", path: "/amazon/products" },
  { key: "ebay.orders", label: "eBay · Bestellungen", path: "/ebay/orders" },
  { key: "ebay.products", label: "eBay · Produkte", path: "/ebay/products" },
  { key: "otto.orders", label: "Otto · Bestellungen", path: "/otto/orders" },
  { key: "otto.products", label: "Otto · Produkte", path: "/otto/products" },
  { key: "kaufland.orders", label: "Kaufland · Bestellungen", path: "/kaufland/orders" },
  { key: "kaufland.products", label: "Kaufland · Produkte", path: "/kaufland/products" },
  { key: "fressnapf.orders", label: "Fressnapf · Bestellungen", path: "/fressnapf/orders" },
  { key: "fressnapf.products", label: "Fressnapf · Produkte", path: "/fressnapf/products" },
  { key: "mms.orders", label: "MediaMarkt & Saturn · Bestellungen", path: "/mediamarkt-saturn/orders" },
  { key: "mms.products", label: "MediaMarkt & Saturn · Produkte", path: "/mediamarkt-saturn/products" },
  { key: "zooplus.orders", label: "ZooPlus · Bestellungen", path: "/zooplus/orders" },
  { key: "zooplus.products", label: "ZooPlus · Produkte", path: "/zooplus/products" },
  { key: "tiktok.orders", label: "TikTok · Bestellungen", path: "/tiktok/orders" },
  { key: "tiktok.products", label: "TikTok · Produkte", path: "/tiktok/products" },
  { key: "shopify.orders", label: "Shopify · Bestellungen", path: "/shopify/orders" },
  { key: "shopify.products", label: "Shopify · Produkte", path: "/shopify/products" },
];

export const PAGE_ACCESS_BY_PATH: Record<string, DashboardPageAccessKey> = Object.fromEntries(
  DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [entry.path, entry.key])
) as Record<string, DashboardPageAccessKey>;

export const INITIAL_ROLE_PAGE_ACCESS: Record<Role, Record<DashboardPageAccessKey, boolean>> = {
  owner: Object.fromEntries(
    DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [entry.key, true])
  ) as Record<DashboardPageAccessKey, boolean>,
  admin: Object.fromEntries(
    DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [
      entry.key,
      entry.key === "settings.tutorials" ? false : true,
    ])
  ) as Record<DashboardPageAccessKey, boolean>,
  manager: Object.fromEntries(
    DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [
      entry.key,
      entry.key === "settings.tutorials" ? false : true,
    ])
  ) as Record<DashboardPageAccessKey, boolean>,
  analyst: Object.fromEntries(
    DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [
      entry.key,
      entry.path.startsWith("/analytics") ||
      entry.path === "/" ||
      entry.path === "/updates" ||
      entry.path === "/settings/profile"
        ? true
        : false,
    ])
  ) as Record<DashboardPageAccessKey, boolean>,
  viewer: Object.fromEntries(
    DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [
      entry.key,
      entry.key === "overview.home" || entry.key === "updates.page" || entry.key === "settings.profile",
    ])
  ) as Record<DashboardPageAccessKey, boolean>,
};

export function pageAccessForRole(roleKey: string): Record<DashboardPageAccessKey, boolean> {
  const initial = INITIAL_ROLE_PAGE_ACCESS[roleKey as Role];
  if (initial) return { ...initial };
  return Object.fromEntries(
    DASHBOARD_PAGE_ACCESS_CONFIG.map((entry) => [entry.key, false])
  ) as Record<DashboardPageAccessKey, boolean>;
}

