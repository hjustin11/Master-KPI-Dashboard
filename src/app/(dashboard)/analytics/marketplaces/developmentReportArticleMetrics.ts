import type { MarketplaceArticleSalesRow } from "@/shared/lib/marketplaceArticleLines";

export type DevelopmentArticleMetric = {
  key: string;
  title: string;
  unitsCurrent: number;
  unitsDeltaAbs: number;
  unitsDeltaPct: number | null;
  revenueCurrent: number;
  revenueDeltaAbs: number;
  revenueDeltaPct: number | null;
  avgPriceCurrent: number | null;
};

export function buildDevelopmentArticleMetrics(rows: MarketplaceArticleSalesRow[]): DevelopmentArticleMetric[] {
  return rows.map((row) => {
    const unitsDeltaAbs = row.unitsCurrent - row.unitsPrevious;
    const revenueDeltaAbs = row.revenueCurrent - row.revenuePrevious;
    const revenueDeltaPct =
      row.revenuePrevious > 0 ? Number((((row.revenueCurrent - row.revenuePrevious) / row.revenuePrevious) * 100).toFixed(1)) : null;
    return {
      key: row.key,
      title: row.title,
      unitsCurrent: row.unitsCurrent,
      unitsDeltaAbs,
      unitsDeltaPct: row.unitsDeltaPct,
      revenueCurrent: row.revenueCurrent,
      revenueDeltaAbs,
      revenueDeltaPct,
      avgPriceCurrent: row.avgPriceCurrent,
    };
  });
}

export function sortDevelopmentArticleMetrics(
  rows: DevelopmentArticleMetric[],
  metric: "units" | "revenue"
): DevelopmentArticleMetric[] {
  const list = [...rows];
  if (metric === "units") {
    list.sort((a, b) => b.unitsCurrent - a.unitsCurrent || b.revenueCurrent - a.revenueCurrent);
  } else {
    list.sort((a, b) => b.revenueCurrent - a.revenueCurrent || b.unitsCurrent - a.unitsCurrent);
  }
  return list;
}
