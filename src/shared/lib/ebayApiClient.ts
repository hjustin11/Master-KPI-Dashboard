import {
  FLEX_DAY_MS,
  FLEX_MARKETPLACE_EBAY_SPEC,
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

export const EBAY_DAY_MS = FLEX_DAY_MS;
export type EbayIntegrationConfig = FlexIntegrationConfig;
export type EbayNormalizedOrder = FlexNormalizedOrder;
export type FetchEbayOrdersOptions = FetchFlexOrdersOptions;

export async function getEbayIntegrationConfig(): Promise<EbayIntegrationConfig> {
  return getFlexIntegrationConfig(FLEX_MARKETPLACE_EBAY_SPEC);
}

export const fetchEbayOrdersPaginated = fetchFlexOrdersPaginated;
export const summarizeEbayOrders = summarizeFlexOrders;
export { filterOrdersByCreatedRange, parseYmdParam, ymdToUtcRangeExclusiveEnd };

export function ebayMissingKeysForConfig(config: EbayIntegrationConfig) {
  return flexMissingKeysForConfig(config);
}
