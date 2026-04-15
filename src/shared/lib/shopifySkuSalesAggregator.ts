/**
 * Shopify-SKU-Mengen-Aggregator: Holt Shopify-Bestellungen über die Admin API
 * und aggregiert verkaufte Stückzahlen pro SKU.
 *
 * Wird in der Bedarfsprognose verwendet, um "AstroPet.de" (Xentral-Projekt AP)
 * in "Shopify" (API-basiert) + "AP Sonstige" (Rest) aufzusplitten.
 */

import {
  FLEX_MARKETPLACE_SHOPIFY_SPEC,
  getFlexIntegrationConfig,
  fetchFlexOrdersRawPaginated,
} from "@/shared/lib/flexMarketplaceApiClient";
import { extractLinesFromFlexRawOrder } from "@/shared/lib/marketplaceArticleLines";
import {
  getIntegrationCachedOrLoad,
} from "@/shared/lib/integrationDataCache";

/** Serialisierbare Map-Repräsentation für den Cache. */
type ShopifySkuSalesCache = Record<string, number>;

const CACHE_FRESH_MS = 15 * 60 * 1000; // 15 Min
const CACHE_STALE_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Aggregiert Shopify-Bestellungen im Zeitraum und liefert verkaufte Stückzahlen pro SKU (lowercase).
 * Ergebnis wird im `integration_data_cache` gecacht (15 Min fresh, 24 h stale).
 */
export async function aggregateShopifySkuSales(args: {
  fromYmd: string;
  toYmd: string;
}): Promise<Map<string, number>> {
  const cacheKey = `shopify:sku-sales:${args.fromYmd}:${args.toYmd}`;

  const cached = await getIntegrationCachedOrLoad<ShopifySkuSalesCache>({
    cacheKey,
    source: "shopify:sku-sales-aggregator",
    freshMs: CACHE_FRESH_MS,
    staleMs: CACHE_STALE_MS,
    loader: () => loadShopifySkuSalesLive(args.fromYmd, args.toYmd),
  });

  return new Map(Object.entries(cached));
}

async function loadShopifySkuSalesLive(
  fromYmd: string,
  toYmd: string,
): Promise<ShopifySkuSalesCache> {
  const config = await getFlexIntegrationConfig(FLEX_MARKETPLACE_SHOPIFY_SPEC);
  if (!config.baseUrl || !config.apiKey) return {};

  const raw = await fetchFlexOrdersRawPaginated(config, {
    fromYmd,
    toYmd,
    maxPages: 60,
  });

  const bySku: Record<string, number> = {};
  for (const order of raw) {
    const lines = extractLinesFromFlexRawOrder(order, config.amountScale);
    for (const line of lines) {
      const key = line.key.trim().toLowerCase();
      if (!key || key === "—") continue;
      bySku[key] = (bySku[key] ?? 0) + line.units;
    }
  }
  return bySku;
}
