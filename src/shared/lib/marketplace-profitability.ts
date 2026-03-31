import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";

export type CostCoverage = "api" | "estimated" | "mixed";
export type FeeSource = "api" | "configured_percentage" | "default_percentage";
export type ReturnsSource = "api" | "status_based" | "none";

export type MarketplaceId =
  | "amazon"
  | "ebay"
  | "otto"
  | "kaufland"
  | "fressnapf"
  | "mediamarkt-saturn"
  | "zooplus"
  | "tiktok"
  | "shopify";

export type MarketplaceFeePolicy = {
  percent: number;
  fixedPerOrder: number;
  source: Exclude<FeeSource, "api">;
};

export type NetBreakdown = {
  returnedAmount: number;
  cancelledAmount: number;
  returnsAmount: number;
  feesAmount: number;
  adSpendAmount: number;
  netAmount: number;
  feeSource: FeeSource;
  returnsSource: ReturnsSource;
  costCoverage: CostCoverage;
};

const MARKETPLACE_FEE_DEFAULTS: Record<MarketplaceId, number> = {
  amazon: 15,
  ebay: 12,
  otto: 14,
  kaufland: 12,
  fressnapf: 10,
  "mediamarkt-saturn": 10,
  zooplus: 10,
  tiktok: 9,
  shopify: 2,
};

function toConfigKey(id: MarketplaceId): string {
  return id.toUpperCase().replace(/-/g, "_");
}

function toNumber(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const normalized = raw.replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function classifyOrderStatus(rawStatus: unknown): "returned" | "cancelled" | "other" {
  const status = String(rawStatus ?? "").toLowerCase().trim();
  if (!status) return "other";
  if (
    status.includes("return") ||
    status.includes("refund") ||
    status.includes("retoure") ||
    status.includes("erstatt") ||
    status.includes("rueck") ||
    status.includes("rück") ||
    status.includes("chargeback") ||
    status.includes("rma")
  ) {
    return "returned";
  }
  if (
    status.includes("cancel") ||
    status.includes("canceled") ||
    status.includes("storno") ||
    status.includes("void") ||
    status.includes("abbruch") ||
    status.includes("abgebroch") ||
    status.includes("declin") ||
    status.includes("failed")
  ) {
    return "cancelled";
  }
  return "other";
}

export async function getMarketplaceFeePolicy(id: MarketplaceId): Promise<MarketplaceFeePolicy> {
  const suffix = toConfigKey(id);
  const percentRaw = await getIntegrationSecretValue(`MARKETPLACE_FEE_${suffix}_PERCENT`);
  const fixedRaw = await getIntegrationSecretValue(`MARKETPLACE_FEE_${suffix}_FIXED_PER_ORDER`);
  const defaultPercentRaw = await getIntegrationSecretValue("MARKETPLACE_FEE_DEFAULT_PERCENT");

  const configuredPercent = toNumber(percentRaw);
  const defaultPercent = toNumber(defaultPercentRaw);
  const percent =
    configuredPercent > 0
      ? configuredPercent
      : defaultPercent > 0
        ? defaultPercent
        : MARKETPLACE_FEE_DEFAULTS[id];

  return {
    percent: Math.max(0, percent),
    fixedPerOrder: Math.max(0, toNumber(fixedRaw)),
    source: configuredPercent > 0 ? "configured_percentage" : "default_percentage",
  };
}

export function estimateMarketplaceFeeAmount(args: {
  salesAmount: number;
  orderCount: number;
  policy: MarketplaceFeePolicy;
}): { feesAmount: number; feeSource: Exclude<FeeSource, "api"> } {
  const pctAmount = (Math.max(0, args.salesAmount) * Math.max(0, args.policy.percent)) / 100;
  const fixedAmount = Math.max(0, args.orderCount) * Math.max(0, args.policy.fixedPerOrder);
  return {
    feesAmount: round2(pctAmount + fixedAmount),
    feeSource: args.policy.source,
  };
}

export function buildNetBreakdown(args: {
  salesAmount: number;
  returnedAmount: number;
  cancelledAmount: number;
  feesAmount: number;
  adSpendAmount?: number;
  feeSource: FeeSource;
  returnsSource: ReturnsSource;
}): NetBreakdown {
  const returnedAmount = round2(Math.max(0, args.returnedAmount));
  const cancelledAmount = round2(Math.max(0, args.cancelledAmount));
  const returnsAmount = round2(returnedAmount + cancelledAmount);
  const feesAmount = round2(Math.max(0, args.feesAmount));
  const adSpendAmount = round2(Math.max(0, args.adSpendAmount ?? 0));
  const netAmount = round2(Math.max(0, args.salesAmount) - returnsAmount - feesAmount - adSpendAmount);

  let costCoverage: CostCoverage = "estimated";
  if (args.feeSource === "api" && args.returnsSource === "api") {
    costCoverage = "api";
  } else if (
    (args.feeSource === "api" && args.returnsSource === "status_based") ||
    (args.feeSource !== "api" && args.returnsSource !== "none")
  ) {
    costCoverage = "mixed";
  }

  return {
    returnedAmount,
    cancelledAmount,
    returnsAmount,
    feesAmount,
    adSpendAmount,
    netAmount,
    feeSource: args.feeSource,
    returnsSource: args.returnsSource,
    costCoverage,
  };
}

export function sumStatusAmounts<T>(args: {
  items: T[];
  getStatus: (item: T) => unknown;
  getAmount: (item: T) => unknown;
}): { returnedAmount: number; cancelledAmount: number; returnsSource: ReturnsSource } {
  let returnedAmount = 0;
  let cancelledAmount = 0;
  for (const item of args.items) {
    const amount = Math.max(0, toNumber(args.getAmount(item)));
    if (amount <= 0) continue;
    const bucket = classifyOrderStatus(args.getStatus(item));
    if (bucket === "returned") returnedAmount += amount;
    if (bucket === "cancelled") cancelledAmount += amount;
  }
  return {
    returnedAmount: round2(returnedAmount),
    cancelledAmount: round2(cancelledAmount),
    returnsSource: returnedAmount > 0 || cancelledAmount > 0 ? "status_based" : "none",
  };
}
