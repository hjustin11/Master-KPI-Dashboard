import { describe, expect, it } from "vitest";
import {
  dedupeMarketplaceRowsBySkuAndSecondary,
  marketplaceProductRowId,
  mergeMarketplaceProductClientLists,
} from "./marketplaceProductClientMerge";
import type { MarketplaceProductListRow } from "./marketplaceProductList";

function row(
  partial: Partial<MarketplaceProductListRow> & Pick<MarketplaceProductListRow, "sku" | "secondaryId">
): MarketplaceProductListRow {
  return {
    title: "",
    statusLabel: "",
    isActive: true,
    ...partial,
  };
}

describe("dedupeMarketplaceRowsBySkuAndSecondary", () => {
  it("keeps first row when duplicates appear in one array", () => {
    const a = row({ sku: "S", secondaryId: "A", title: "first" });
    const b = row({ sku: "S", secondaryId: "A", title: "second" });
    expect(dedupeMarketplaceRowsBySkuAndSecondary([a, b])).toEqual([a]);
  });
});

describe("mergeMarketplaceProductClientLists", () => {
  it("deduplicates duplicate keys within fresh (first row wins)", () => {
    const first = row({ sku: "0S-Y7FP-1AJ6", secondaryId: "B0GWFBQ89L", title: "A" });
    const second = row({ sku: "0S-Y7FP-1AJ6", secondaryId: "B0GWFBQ89L", title: "B" });
    const out = mergeMarketplaceProductClientLists([], [first, second]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("A");
  });

  it("treats sku/secondaryId like productRowKey (trim, case)", () => {
    const a = row({ sku: "  Sku  ", secondaryId: "Asin", title: "one" });
    const b = row({ sku: "sku", secondaryId: "  asin  ", title: "two" });
    expect(marketplaceProductRowId(a)).toBe(marketplaceProductRowId(b));
    expect(mergeMarketplaceProductClientLists([], [a, b])).toHaveLength(1);
  });

  it("merges previous rows not present in fresh", () => {
    const fresh = row({ sku: "f1", secondaryId: "s1", title: "F" });
    const prev = row({ sku: "p1", secondaryId: "s2", title: "P" });
    const out = mergeMarketplaceProductClientLists([prev], [fresh]);
    expect(out.map((r) => r.sku)).toEqual(["f1", "p1"]);
  });
});
