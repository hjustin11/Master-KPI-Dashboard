import { primeAmazonProductsIntegrationCache } from "@/shared/lib/amazonProductsSpApiCatalog";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";
import { getEbayIntegrationConfig, ebayMissingKeysForConfig } from "@/shared/lib/ebayApiClient";
import { fetchEbayInventoryProductRows } from "@/shared/lib/ebayInventoryProducts";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import { getKauflandIntegrationConfig } from "@/shared/lib/kauflandApiClient";
import { fetchKauflandProductRows } from "@/shared/lib/kauflandProductsList";
import { getMmsIntegrationConfig, mmsMissingKeysForConfig } from "@/shared/lib/mmsApiClient";
import { fetchMiraklProductRowsFlex, fetchMiraklProductRowsFressnapf } from "@/shared/lib/miraklProductOffers";
import {
  ensureOttoAvailabilityScope,
  ensureOttoProductsScope,
  fetchOttoAvailabilityQuantitiesAll,
  fetchOttoProductsAll,
  getOttoAccessToken,
  getOttoIntegrationConfig,
} from "@/shared/lib/ottoApiClient";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { readIntegrationCache } from "@/shared/lib/integrationDataCache";
import {
  loadMarketplaceProductListCached,
  syncMarketplaceProductListToCache,
} from "@/shared/lib/marketplaceProductsListCache";
import { getShopifyIntegrationConfig, shopifyMissingKeysForConfig } from "@/shared/lib/shopifyApiClient";
import { fetchShopifyProductRows } from "@/shared/lib/shopifyProductsList";
import { resolveShopifyProductsPathForCache } from "@/shared/lib/shopifyProductsPathResolve";
import { getZooplusIntegrationConfig, zooplusMissingKeysForConfig } from "@/shared/lib/zooplusApiClient";

export type MarketplaceProductPrimeResult = {
  slug: string;
  ok: boolean;
  skipped?: string;
  error?: string;
  itemCount?: number;
  durationMs: number;
};

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

/**
 * Produktlisten in `integration_data_cache` schreiben (gleiche Keys wie GET-Routen).
 * Otto nutzt eigene Otto-Cache-Keys in `fetchOttoProductsAll` / Availability.
 */
