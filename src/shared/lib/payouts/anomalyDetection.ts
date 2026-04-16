import type {
  PayoutAnomaly,
  PayoutOverview,
} from "./payoutTypes";

type Rule = {
  id: string;
  severity: PayoutAnomaly["severity"];
  check: (overview: PayoutOverview) => PayoutAnomaly[];
};

const RULES: Rule[] = [
  {
    id: "payout_ratio_low",
    severity: "warning",
    check: (o) => {
      if (o.totals.payoutRatio > 0 && o.totals.payoutRatio < 0.35) {
        return [{
          severity: "warning",
          messageKey: "payouts.anomaly.lowPayoutRatio",
          messageArgs: { ratio: Math.round(o.totals.payoutRatio * 100) },
        }];
      }
      return [];
    },
  },
  {
    id: "payout_ratio_drop",
    severity: "critical",
    check: (o) => {
      if (o.deltas && o.deltas.payoutRatio !== null && o.deltas.payoutRatio < -0.08) {
        return [{
          severity: "critical",
          messageKey: "payouts.anomaly.payoutRatioDrop",
          messageArgs: {
            drop: Math.round(Math.abs(o.deltas.payoutRatio) * 100),
          },
        }];
      }
      return [];
    },
  },
  {
    id: "high_return_rate",
    severity: "warning",
    check: (o) => {
      if (o.totals.returnRate > 0.15) {
        return [{
          severity: o.totals.returnRate > 0.30 ? "critical" : "warning",
          messageKey: "payouts.anomaly.highReturnRate",
          messageArgs: { rate: Math.round(o.totals.returnRate * 100) },
        }];
      }
      return [];
    },
  },
  {
    id: "revenue_drop",
    severity: "critical",
    check: (o) => {
      if (o.deltas?.grossSales !== null && o.deltas?.grossSales !== undefined && o.deltas.grossSales < -40) {
        return [{
          severity: "critical",
          messageKey: "payouts.anomaly.revenueDrop",
          messageArgs: { drop: Math.round(Math.abs(o.deltas.grossSales)) },
        }];
      }
      return [];
    },
  },
  {
    id: "product_high_returns",
    severity: "critical",
    check: (o) => {
      const anomalies: PayoutAnomaly[] = [];
      for (const row of o.rows) {
        if (!row.productBreakdown) continue;
        for (const p of row.productBreakdown) {
          if (p.units >= 5 && p.returns > 0) {
            const rate = p.returns / p.units;
            if (rate > 0.30) {
              anomalies.push({
                severity: "critical",
                messageKey: "payouts.anomaly.productHighReturns",
                messageArgs: {
                  sku: p.sku,
                  rate: Math.round(rate * 100),
                  cost: Math.round(p.refunds),
                },
                marketplace: row.marketplaceSlug,
                sku: p.sku,
              });
            }
          }
        }
      }
      return anomalies.slice(0, 5);
    },
  },
  {
    id: "hero_product",
    severity: "info",
    check: (o) => {
      const anomalies: PayoutAnomaly[] = [];
      for (const row of o.rows) {
        if (!row.productBreakdown) continue;
        for (const p of row.productBreakdown) {
          if (p.units >= 20 && p.returns === 0 && p.gross > 500) {
            anomalies.push({
              severity: "info",
              messageKey: "payouts.anomaly.heroProduct",
              messageArgs: {
                sku: p.sku,
                units: p.units,
                gross: Math.round(p.gross),
              },
              marketplace: row.marketplaceSlug,
              sku: p.sku,
            });
          }
        }
      }
      return anomalies.slice(0, 3);
    },
  },
];

export function detectAnomalies(overview: PayoutOverview): PayoutAnomaly[] {
  const all: PayoutAnomaly[] = [];
  for (const rule of RULES) {
    all.push(...rule.check(overview));
  }
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  all.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return all;
}
