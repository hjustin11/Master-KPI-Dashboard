/**
 * Artikelliste inkrementell: API-Zeilen gewinnen bei gleicher SKU, bisher geladene SKUs bleiben erhalten.
 */
export function mergeXentralArticleLists<T extends { sku: string }>(previous: T[], fresh: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of fresh) {
    const k = row.sku.trim().toLowerCase();
    if (!k) continue;
    out.push(row);
    seen.add(k);
  }
  for (const p of previous) {
    const k = p.sku.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    out.push(p);
    seen.add(k);
  }
  return out;
}
