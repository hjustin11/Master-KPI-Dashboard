import {
  addDaysToYmd,
  parseYmdToUtcNoon,
} from "@/shared/lib/xentralArticleForecastProject";
import type {
  ArticleForecastRuleScope,
  ArticleForecastRules,
} from "@/shared/lib/articleForecastRules";

export type ArticleForecastRow = {
  sku: string;
  name: string;
  stock: number;
  /** Bestand je Lagerplatz, falls die API liefert; sonst leeres Objekt. */
  stockByLocation: Record<string, number>;
  price: number | null;
  projectId: string | null;
  projectDisplay: string;
  totalSold: number;
  soldByProject: Record<string, number>;
};

export type ArticlesResponseMeta = {
  salesWindow?: {
    fromYmd: string;
    toYmd: string;
    deliveryNotesInWindow: number;
    lineItemsParsed: number;
    pagesFetched: number;
    stoppedEarly: boolean;
    hitSalesPageCap?: boolean;
    listOk: boolean;
    listStatus?: number;
    source?: "v3_delivery_notes" | "v1_delivery_notes";
    cacheDaysUsed?: number;
    liveWindowFromYmd?: string;
    liveWindowToYmd?: string;
  };
};

export type ProcurementLine = {
  sku: string;
  productName: string;
  amount: number;
  arrivalAtPort: string;
  notes: string;
};

export type ArticleForecastCachedPayload = {
  savedAt: number;
  fromYmd: string;
  toYmd: string;
  items: ArticleForecastRow[];
  meta: ArticlesResponseMeta | null;
  procurementLines?: ProcurementLine[];
};

export type XentralArticlesSeedPayload = {
  savedAt: number;
  items: Array<{
    sku: string;
    name: string;
    stock: number;
    stockByLocation?: Record<string, number>;
    price?: number | null;
    projectId?: string | null;
    projectDisplay?: string;
  }>;
};

export type ForecastStatus = "ok" | "low" | "critical";

export type ForecastResult = {
  dailySold: number;
  horizonYmd: string;
  projectedStockAtHorizon: number;
  inboundUntilHorizon: number;
  status: ForecastStatus;
};

export const MARKETPLACE_COLUMN_VISIBILITY_KEY = "articleForecast.marketplaceColumnVisibility";
export const WAREHOUSE_COLUMN_VISIBILITY_KEY = "articleForecast.warehouseColumnVisibility";
export const ARTICLE_FORECAST_CACHE_KEY = "article_forecast_cache_v2";
export const XENTRAL_ARTICLES_SEED_CACHE_KEY = "xentral_articles_cache_v5";
export const ARTICLE_FORECAST_RULE_SCOPE_KEY = "articleForecast.ruleScope";

export function readStoredMarketplaceVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MARKETPLACE_COLUMN_VISIBILITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    // Migration: "SHOPIFY" → "Shopify" (mapping corrected 2026-04)
    if (out["SHOPIFY"] !== undefined && out["Shopify"] === undefined) {
      out["Shopify"] = out["SHOPIFY"];
      delete out["SHOPIFY"];
    }
    return out;
  } catch {
    return {};
  }
}

export function readStoredWarehouseVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(WAREHOUSE_COLUMN_VISIBILITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function readStoredRuleScope(): ArticleForecastRuleScope {
  if (typeof window === "undefined") return "temporary";
  try {
    const raw = localStorage.getItem(ARTICLE_FORECAST_RULE_SCOPE_KEY);
    if (raw === "fixed" || raw === "temporary") return raw;
  } catch {
    /* ignore */
  }
  return "temporary";
}

export function normalizeSkuKey(sku: string): string {
  return sku.trim().toLowerCase();
}

export function computeForecast(args: {
  rules: ArticleForecastRules;
  soldInWindow: number;
  stockNow: number;
  fromYmd: string;
  toYmd: string;
  inboundUntilHorizon: number;
}): ForecastResult {
  // Tatsächliche Tage aus Datumsbereich statt Rules — vermeidet Race-Condition
  // zwischen manueller Datums-Änderung und useEffect-Sync der salesWindowDays.
  const fromTs = parseYmdToUtcNoon(args.fromYmd);
  const toTs = parseYmdToUtcNoon(args.toYmd);
  const actualDays =
    fromTs != null && toTs != null && toTs >= fromTs
      ? Math.round((toTs - fromTs) / 86400000) + 1
      : args.rules.salesWindowDays;
  const windowDays = Math.max(1, actualDays);
  const dailySold = Math.max(0, args.soldInWindow) / windowDays;
  const horizonYmd = addDaysToYmd(args.toYmd, args.rules.projectionDays);
  const inbound = args.rules.includeInboundProcurement ? args.inboundUntilHorizon : 0;
  const projectedStockAtHorizon = args.stockNow + inbound - dailySold * args.rules.projectionDays;

  let status: ForecastStatus = "ok";
  if (projectedStockAtHorizon < args.rules.criticalStockThreshold) {
    status = "critical";
  } else if (projectedStockAtHorizon < args.rules.lowStockThreshold) {
    status = "low";
  }

  return {
    dailySold,
    horizonYmd,
    projectedStockAtHorizon,
    inboundUntilHorizon: inbound,
    status,
  };
}

export function sumStockForVisibleLocations(
  row: ArticleForecastRow,
  visibleLocationKeys: string[],
  allLocationKeys: string[]
): number {
  const byLoc = row.stockByLocation ?? {};
  if (Object.keys(byLoc).length === 0) {
    return Number.isFinite(row.stock) ? row.stock : 0;
  }
  if (visibleLocationKeys.length === 0 && allLocationKeys.length > 0) {
    return Number.isFinite(row.stock) ? row.stock : 0;
  }
  return visibleLocationKeys.reduce((acc, k) => acc + (byLoc[k] ?? 0), 0);
}
