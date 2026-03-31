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
  returnsAmount: number;
  feesAmount: number;
  adSpendAmount: number;
  netAmount: number;
  costCoverage: "partial";
};

export function buildPartialNetBreakdown(salesAmount: number): NetBreakdown {
  return {
    returnsAmount: 0,
    feesAmount: 0,
    adSpendAmount: 0,
    netAmount: Number(salesAmount.toFixed(2)),
    costCoverage: "partial",
  };
}
