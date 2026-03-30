const STORAGE_PREFIX = "master-dashboard:marketplace-action-bands:";
const GLOBAL_PROMOTION_DEALS_KEY = "master-dashboard:promotion-deals:v1";
const LEGACY_MIGRATION_FLAG = "master-dashboard:promotion-deals-migrated";

export type MarketplaceActionBand = {
  id: string;
  label: string;
  from: string;
  to: string;
  color: string;
};

/** Erweiterung: optionaler Marktplatz; null = alle Kanäle (Gesamtgrafik + alle Detailgrafiken). */
export type PromotionDeal = MarketplaceActionBand & {
  marketplaceSlug: string | null;
};

const PRESET_COLORS = [
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#eab308",
  "#ec4899",
  "#22c55e",
  "#3b82f6",
] as const;

function keyFor(marketplaceId: string) {
  return `${STORAGE_PREFIX}${marketplaceId}`;
}

function isValidBand(x: unknown): x is MarketplaceActionBand {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.from === "string" &&
    typeof o.to === "string" &&
    typeof o.color === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.to)
  );
}

export function isValidPromotionDeal(x: unknown): x is PromotionDeal {
  if (!isValidBand(x)) return false;
  const o = x as Record<string, unknown>;
  const s = o.marketplaceSlug;
  if (s === undefined || s === null) return true;
  return typeof s === "string";
}

export function loadBands(marketplaceId: string): MarketplaceActionBand[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(marketplaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidBand);
  } catch {
    return [];
  }
}

export function saveBands(marketplaceId: string, bands: MarketplaceActionBand[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(keyFor(marketplaceId), JSON.stringify(bands));
  } catch {
    /* Quota / private mode */
  }
}

function normalizeDeal(x: unknown): PromotionDeal | null {
  if (!isValidBand(x)) return null;
  const o = x as Record<string, unknown>;
  const slug = o.marketplaceSlug;
  const marketplaceSlug =
    slug === undefined || slug === null ? null : typeof slug === "string" ? slug : null;
  return {
    id: o.id as string,
    label: o.label as string,
    from: o.from as string,
    to: o.to as string,
    color: o.color as string,
    marketplaceSlug,
  };
}

export function loadPromotionDeals(): PromotionDeal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GLOBAL_PROMOTION_DEALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeDeal).filter((d): d is PromotionDeal => d !== null);
  } catch {
    return [];
  }
}

export function savePromotionDeals(deals: PromotionDeal[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GLOBAL_PROMOTION_DEALS_KEY, JSON.stringify(deals));
  } catch {
    /* Quota / private mode */
  }
}

/** Einmalig: alte pro-Marktplatz-Bände in globale Deals mit marketplaceSlug übernehmen. */
export function migrateLegacyBandsToGlobalIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG)) return;
    const existing = loadPromotionDeals();
    if (existing.length > 0) {
      localStorage.setItem(LEGACY_MIGRATION_FLAG, "1");
      return;
    }
    const slugs = [
      "amazon",
      "otto",
      "ebay",
      "kaufland",
      "fressnapf",
      "mediamarkt-saturn",
      "zooplus",
      "tiktok",
      "shopify",
    ];
    const merged: PromotionDeal[] = [];
    for (const slug of slugs) {
      for (const b of loadBands(slug)) {
        merged.push({
          ...b,
          marketplaceSlug: slug === "amazon" ? "amazon" : slug,
        });
      }
    }
    if (merged.length) {
      savePromotionDeals(merged);
    }
    localStorage.setItem(LEGACY_MIGRATION_FLAG, "1");
  } catch {
    /* ignore */
  }
}

export function bandsForTotalChart(deals: PromotionDeal[]): MarketplaceActionBand[] {
  return deals
    .filter((d) => d.marketplaceSlug === null)
    .map(({ id, label, from, to, color }) => ({ id, label, from, to, color }));
}

export function bandsForMarketplaceChart(
  deals: PromotionDeal[],
  marketplaceId: string
): MarketplaceActionBand[] {
  return deals
    .filter((d) => d.marketplaceSlug === null || d.marketplaceSlug === marketplaceId)
    .map(({ id, label, from, to, color }) => ({ id, label, from, to, color }));
}

export function nextBandColor(bands: MarketplaceActionBand[]): string {
  const used = new Set(bands.map((b) => b.color.toLowerCase()));
  for (const c of PRESET_COLORS) {
    if (!used.has(c)) return c;
  }
  return PRESET_COLORS[bands.length % PRESET_COLORS.length]!;
}

export function clipBandToRange(
  band: MarketplaceActionBand,
  periodFrom: string,
  periodTo: string
): { x1: string; x2: string } | null {
  const x1 = band.from < periodFrom ? periodFrom : band.from;
  const x2 = band.to > periodTo ? periodTo : band.to;
  if (x1 > x2) return null;
  return { x1, x2 };
}

/** Für Gesamtgrafik (numerische X-Achse = Index). */
export function bandToXIndexRange(
  band: MarketplaceActionBand,
  periodFrom: string,
  periodTo: string,
  dates: string[]
): { x1: number; x2: number } | null {
  const clipped = clipBandToRange(band, periodFrom, periodTo);
  if (!clipped) return null;
  const i1 = dates.findIndex((d) => d >= clipped.x1);
  if (i1 < 0) return null;
  let i2 = dates.length - 1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i]! <= clipped.x2) {
      i2 = i;
      break;
    }
  }
  if (i1 > i2) return null;
  return { x1: i1, x2: i2 };
}