export async function primeMarketplaceProductListFull(slug: string): Promise<MarketplaceProductPrimeResult> {
  const started = Date.now();
  const s = slug.trim().toLowerCase();

  try {
    if (s === "amazon") {
      const r = await primeAmazonProductsIntegrationCache();
      return {
        slug: s,
        ok: Boolean(r.ok),
        skipped: r.skipped,
        error: r.error,
        itemCount: r.rowCount,
        durationMs: Date.now() - started,
      };
    }

    // Amazon-Country-Slugs (amazon-fr, amazon-de, ...) — prime the per-country cache
    // mit der entsprechenden marketplaceId aus der Registry.
    if (s.startsWith("amazon-")) {
      const country = getAmazonMarketplaceBySlug(s);
      if (!country) {
        return {
          slug: s,
          ok: false,
          error: `Unbekannter Amazon-Country-Slug: ${s}`,
          durationMs: Date.now() - started,
        };
      }
      const r = await primeAmazonProductsIntegrationCache({ marketplaceId: country.marketplaceId });
      return {
        slug: s,
        ok: Boolean(r.ok),
        skipped: r.skipped,
        error: r.error,
        itemCount: r.rowCount,
        durationMs: Date.now() - started,
      };
    }

    if (s === "shopify") {
      const config = await getShopifyIntegrationConfig();
      const missing = shopifyMissingKeysForConfig(config).filter((x) => x.missing);
      if (missing.length > 0) {
        return {
          slug: s,
          ok: false,
          error: "Shopify nicht vollständig konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const productsPath = await resolveShopifyProductsPathForCache();
      const payload = await syncMarketplaceProductListToCache({
        marketplaceSlug: "shopify",
        variant: "full",
        fingerprintParts: [config.baseUrl, productsPath],
        loader: async () => {
          const items = await fetchShopifyProductRows(config, productsPath);
          return { items };
        },
      });
      return { slug: s, ok: true, itemCount: payload.items.length, durationMs: Date.now() - started };
    }

    if (s === "ebay") {
      const config = await getEbayIntegrationConfig();
      const missing = ebayMissingKeysForConfig(config).filter((x) => x.missing);
      if (missing.length > 0) {
        return {
          slug: s,
          ok: false,
          error: "eBay nicht vollständig konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const listPath = env("EBAY_PRODUCTS_PATH") || "/sell/inventory/v1/inventory_item";
      const payload = await syncMarketplaceProductListToCache({
        marketplaceSlug: "ebay",
        variant: "full",
        fingerprintParts: [listPath],
        loader: async () => {
          const items = await fetchEbayInventoryProductRows(config, listPath);
          return { items, totalCount: items.length };
        },
      });
      return { slug: s, ok: true, itemCount: payload.items.length, durationMs: Date.now() - started };
    }

    if (s === "kaufland") {
      const config = await getKauflandIntegrationConfig();
      if (!config.clientKey || !config.secretKey) {
        return {
          slug: s,
          ok: false,
          error: "Kaufland nicht konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const payload = await syncMarketplaceProductListToCache({
        marketplaceSlug: "kaufland",
        variant: "full",
        fingerprintParts: [config.baseUrl],
        loader: async () => {
          const items = await fetchKauflandProductRows(config);
          return { items, totalCount: items.length };
        },
      });
      return { slug: s, ok: true, itemCount: payload.items.length, durationMs: Date.now() - started };
    }

    if (s === "fressnapf") {
      const config = await getFressnapfIntegrationConfig();
      if (!config.baseUrl || !config.apiKey) {
        return {
          slug: s,
          ok: false,
          error: "Fressnapf nicht konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const payload = await syncMarketplaceProductListToCache({
        marketplaceSlug: "fressnapf",
        variant: "full",
        fingerprintParts: [config.baseUrl, config.ordersPath],
        loader: async () => {
          const items = await fetchMiraklProductRowsFressnapf(config);
          return { items };
        },
      });
      return { slug: s, ok: true, itemCount: payload.items.length, durationMs: Date.now() - started };
    }

    if (s === "zooplus") {
      const config = await getZooplusIntegrationConfig();
      const missing = zooplusMissingKeysForConfig(config).filter((x) => x.missing);
      if (missing.length > 0) {
        return {
          slug: s,
          ok: false,
          error: "ZooPlus nicht vollständig konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const payload = await syncMarketplaceProductListToCache({
        marketplaceSlug: "zooplus",
        variant: "full",
        fingerprintParts: [config.baseUrl, config.ordersPath],
        loader: async () => {
          const items = await fetchMiraklProductRowsFlex(config);
          return { items };
        },
      });
      return { slug: s, ok: true, itemCount: payload.items.length, durationMs: Date.now() - started };
    }

    if (s === "mediamarkt-saturn") {
      const config = await getMmsIntegrationConfig();
      const missing = mmsMissingKeysForConfig(config).filter((x) => x.missing);
      if (missing.length > 0) {
        return {
          slug: s,
          ok: false,
          error: "MediaMarkt & Saturn nicht vollständig konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const payload = await syncMarketplaceProductListToCache({
        marketplaceSlug: "mediamarkt-saturn",
        variant: "full",
        fingerprintParts: [config.baseUrl, config.ordersPath],
        loader: async () => {
          const items = await fetchMiraklProductRowsFlex(config);
          return { items };
        },
      });
      return { slug: s, ok: true, itemCount: payload.items.length, durationMs: Date.now() - started };
    }

    if (s === "otto") {
      const config = await getOttoIntegrationConfig();
      if (!config.clientId || !config.clientSecret) {
        return {
          slug: s,
          ok: false,
          error: "Otto nicht konfiguriert.",
          durationMs: Date.now() - started,
        };
      }
      const scopes = ensureOttoAvailabilityScope(ensureOttoProductsScope(config.scopes));
      const token = await getOttoAccessToken({
        baseUrl: config.baseUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes,
      });
      const productsPathRaw = (process.env.OTTO_PRODUCTS_PATH ?? "").trim();
      const productsPath = productsPathRaw
        ? productsPathRaw.startsWith("/")
          ? productsPathRaw
          : `/${productsPathRaw}`
        : undefined;
      const [list] = await Promise.all([
        fetchOttoProductsAll({
          baseUrl: config.baseUrl,
          token,
          productsPath,
          forceRefresh: true,
        }),
        fetchOttoAvailabilityQuantitiesAll({
          baseUrl: config.baseUrl,
          token,
          forceRefresh: true,
        }),
      ]);
      return {
        slug: s,
        ok: true,
        itemCount: list.length,
        durationMs: Date.now() - started,
      };
    }

    if (s === "tiktok") {
      return {
        slug: s,
        ok: false,
        skipped: "tiktok_products_not_implemented",
        durationMs: Date.now() - started,
      };
    }

    return {
      slug: s,
      ok: false,
      error: `Unbekannter Marktplatz: ${slug}`,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      slug: s,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Marktplätze mit `mp:products`-Cache (wie GET `/api/.../products`).
 * Preisvergleich & Co. sollen hier direkt laden — nicht per internem HTTP,
 * damit Supabase-Cache auch ohne Cookie-Weiterleitung greift.
 */
export async function loadMarketplaceProductRowsForPriceParity(
  slug: string,
  forceRefresh: boolean
): Promise<MarketplaceProductListRow[] | null> {
  const s = slug.trim().toLowerCase();
  try {
    if (s === "shopify") {
      const config = await getShopifyIntegrationConfig();
      if (shopifyMissingKeysForConfig(config).filter((x) => x.missing).length > 0) return null;
      const productsPath = await resolveShopifyProductsPathForCache();
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "shopify",
        variant: "full",
        fingerprintParts: [config.baseUrl, productsPath],
        forceRefresh,
        loader: async () => {
          const items = await fetchShopifyProductRows(config, productsPath);
          return { items };
        },
      });
      return payload.items ?? [];
    }

    if (s === "ebay") {
      const config = await getEbayIntegrationConfig();
      if (ebayMissingKeysForConfig(config).filter((x) => x.missing).length > 0) return null;
      const listPath = env("EBAY_PRODUCTS_PATH") || "/sell/inventory/v1/inventory_item";
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "ebay",
        variant: "full",
        fingerprintParts: [listPath],
        forceRefresh,
        loader: async () => {
          const items = await fetchEbayInventoryProductRows(config, listPath);
          return { items, totalCount: items.length };
        },
      });
      return payload.items ?? [];
    }

    if (s === "kaufland") {
      const config = await getKauflandIntegrationConfig();
      if (!config.clientKey || !config.secretKey) return null;
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "kaufland",
        variant: "full",
        fingerprintParts: [config.baseUrl],
        forceRefresh,
        loader: async () => {
          const items = await fetchKauflandProductRows(config);
          return { items, totalCount: items.length };
        },
      });
      return payload.items ?? [];
    }

    if (s === "fressnapf") {
      const config = await getFressnapfIntegrationConfig();
      if (!config.baseUrl || !config.apiKey) return null;
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "fressnapf",
        variant: "full",
        fingerprintParts: [config.baseUrl, config.ordersPath],
        forceRefresh,
        loader: async () => {
          const items = await fetchMiraklProductRowsFressnapf(config);
          return { items };
        },
      });
      return payload.items ?? [];
    }

    if (s === "zooplus") {
      const config = await getZooplusIntegrationConfig();
      if (zooplusMissingKeysForConfig(config).filter((x) => x.missing).length > 0) return null;
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "zooplus",
        variant: "full",
        fingerprintParts: [config.baseUrl, config.ordersPath],
        forceRefresh,
        loader: async () => {
          const items = await fetchMiraklProductRowsFlex(config);
          return { items };
        },
      });
      return payload.items ?? [];
    }

    if (s === "mediamarkt-saturn") {
      const config = await getMmsIntegrationConfig();
      if (mmsMissingKeysForConfig(config).filter((x) => x.missing).length > 0) return null;
      const payload = await loadMarketplaceProductListCached({
        marketplaceSlug: "mediamarkt-saturn",
        variant: "full",
        fingerprintParts: [config.baseUrl, config.ordersPath],
        forceRefresh,
        loader: async () => {
          const items = await fetchMiraklProductRowsFlex(config);
          return { items };
        },
      });
      return payload.items ?? [];
    }

    if (s === "amazon") {
      // Amazon-Produkte liegen bereits in integration_data_cache (gefüllt via SP-API Cron/Prime).
      // Wir lesen direkt aus dem Cache statt einen langsamen HTTP-Roundtrip zu /api/amazon/products zu machen.
      const marketplaceId = env("AMAZON_SP_API_MARKETPLACE_IDS")?.split(",")[0]?.trim() ?? "";
      const cacheKey = marketplaceId ? `amazon:products:${marketplaceId}` : "amazon:products:";
      const cached = await readIntegrationCache<{ rows?: Array<Record<string, unknown>> }>(cacheKey);
      if (cached.state === "miss" || !Array.isArray(cached.value?.rows)) return null;
      const rows: MarketplaceProductListRow[] = cached.value.rows
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((r) => ({
          sku: String(r.sku ?? ""),
          secondaryId: String(r.secondaryId ?? r.asin ?? ""),
          title: String(r.title ?? ""),
          statusLabel: String(r.statusLabel ?? ""),
          isActive: r.isActive === true || r.statusLabel === "Active",
          priceEur: typeof r.price === "number" && Number.isFinite(r.price) ? r.price : null,
          stockQty: typeof r.stockQty === "number" && Number.isFinite(r.stockQty) ? r.stockQty : null,
        }));
      return rows.length > 0 ? rows : null;
    }

    return null;
  } catch {
    return null;
  }
}

const WARM_PRODUCT_SLUGS = [
  "shopify",
  "ebay",
  "kaufland",
  "fressnapf",
  "zooplus",
  "mediamarkt-saturn",
  "otto",
  "amazon",
] as const;

/** Sequentiell, damit externe APIs nicht alle parallel fluten. */
export async function primeAllMarketplaceProductListsForWarm(): Promise<MarketplaceProductPrimeResult[]> {
  const out: MarketplaceProductPrimeResult[] = [];
  for (const slug of WARM_PRODUCT_SLUGS) {
    out.push(await primeMarketplaceProductListFull(slug));
  }
  return out;
}
