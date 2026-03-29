import {
  FLEX_DAY_MS,
  FLEX_MARKETPLACE_MMS_SPEC,
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

export const MMS_DAY_MS = FLEX_DAY_MS;
export type MmsIntegrationConfig = FlexIntegrationConfig;
export type MmsNormalizedOrder = FlexNormalizedOrder;
export type FetchMmsOrdersOptions = FetchFlexOrdersOptions;

export async function getMmsIntegrationConfig(): Promise<MmsIntegrationConfig> {
  return getFlexIntegrationConfig(FLEX_MARKETPLACE_MMS_SPEC);
}

export const fetchMmsOrdersPaginated = fetchFlexOrdersPaginated;
export const summarizeMmsOrders = summarizeFlexOrders;
export { filterOrdersByCreatedRange, parseYmdParam, ymdToUtcRangeExclusiveEnd };

export function mmsMissingKeysForConfig(config: MmsIntegrationConfig) {
  return flexMissingKeysForConfig(config);
}
