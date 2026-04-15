"use client";

import { useMemo } from "react";
import {
  addDaysToYmd,
  parseYmdToUtcNoon,
} from "@/shared/lib/xentralArticleForecastProject";
import { isProcurementProductLine } from "@/shared/lib/procurement/procurementAggregation";
import type { ArticleForecastRules } from "@/shared/lib/articleForecastRules";
import {
  computeForecast,
  normalizeSkuKey,
  sumStockForVisibleLocations,
  type ArticleForecastRow,
  type ForecastResult,
  type ProcurementLine,
} from "@/shared/lib/article-forecast-utils";

export default function useArticleForecastComputed(params: {
  rows: ArticleForecastRow[];
  procurementLines: ProcurementLine[];
  activeRules: ArticleForecastRules;
  fromYmd: string;
  toYmd: string;
  visibleWarehouseColumns: string[];
  warehouseColumns: string[];
}): {
  inboundBySkuUntilHorizon: Map<string, number>;
  forecastBySku: Map<string, ForecastResult>;
  rowClassBySku: Map<string, string>;
} {
  const {
    rows,
    procurementLines,
    activeRules,
    fromYmd,
    toYmd,
    visibleWarehouseColumns,
    warehouseColumns,
  } = params;

  const inboundBySkuUntilHorizon = useMemo(() => {
    const out = new Map<string, number>();
    const horizonTs = parseYmdToUtcNoon(addDaysToYmd(toYmd, activeRules.projectionDays));
    if (horizonTs == null) return out;
    for (const line of procurementLines) {
      if (!isProcurementProductLine(line)) continue;
      if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
      const ts = parseYmdToUtcNoon(line.arrivalAtPort);
      if (ts == null || ts > horizonTs) continue;
      const key = normalizeSkuKey(line.sku);
      if (!key) continue;
      out.set(key, (out.get(key) ?? 0) + line.amount);
    }
    return out;
  }, [activeRules.projectionDays, procurementLines, toYmd]);

  const forecastBySku = useMemo(() => {
    const out = new Map<string, ForecastResult>();
    for (const row of rows) {
      const soldInWindow = Number.isFinite(row.totalSold) ? row.totalSold : 0;
      const stockNow = sumStockForVisibleLocations(row, visibleWarehouseColumns, warehouseColumns);
      const inboundUntilHorizon = inboundBySkuUntilHorizon.get(normalizeSkuKey(row.sku)) ?? 0;
      const result = computeForecast({
        rules: activeRules,
        soldInWindow,
        stockNow,
        fromYmd,
        toYmd,
        inboundUntilHorizon,
      });
      /**
       * Keine Ampel nach Bestandsschwellen, wenn im gewählten Verkaufsfenster kein Absatz erkennbar ist:
       * „0 verkauft, beliebiger Bestand ≥ 0" → ok. Negative Bestände (< 0) weiterhin kritisch.
       */
      const suppressThresholdAmpel = soldInWindow === 0 && stockNow >= 0;
      out.set(
        normalizeSkuKey(row.sku),
        suppressThresholdAmpel ? { ...result, status: "ok" as const } : result
      );
    }
    return out;
  }, [activeRules, fromYmd, inboundBySkuUntilHorizon, rows, toYmd, visibleWarehouseColumns, warehouseColumns]);

  const rowClassBySku = useMemo(() => {
    const out = new Map<string, string>();
    for (const [sku, forecast] of forecastBySku.entries()) {
      if (forecast.status === "critical") {
        out.set(sku, "bg-red-500/10 hover:!bg-red-500/15");
      } else if (forecast.status === "low") {
        out.set(sku, "bg-orange-500/10 hover:!bg-orange-500/15");
      }
    }
    return out;
  }, [forecastBySku]);

  return { inboundBySkuUntilHorizon, forecastBySku, rowClassBySku };
}
