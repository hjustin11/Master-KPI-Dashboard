// Thin re-export über flexMarketplaceApiClient. Keine marktplatz-spezifische Logik.
// Namensgebung dient der Lesbarkeit am Call-Site (shopify-spezifische Funktionsnamen).
// Bei neuen Marktplätzen bevorzugt direkt `getFlexIntegrationConfig()` verwenden.
import {
  FLEX_DAY_MS,
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
  fetchFlexOrdersPaginated,
  filterOrdersByCreatedRange,
  flexMissingKeysForConfig,
  getFlexIntegrationConfig,
  parseYmdParam,
  summarizeFlexOrders,
  ymdToUtcRangeExclusiveEnd,
  type FetchFlexOrdersOptions,
  type FlexIntegrationConfig,
  type FlexNormalizedOrder,
} from "@/shared/lib/flexMarketplaceApiClient";

export const SHOPIFY_DAY_MS = FLEX_DAY_MS;
export type ShopifyIntegrationConfig = FlexIntegrationConfig;
export type ShopifyNormalizedOrder = FlexNormalizedOrder;
export type FetchShopifyOrdersOptions = FetchFlexOrdersOptions;

export async function getShopifyIntegrationConfig(): Promise<ShopifyIntegrationConfig> {
  return getFlexIntegrationConfig(FLEX_MARKETPLACE_SHOPIFY_SPEC);
}

export const fetchShopifyOrdersPaginated = fetchFlexOrdersPaginated;
export const summarizeShopifyOrders = summarizeFlexOrders;
export { filterOrdersByCreatedRange, parseYmdParam, ymdToUtcRangeExclusiveEnd };

export function shopifyMissingKeysForConfig(config: ShopifyIntegrationConfig) {
  return flexMissingKeysForConfig(config);
}
