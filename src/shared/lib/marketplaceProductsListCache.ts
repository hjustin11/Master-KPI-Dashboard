import { createHash } from "node:crypto";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import {
  getIntegrationCachedOrLoad,
  writeIntegrationCache,
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

/**
 * Einheitliche Cache-Logik für Marktplatz-Produktlisten-APIs (gleiche TTLs wie Orders).
 * `refresh=1` in der URL erzwingt Live-Fetch und schreibt den Cache neu.
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
  const fp = fingerprint(args.fingerprintParts);
  const cacheKey = `mp:products:v1:${args.marketplaceSlug}:${args.variant}:${fp}`;
  const source = `mp:products:${args.marketplaceSlug}`;
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();

  if (args.forceRefresh) {
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

  return getIntegrationCachedOrLoad({
    cacheKey,
    source,
    freshMs,
    staleMs,
    loader: args.loader,
  });
}

export function parseProductListForceRefresh(request: Request): boolean {
  const u = new URL(request.url);
  return u.searchParams.get("refresh") === "1";
}
