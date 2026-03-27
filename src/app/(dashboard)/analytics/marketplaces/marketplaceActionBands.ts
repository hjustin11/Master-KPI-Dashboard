const STORAGE_PREFIX = "master-dashboard:marketplace-action-bands:";

export type MarketplaceActionBand = {
  id: string;
  label: string;
  from: string;
  to: string;
  color: string;
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
