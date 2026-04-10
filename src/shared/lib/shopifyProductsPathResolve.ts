import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";

/** Pfad ohne Query (Orders-Pfad darf z. B. `.../orders.json?foo` sein). */
function shopifyAdminPathnameOnly(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).pathname;
    } catch {
      return t.split("?")[0] ?? "";
    }
  }
  return t.split("?")[0] ?? "";
}

/** Gleiche Logik wie `GET /api/shopify/products` — für Cache-Key und Refresh/Warm. */
export async function resolveShopifyProductsPathForCache(): Promise<string> {
  const fromSecret = (await getIntegrationSecretValue("SHOPIFY_PRODUCTS_PATH")).trim();
  if (fromSecret) {
    const t = fromSecret.trim();
    if (/^https?:\/\//i.test(t)) {
      try {
        const u = new URL(t);
        const pq = `${u.pathname}${u.search}`;
        return pq.startsWith("/") ? pq : `/${pq}`;
      } catch {
        /* relative fallback */
      }
    }
    return fromSecret.startsWith("/") ? fromSecret : `/${fromSecret}`;
  }
  const ordersDefault = "/admin/api/2024-10/orders.json";
  const ordersRaw =
    (await getIntegrationSecretValue("SHOPIFY_ORDERS_PATH")).trim() || ordersDefault;
  const ordersPath = shopifyAdminPathnameOnly(ordersRaw) || ordersDefault;
  if (/\/orders\.json$/i.test(ordersPath)) {
    return ordersPath.replace(/\/orders\.json$/i, "/products.json");
  }
  return "/admin/api/2024-10/products.json";
}
