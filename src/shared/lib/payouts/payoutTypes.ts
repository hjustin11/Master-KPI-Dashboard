export type PayoutRow = {
  id: string;
  marketplaceSlug: string;
  periodFrom: string;
  periodTo: string;
  settlementId: string | null;
  grossSales: number;
  refundsAmount: number;
  refundsFeesReturned: number;
  marketplaceFees: number;
  fulfillmentFees: number;
  advertisingFees: number;
  shippingFees: number;
  promotionDiscounts: number;
  otherFees: number;
  otherFeesBreakdown: Record<string, number> | null;
  reserveAmount: number;
  netPayout: number;
  ordersCount: number;
  returnsCount: number;
  unitsSold: number;
  payoutRatio: number;
  returnRate: number;
  acos: number | null;
  tacos: number | null;
  productBreakdown: PayoutProductEntry[] | null;
  currency: string;
  fetchedAt: string;
};

export type PayoutProductEntry = {
  sku: string;
  asin?: string;
  title?: string;
  gross: number;
  fees: number;
  refunds: number;
  ads: number;
  net: number;
  units: number;
  returns: number;
};

export type PayoutOverview = {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string } | null;
  marketplaces: string[];
  totals: PayoutTotals;
  previousTotals: PayoutTotals | null;
  deltas: PayoutDeltas | null;
  rows: PayoutRow[];
  previousRows: PayoutRow[];
};

export type PayoutTotals = {
  grossSales: number;
  refundsAmount: number;
  marketplaceFees: number;
  fulfillmentFees: number;
  advertisingFees: number;
  shippingFees: number;
  promotionDiscounts: number;
  otherFees: number;
  netPayout: number;
  ordersCount: number;
  returnsCount: number;
  unitsSold: number;
  payoutRatio: number;
  returnRate: number;
  aov: number;
  tacos: number;
  totalFees: number;
};

export type PayoutDeltas = {
  grossSales: number | null;
  netPayout: number | null;
  payoutRatio: number;
  returnRate: number;
  ordersCount: number | null;
  refundsAmount: number | null;
  advertisingFees: number | null;
  aov: number | null;
  tacos: number;
};

export type PayoutAnomaly = {
  severity: "critical" | "warning" | "info";
  messageKey: string;
  messageArgs: Record<string, string | number>;
  marketplace?: string;
  sku?: string;
};
