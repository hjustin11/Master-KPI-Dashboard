"use client";

import {
  PLACEHOLDER,
  type TrendDirection,
} from "@/shared/lib/marketplace-sales-types";
import {
  formatCurrency,
  formatDeltaPct,
  formatInt,
  kpiLabelsForPeriod,
  trendFromDelta,
} from "@/shared/lib/marketplace-analytics-utils";
import { MiniKpi } from "./MiniKpi";

export function MarketplaceTileKpis({
  summary,
  previousSummary,
  trend,
  periodKpis,
  intlTag,
}: {
  summary: { salesAmount: number; orderCount: number; units: number; currency: string };
  previousSummary?: { salesAmount: number; orderCount: number; units: number; currency: string } | null;
  trend: { text: string; direction: TrendDirection };
  periodKpis: ReturnType<typeof kpiLabelsForPeriod>;
  intlTag: string;
}) {
  const ps = previousSummary;
  const fc = (a: number, c: string) => formatCurrency(a, c, intlTag);
  const fi = (n: number) => formatInt(n, intlTag);
  const curAov = summary.orderCount > 0 ? summary.salesAmount / summary.orderCount : 0;
  return (
    <div className="mt-auto grid grid-cols-2 gap-1 pt-2">
      <MiniKpi
        compact
        label={periodKpis.revenue}
        value={fc(summary.salesAmount, summary.currency)}
        trendDirection={trend.direction}
        deltaPct={ps ? formatDeltaPct(summary.salesAmount, ps.salesAmount, intlTag) : undefined}
      />
      <MiniKpi
        compact
        label={periodKpis.orders}
        value={fi(summary.orderCount)}
        trendDirection={ps ? trendFromDelta(summary.orderCount, ps.orderCount) : "unknown"}
        deltaPct={ps ? formatDeltaPct(summary.orderCount, ps.orderCount, intlTag) : undefined}
      />
      <MiniKpi
        compact
        label={periodKpis.units}
        value={fi(summary.units)}
        trendDirection={ps ? trendFromDelta(summary.units, ps.units) : "unknown"}
        deltaPct={ps ? formatDeltaPct(summary.units, ps.units, intlTag) : undefined}
      />
      <MiniKpi
        compact
        label={periodKpis.trend}
        value={trend.text}
        trendDirection={trend.direction}
      />
      <MiniKpi
        compact
        label="Ø Bestellwert"
        value={summary.orderCount > 0 ? fc(curAov, summary.currency) : PLACEHOLDER}
      />
      <MiniKpi
        compact
        label="Umsatz / Einheit"
        value={summary.units > 0 ? fc(summary.salesAmount / summary.units, summary.currency) : PLACEHOLDER}
      />
    </div>
  );
}
