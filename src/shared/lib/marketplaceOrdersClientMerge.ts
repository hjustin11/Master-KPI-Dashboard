/** Clientseitig: Bestellungen über Zeitraum-Wechsel/Aktualisieren zusammenführen (kein Leeren der Tabelle). */

export type MarketplaceOrderMergeRow = {
  orderId: string;
  purchaseDate: string;
};

export function marketplaceOrderMergeKey(row: MarketplaceOrderMergeRow): string {
  const id = row.orderId.trim().toLowerCase();
  if (id) return id;
  return row.purchaseDate.trim();
}

export function mergeMarketplaceOrderLists<T extends MarketplaceOrderMergeRow>(previous: T[], fresh: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of fresh) {
    out.push(row);
    seen.add(marketplaceOrderMergeKey(row));
  }
  for (const p of previous) {
    const k = marketplaceOrderMergeKey(p);
    if (seen.has(k)) continue;
    out.push(p);
    seen.add(k);
  }
  return out.sort((a, b) => {
    const tb = new Date(b.purchaseDate).getTime();
    const ta = new Date(a.purchaseDate).getTime();
    if (tb !== ta) return tb - ta;
    return marketplaceOrderMergeKey(b).localeCompare(marketplaceOrderMergeKey(a));
  });
}

/** Filter auf Kalendertag yyyy-mm-dd (aus ISO purchaseDate). */
export function filterMarketplaceOrdersByYmdRange<T extends MarketplaceOrderMergeRow>(
  rows: T[],
  fromYmd: string,
  toYmd: string
): T[] {
  if (!fromYmd && !toYmd) return rows;
  return rows.filter((row) => {
    const ymd = row.purchaseDate?.slice(0, 10) ?? "";
    if (!ymd) return false;
    if (fromYmd && ymd < fromYmd) return false;
    if (toYmd && ymd > toYmd) return false;
    return true;
  });
}
