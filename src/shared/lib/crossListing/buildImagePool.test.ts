import { describe, it, expect } from "vitest";
import { buildImagePool, selectedImageUrls, mergeExistingImagesIntoPool } from "./buildImagePool";
import type {
  CrossListingSourceMap,
  CrossListingSourceRecord,
  CrossListingSourceSlug,
} from "./crossListingDraftTypes";

function src(slug: CrossListingSourceSlug, images: string[]): CrossListingSourceRecord {
  return {
    slug,
    title: null,
    description: null,
    bullets: [],
    images,
    priceEur: null,
    uvpEur: null,
    stockQty: null,
    ean: null,
    brand: null,
    category: null,
    dimL: null,
    dimW: null,
    dimH: null,
    weight: null,
    petSpecies: null,
    tags: [],
    attributes: {},
  };
}

describe("buildImagePool", () => {
  it("sammelt Bilder aus ALLEN Quellen (union, nach Priorität)", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", ["a1", "a2"]),
      shopify: src("shopify", ["s1"]),
      otto: src("otto", ["o1", "a1"]), // a1 ist Duplikat
    };
    const pool = buildImagePool(sources, "kaufland");
    expect(pool.map((e) => e.url)).toEqual(["a1", "a2", "s1", "o1"]);
    expect(pool[0].source).toBe("amazon");
    expect(pool[0].index).toBe(1);
    expect(pool[1].index).toBe(2);
    expect(pool.every((e) => e.selected)).toBe(true);
  });

  it("schließt Ziel-Marktplatz als Bilder-Quelle aus", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", ["a1"]),
      shopify: src("shopify", ["s1"]),
    };
    const pool = buildImagePool(sources, "shopify");
    expect(pool.map((e) => e.url)).toEqual(["a1"]);
  });

  it("preselect=false → alle selected=false", () => {
    const sources: CrossListingSourceMap = { amazon: src("amazon", ["a1"]) };
    const pool = buildImagePool(sources, "otto", { preselect: false });
    expect(pool[0].selected).toBe(false);
  });

  it("selectedImageUrls liefert nur ausgewählte URLs", () => {
    const pool = [
      { url: "a", source: "amazon" as const, index: 1, selected: true },
      { url: "b", source: "amazon" as const, index: 2, selected: false },
      { url: "c", source: "shopify" as const, index: 1, selected: true },
    ];
    expect(selectedImageUrls(pool)).toEqual(["a", "c"]);
  });

  it("mergeExistingImagesIntoPool fügt manuelle URLs hinzu + markiert bestehende als selected", () => {
    const pool = [
      { url: "a1", source: "amazon" as const, index: 1, selected: false },
    ];
    const merged = mergeExistingImagesIntoPool(pool, ["a1", "manual1"]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.url === "a1")?.selected).toBe(true);
    expect(merged.find((e) => e.url === "manual1")?.source).toBe("manual");
  });
});
