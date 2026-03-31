export const MAX_ANALYTICS_RANGE_DAYS = 366;

export type CompareMode = "previous" | "yoy";

function safeShiftUtcYear(ms: number, deltaYears: number): number {
  const d = new Date(ms);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  if (d.getUTCMonth() !== month) {
    d.setUTCDate(0);
  }
  return d.getTime();
}

export function resolveComparisonPreviousRange(
  currentStartMs: number,
  currentEndMs: number,
  mode: CompareMode
): { prevStartMs: number; prevEndMs: number } {
  if (mode === "yoy") {
    return {
      prevStartMs: safeShiftUtcYear(currentStartMs, -1),
      prevEndMs: safeShiftUtcYear(currentEndMs, -1),
    };
  }
  const len = currentEndMs - currentStartMs;
  return {
    prevStartMs: currentStartMs - len,
    prevEndMs: currentStartMs,
  };
}

export type NetBreakdown = {
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

export function buildPartialNetBreakdown(salesAmount: number): NetBreakdown {
  return {
    returnedAmount: 0,
    cancelledAmount: 0,
    returnsAmount: 0,
    feesAmount: 0,
    adSpendAmount: 0,
    netAmount: Number(salesAmount.toFixed(2)),
    feeSource: "default_percentage",
    returnsSource: "none",
    costCoverage: "estimated",
  };
}
