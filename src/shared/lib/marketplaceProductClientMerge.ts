import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

function productRowKey(row: MarketplaceProductListRow): string {
  return `${row.sku.trim().toLowerCase()}\0${row.secondaryId.trim().toLowerCase()}`;
}

/** Frische API-Zeilen gewinnen; bisherige SKUs bleiben erhalten (kein Leeren bei Refresh). */
export function mergeMarketplaceProductClientLists(
  previous: MarketplaceProductListRow[],
  fresh: MarketplaceProductListRow[]
): MarketplaceProductListRow[] {
  const seen = new Set<string>();
  const out: MarketplaceProductListRow[] = [];
  for (const row of fresh) {
    out.push(row);
    seen.add(productRowKey(row));
  }
  for (const p of previous) {
    const k = productRowKey(p);
    if (seen.has(k)) continue;
    out.push(p);
    seen.add(k);
  }
  return out;
}
