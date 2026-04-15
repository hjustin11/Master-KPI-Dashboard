// Thin re-export über flexMarketplaceApiClient. Keine marktplatz-spezifische Logik.
// Namensgebung dient der Lesbarkeit am Call-Site (zooplus-spezifische Funktionsnamen).
// Bei neuen Marktplätzen bevorzugt direkt `getFlexIntegrationConfig()` verwenden.
import {
  FLEX_DAY_MS,
  FLEX_MARKETPLACE_ZOOPLUS_SPEC,
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

export const ZOOPLUS_DAY_MS = FLEX_DAY_MS;
export type ZooplusIntegrationConfig = FlexIntegrationConfig;
export type ZooplusNormalizedOrder = FlexNormalizedOrder;
export type FetchZooplusOrdersOptions = FetchFlexOrdersOptions;

export async function getZooplusIntegrationConfig(): Promise<ZooplusIntegrationConfig> {
  return getFlexIntegrationConfig(FLEX_MARKETPLACE_ZOOPLUS_SPEC);
}

export const fetchZooplusOrdersPaginated = fetchFlexOrdersPaginated;
export const summarizeZooplusOrders = summarizeFlexOrders;
export { filterOrdersByCreatedRange, parseYmdParam, ymdToUtcRangeExclusiveEnd };

export function zooplusMissingKeysForConfig(config: ZooplusIntegrationConfig) {
  return flexMissingKeysForConfig(config);
}
