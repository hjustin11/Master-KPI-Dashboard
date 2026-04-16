import type {
  CrossListingImageEntry,
  CrossListingSourceMap,
  CrossListingSourceSlug,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";

/**
 * Reihenfolge, in der Quellen ihre Bilder in den Pool einspielen.
 * Ziel-Marktplatz wird ausgeschlossen (existiert noch nicht).
 */
const POOL_ORDER: readonly CrossListingSourceSlug[] = [
  "amazon", "shopify", "otto", "ebay", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn", "tiktok", "xentral",
];

export function buildImagePool(
  sources: CrossListingSourceMap,
  target: CrossListingTargetSlug,
  opts: { maxItems?: number; preselect?: boolean } = {}
): CrossListingImageEntry[] {
  const maxItems = opts.maxItems ?? Infinity;
  const preselect = opts.preselect !== false;
  const seen = new Set<string>();
  const out: CrossListingImageEntry[] = [];

  for (const slug of POOL_ORDER) {
    if (slug === target) continue;
    const rec = sources[slug];
    if (!rec) continue;
    rec.images.forEach((rawUrl, i) => {
      const url = rawUrl.trim();
      if (!url || seen.has(url)) return;
      if (out.length >= maxItems) return;
      seen.add(url);
      out.push({ url, source: slug, index: i + 1, selected: preselect });
    });
  }
  return out;
}

export function mergeExistingImagesIntoPool(
  pool: CrossListingImageEntry[],
  existingUrls: readonly string[]
): CrossListingImageEntry[] {
  const known = new Set(pool.map((e) => e.url));
  const merged = [...pool];
  existingUrls.forEach((raw, i) => {
    const url = raw.trim();
    if (!url || known.has(url)) return;
    merged.push({ url, source: "manual", index: i + 1, selected: true });
    known.add(url);
  });
  // Existing URL-Einträge, die schon im Pool sind, sollten als selected gelten.
  const existingSet = new Set(existingUrls.map((u) => u.trim()).filter(Boolean));
  return merged.map((e) => (existingSet.size > 0 && existingSet.has(e.url) ? { ...e, selected: true } : e));
}

export function selectedImageUrls(pool: readonly CrossListingImageEntry[]): string[] {
  return pool.filter((e) => e.selected).map((e) => e.url);
}
