import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";

/** Richtungs-Indikator für Trend-KPI (UI). */
export type TrendDirection = "up" | "down" | "flat" | "unknown";

/** Platzhalter für fehlende Zahlenwerte in der Analytics-UI. */
export const PLACEHOLDER = "—";

/** Ein Punkt einer Sales-Zeitreihe (Tag). */
export type SalesPoint = {
  date: string;
  orders: number;
  amount: number;
  units: number;
};

/** Antwort-Schema der einzelnen `/api/{slug}/sales`-Endpoints (inkl. Vergleichszeitraum). */
export type SalesCompareResponse = {
  error?: string;
  summary?: {
    orderCount: number;
    salesAmount: number;
    units: number;
    currency: string;
    fbaUnits?: number;
  };
  previousSummary?: {
    orderCount: number;
    salesAmount: number;
    units: number;
    currency: string;
    fbaUnits?: number;
  };
  revenueDeltaPct?: number | null;
  netBreakdown?: {
    returnedAmount: number;
    cancelledAmount: number;
    returnsAmount: number;
    feesAmount: number;
    adSpendAmount: number;
    netAmount: number;
    feeSource: "api" | "configured_percentage" | "default_percentage";
    returnsSource: "api" | "status_based" | "none";
    costCoverage: "api" | "estimated" | "mixed";
  };
  previousNetBreakdown?: {
    returnedAmount: number;
    cancelledAmount: number;
    returnsAmount: number;
    feesAmount: number;
    adSpendAmount: number;
    netAmount: number;
    feeSource: "api" | "configured_percentage" | "default_percentage";
    returnsSource: "api" | "status_based" | "none";
    costCoverage: "api" | "estimated" | "mixed";
  };
  points?: SalesPoint[];
  previousPoints?: SalesPoint[];
};

/** Einheitliche Reihenfolge der Marktplätze im Detail-Dialog (Amazon zuerst, danach ANALYTICS_MARKETPLACES). */
export type MarketplaceDetailId =
  | "amazon"
  | (typeof ANALYTICS_MARKETPLACES)[number]["slug"];

export const MARKETPLACE_DETAIL_ORDER: MarketplaceDetailId[] = [
  "amazon",
  ...ANALYTICS_MARKETPLACES.map((m) => m.slug),
];

/** Logo-Slot-Presets für die Kacheln (unterschiedliche Seitenverhältnisse). */
export type MarketplaceTileLogoPreset =
  | "amazon"
  | "zooplus"
  | "compact"
  | "default"
  | "fressnapf"
  | "mediamarktSaturn"
  | "wide";

export const MARKETPLACE_TILE_LOGO: Record<
  MarketplaceTileLogoPreset,
  { slot: string; img: string }
> = {
  amazon: {
    slot: "flex h-[2.625rem] w-[min(100%,15rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.625rem] max-w-full object-contain object-left opacity-90",
  },
  zooplus: {
    slot: "flex h-11 w-[min(100%,17rem)] shrink-0 items-center justify-start",
    img: "max-h-11 max-w-full object-contain object-left",
  },
  compact: {
    slot: "flex h-6 w-[7rem] max-w-full shrink-0 items-center justify-start",
    img: "max-h-6 max-w-full object-contain object-left",
  },
  default: {
    slot: "flex h-7 w-36 max-w-full shrink-0 items-center justify-start",
    img: "max-h-7 max-w-full object-contain object-left",
  },
  fressnapf: {
    slot: "flex h-[2.25rem] w-[min(100%,14rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.25rem] max-w-full object-contain object-left",
  },
  mediamarktSaturn: {
    slot: "flex h-[2.875rem] w-[min(100%,19rem)] shrink-0 items-center justify-start",
    img: "max-h-[2.875rem] max-w-full object-contain object-left",
  },
  wide: {
    slot: "flex h-8 w-[min(100%,13rem)] shrink-0 items-center justify-start",
    img: "max-h-8 max-w-full object-contain object-left",
  },
};

/** Einheitliche Kachel-Größe wie Otto (kompakt). */
export const OTTO_TILE_LOGO = MARKETPLACE_TILE_LOGO.compact;

export const MARKETPLACE_TILE_GRID_CLASS = "grid gap-2 sm:grid-cols-2 xl:grid-cols-3";

export const MARKETPLACE_TILE_BTN_CLASS =
  "group flex h-full min-h-0 w-full flex-col rounded-lg border border-border/60 bg-card/90 p-2 text-left shadow-sm transition-all hover:border-primary/35 hover:shadow-md";

export const MARKETPLACE_TILE_KPI_GRID_CLASS = "mt-auto grid grid-cols-2 gap-1 pt-2";

export function placeholderTileLogoPreset(): Exclude<MarketplaceTileLogoPreset, "amazon"> {
  return "compact";
}
