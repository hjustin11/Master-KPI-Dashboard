import {
  FLEX_DAY_MS,
  FLEX_MARKETPLACE_TIKTOK_SPEC,
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

export const TIKTOK_DAY_MS = FLEX_DAY_MS;
export type TiktokIntegrationConfig = FlexIntegrationConfig;
export type TiktokNormalizedOrder = FlexNormalizedOrder;
export type FetchTiktokOrdersOptions = FetchFlexOrdersOptions;

export async function getTiktokIntegrationConfig(): Promise<TiktokIntegrationConfig> {
  return getFlexIntegrationConfig(FLEX_MARKETPLACE_TIKTOK_SPEC);
}

export const fetchTiktokOrdersPaginated = fetchFlexOrdersPaginated;
export const summarizeTiktokOrders = summarizeFlexOrders;
export { filterOrdersByCreatedRange, parseYmdParam, ymdToUtcRangeExclusiveEnd };

export function tiktokMissingKeysForConfig(config: TiktokIntegrationConfig) {
  return flexMissingKeysForConfig(config);
}
