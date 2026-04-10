import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

function rowKeyFromParts(sku: string, secondaryId: string): string {
  return `${sku.trim().toLowerCase()}\0${secondaryId.trim().toLowerCase()}`;
}

function productRowKey(row: MarketplaceProductListRow): string {
  return rowKeyFromParts(row.sku, row.secondaryId);
}

/**
 * Dedupliziert nach SKU + secondaryId (trim, lowercase); erste Zeile gewinnt.
 * Für API-/Cache-Payloads und Client-Merge gleiche Identität wie `marketplaceProductRowId`.
 */
export function dedupeMarketplaceRowsBySkuAndSecondary<
  T extends { sku: string; secondaryId: string },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const k = rowKeyFromParts(row.sku, row.secondaryId);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/** Stabile Zeilen-ID für Tabellen (`getRowId`) — gleiche Logik wie Deduplizierung in `mergeMarketplaceProductClientLists`. */
export function marketplaceProductRowId(row: MarketplaceProductListRow): string {
  return productRowKey(row);
}

/** Frische API-Zeilen gewinnen; bisherige SKUs bleiben erhalten (kein Leeren bei Refresh). */
export function mergeMarketplaceProductClientLists(
  previous: MarketplaceProductListRow[],
  fresh: MarketplaceProductListRow[]
): MarketplaceProductListRow[] {
  const seen = new Set<string>();
  const out: MarketplaceProductListRow[] = [];
  for (const row of fresh) {
    const k = productRowKey(row);
    if (seen.has(k)) continue;
    out.push(row);
    seen.add(k);
  }
  for (const p of previous) {
    const k = productRowKey(p);
    if (seen.has(k)) continue;
    out.push(p);
    seen.add(k);
  }
  return out;
}

