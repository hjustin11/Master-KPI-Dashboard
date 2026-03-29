export type ArticleForecastRuleScope = "fixed" | "temporary";

export type ArticleForecastRules = {
  salesWindowDays: number;
  projectionDays: number;
  lowStockThreshold: number;
  criticalStockThreshold: number;
  includeInboundProcurement: boolean;
};

export type ArticleForecastRulesByScope = {
  fixed: ArticleForecastRules;
  temporary: ArticleForecastRules;
};

export const DEFAULT_ARTICLE_FORECAST_RULES: ArticleForecastRules = {
  salesWindowDays: 90,
  projectionDays: 90,
  lowStockThreshold: 25,
  criticalStockThreshold: 0,
  includeInboundProcurement: true,
};

const MIN_DAYS = 1;
const MAX_DAYS = 366;
const MIN_THRESHOLD = -100000;
const MAX_THRESHOLD = 1000000;

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  const y = Math.round(x);
  return Math.min(max, Math.max(min, y));
}

function clampNumber(n: unknown, fallback: number, min: number, max: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, x));
}

export function sanitizeArticleForecastRules(
  raw: Partial<ArticleForecastRules> | null | undefined
): ArticleForecastRules {
  const base = DEFAULT_ARTICLE_FORECAST_RULES;
  return {
    salesWindowDays: clampInt(raw?.salesWindowDays, base.salesWindowDays, MIN_DAYS, MAX_DAYS),
    projectionDays: clampInt(raw?.projectionDays, base.projectionDays, MIN_DAYS, MAX_DAYS),
    lowStockThreshold: clampNumber(
      raw?.lowStockThreshold,
      base.lowStockThreshold,
      MIN_THRESHOLD,
      MAX_THRESHOLD
    ),
    criticalStockThreshold: clampNumber(
      raw?.criticalStockThreshold,
      base.criticalStockThreshold,
      MIN_THRESHOLD,
      MAX_THRESHOLD
    ),
    includeInboundProcurement:
      typeof raw?.includeInboundProcurement === "boolean"
        ? raw.includeInboundProcurement
        : base.includeInboundProcurement,
  };
}

export function sanitizeArticleForecastRulesByScope(
  raw: Partial<ArticleForecastRulesByScope> | null | undefined
): ArticleForecastRulesByScope {
  return {
    fixed: sanitizeArticleForecastRules(raw?.fixed),
    temporary: sanitizeArticleForecastRules(raw?.temporary),
  };
}
