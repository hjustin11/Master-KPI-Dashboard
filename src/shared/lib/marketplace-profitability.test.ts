import { describe, it, expect } from "vitest";
import {
  classifyOrderStatus,
  estimateMarketplaceFeeAmount,
  buildNetBreakdown,
} from "./marketplace-profitability";

describe("classifyOrderStatus", () => {
  it("erkennt Rückgabe-Varianten", () => {
    expect(classifyOrderStatus("returned")).toBe("returned");
    expect(classifyOrderStatus("Retoure")).toBe("returned");
    expect(classifyOrderStatus("refunded")).toBe("returned");
    expect(classifyOrderStatus("erstattet")).toBe("returned");
    expect(classifyOrderStatus("chargeback")).toBe("returned");
  });

  it("erkennt Storno-Varianten", () => {
    expect(classifyOrderStatus("cancelled")).toBe("cancelled");
    expect(classifyOrderStatus("Storno")).toBe("cancelled");
    expect(classifyOrderStatus("void")).toBe("cancelled");
    expect(classifyOrderStatus("failed")).toBe("cancelled");
  });

  it("alles andere = 'other'", () => {
    expect(classifyOrderStatus("shipped")).toBe("other");
    expect(classifyOrderStatus("")).toBe("other");
    expect(classifyOrderStatus(null)).toBe("other");
  });
});

describe("estimateMarketplaceFeeAmount", () => {
  it("percent-only Fall", () => {
    const result = estimateMarketplaceFeeAmount({
      salesAmount: 1000,
      orderCount: 10,
      policy: { percent: 15, fixedPerOrder: 0, source: "configured_percentage" },
    });
    expect(result.feesAmount).toBe(150);
    expect(result.feeSource).toBe("configured_percentage");
  });

  it("percent + fixed pro Bestellung", () => {
    const result = estimateMarketplaceFeeAmount({
      salesAmount: 1000,
      orderCount: 10,
      policy: { percent: 10, fixedPerOrder: 0.5, source: "configured_percentage" },
    });
    expect(result.feesAmount).toBe(105);
  });

  it("klippt negative Werte", () => {
    const result = estimateMarketplaceFeeAmount({
      salesAmount: -100,
      orderCount: -5,
      policy: { percent: 10, fixedPerOrder: 1, source: "default_percentage" },
    });
    expect(result.feesAmount).toBe(0);
  });
});

describe("buildNetBreakdown", () => {
  it("netAmount = sales - returns - fees - ads", () => {
    const nb = buildNetBreakdown({
      salesAmount: 1000,
      returnedAmount: 100,
      cancelledAmount: 50,
      feesAmount: 80,
      adSpendAmount: 20,
      feeSource: "api",
      returnsSource: "api",
    });
    expect(nb.returnsAmount).toBe(150);
    expect(nb.netAmount).toBe(1000 - 150 - 80 - 20);
  });

  it("ad spend ist optional", () => {
    const nb = buildNetBreakdown({
      salesAmount: 500,
      returnedAmount: 0,
      cancelledAmount: 0,
      feesAmount: 50,
      feeSource: "default_percentage",
      returnsSource: "none",
    });
    expect(nb.adSpendAmount).toBe(0);
    expect(nb.netAmount).toBe(450);
  });
});
