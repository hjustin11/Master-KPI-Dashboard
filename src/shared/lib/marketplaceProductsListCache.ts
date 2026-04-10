import { createHash } from "node:crypto";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import {
  readIntegrationCacheForDashboard,
  writeIntegrationCache,
  type IntegrationDashboardCacheRead,
} from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";

/** Gespeichert in `integration_data_cache` (inkl. Dev-Memory-Spiegel). */
export type MarketplaceProductListPayload = {
  items: MarketplaceProductListRow[];
  totalCount?: number;
};

function fingerprint(parts: string[]): string {
  return createHash("sha256")
    .update(parts.filter((p) => p !== "").join("|"), "utf8")
    .digest("hex")
    .slice(0, 24);
}

export function marketplaceProductListCacheKey(args: {
  marketplaceSlug: string;
  variant: string;
  fingerprintParts: string[];
}): string {
  const fp = fingerprint(args.fingerprintParts);
  return `mp:products:v1:${args.marketplaceSlug}:${args.variant}:${fp}`;
}

export async function readMarketplaceProductListFromDashboard(args: {
  marketplaceSlug: string;
  variant: string;
  fingerprintParts: string[];
}): Promise<IntegrationDashboardCacheRead<MarketplaceProductListPayload>> {
  const cacheKey = marketplaceProductListCacheKey(args);
  return readIntegrationCacheForDashboard<MarketplaceProductListPayload>(cacheKey);
}

/** Cron / POST-Refresh: Live-Fetch und Supabase-Cache schreiben. */
export async function syncMarketplaceProductListToCache(args: {
  marketplaceSlug: string;
  variant: string;
  fingerprintParts: string[];
  loader: () => Promise<MarketplaceProductListPayload>;
}): Promise<MarketplaceProductListPayload> {
  const cacheKey = marketplaceProductListCacheKey(args);
  const source = `mp:products:${args.marketplaceSlug}`;
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  const value = await args.loader();
  await writeIntegrationCache({
    cacheKey,
    source,
    value,
    freshMs,
    staleMs,
  });
  return value;
}

/**
 * Dashboard-GET: nur Supabase; bei Miss leere Liste.
 * `forceRefresh` nur für interne Sync-Aufrufe (Refresh-Route / Warm).
 */
export async function loadMarketplaceProductListCached(args: {
  /** z. B. shopify, ebay, kaufland, fressnapf, zooplus, mediamarkt-saturn */
  marketplaceSlug: string;
  /** z. B. full, page */
  variant: string;
  /** Unterscheidet Pfade, Shops, Pagination — wird gehasht. */
  fingerprintParts: string[];
  forceRefresh: boolean;
  loader: () => Promise<MarketplaceProductListPayload>;
}): Promise<MarketplaceProductListPayload> {
  if (args.forceRefresh) {
    return syncMarketplaceProductListToCache({
      marketplaceSlug: args.marketplaceSlug,
      variant: args.variant,
      fingerprintParts: args.fingerprintParts,
      loader: args.loader,
    });
  }
  const hit = await readMarketplaceProductListFromDashboard({
    marketplaceSlug: args.marketplaceSlug,
    variant: args.variant,
    fingerprintParts: args.fingerprintParts,
  });
  if (hit.state !== "miss") return hit.value;
  return { items: [] };
}

export function parseProductListForceRefresh(request: Request): boolean {
  const u = new URL(request.url);
  return u.searchParams.get("refresh") === "1";
}
