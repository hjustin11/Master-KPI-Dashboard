import { describe, it, expect } from "vitest";
import { mergeForTarget } from "./mergeCrossListingSources";
import { getCrossListingFieldConfig } from "./marketplaceFieldConfigs";
import type {
  CrossListingSourceMap,
  CrossListingSourceRecord,
  CrossListingSourceSlug,
} from "./crossListingDraftTypes";

function src(slug: CrossListingSourceSlug, partial: Partial<CrossListingSourceRecord> = {}): CrossListingSourceRecord {
  return {
    slug,
    title: null,
    description: null,
    bullets: [],
    images: [],
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
    ...partial,
  };
}

describe("mergeForTarget", () => {
  it("bevorzugt Amazon-Titel, wenn Amazon nicht das Ziel ist", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", { title: "Amazon-Titel" }),
      shopify: src("shopify", { title: "Shopify-Titel" }),
      otto: src("otto", { title: "Otto-Titel" }),
    };
    const cfg = getCrossListingFieldConfig("otto")!;
    const result = mergeForTarget(sources, "otto", cfg);
    expect(result.values.title).toBe("Amazon-Titel");
    expect(result.fieldSources.title).toBe("amazon");
  });

  it("schließt Ziel-Marktplatz als Quelle aus", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", { title: "Amazon-Titel" }),
      otto: src("otto", { title: "Otto-Titel" }),
    };
    const cfg = getCrossListingFieldConfig("amazon")!;
    const result = mergeForTarget(sources, "amazon", cfg);
    expect(result.values.title).toBe("Otto-Titel");
    expect(result.fieldSources.title).toBe("otto");
  });

  it("bildet Bild-Union über alle Quellen (Priorität + dedup)", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", { images: ["a1"] }),
      shopify: src("shopify", { images: ["s1", "s2", "a1"] }),
      otto: src("otto", { images: ["o1"] }),
    };
    const cfg = getCrossListingFieldConfig("kaufland")!;
    const result = mergeForTarget(sources, "kaufland", cfg);
    // images folgt TEXT_ORDER: amazon, otto, shopify, ...
    expect(result.values.images).toEqual(["a1", "o1", "s1", "s2"]);
    expect(result.fieldSources.images).toBe("amazon");
  });

  it("brand: Fallback-Extraktion aus Amazon-Titel wenn kein brand-Feld gesetzt", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", { title: "PetRhein Hundespielzeug aus Naturkautschuk" }),
      otto: src("otto", { title: "Hundespielzeug" }),
    };
    const cfg = getCrossListingFieldConfig("otto")!;
    const result = mergeForTarget(sources, "otto", cfg);
    expect(result.values.brand).toBe("PetRhein");
  });

  it("Maße (dimL/dimW/dimH/weight) werden befüllt wenn irgendeine Quelle Daten hat", () => {
    const sources: CrossListingSourceMap = {
      xentral: src("xentral", { dimL: 12.5, weight: 0.8 }),
      amazon: src("amazon", { dimW: 8, dimH: 3 }),
    };
    const cfg = getCrossListingFieldConfig("otto")!;
    const result = mergeForTarget(sources, "otto", cfg);
    expect(result.values.dimL).toBe("12.5");
    expect(result.values.dimW).toBe("8");
    expect(result.values.dimH).toBe("3");
    expect(result.values.weight).toBe("0.8");
    expect(result.fieldSources.dimL).toBe("xentral");
    expect(result.fieldSources.dimW).toBe("amazon");
  });

  it("priceEur bevorzugt Xentral", () => {
    const sources: CrossListingSourceMap = {
      xentral: src("xentral", { priceEur: 19.99 }),
      amazon: src("amazon", { priceEur: 24.9 }),
    };
    const cfg = getCrossListingFieldConfig("otto")!;
    const result = mergeForTarget(sources, "otto", cfg);
    expect(result.values.priceEur).toBe("19.99");
    expect(result.fieldSources.priceEur).toBe("xentral");
  });

  it("leere Quellen liefern leere Draft-Values", () => {
    const cfg = getCrossListingFieldConfig("ebay")!;
    const result = mergeForTarget({}, "ebay", cfg);
    expect(result.values.title).toBe("");
    expect(result.values.bullets).toEqual([]);
    expect(result.values.images).toEqual([]);
    expect(result.fieldSources).toEqual({});
  });

  it("überspringt Felder, wenn nur das Ziel sie hat", () => {
    const sources: CrossListingSourceMap = {
      ebay: src("ebay", { title: "nur-ebay" }),
    };
    const cfg = getCrossListingFieldConfig("ebay")!;
    const result = mergeForTarget(sources, "ebay", cfg);
    expect(result.values.title).toBe("");
  });

  it("attributes: nimmt Quelle mit meisten Keys", () => {
    const sources: CrossListingSourceMap = {
      amazon: src("amazon", { attributes: { brand: "A" } }),
      otto: src("otto", { attributes: { brand: "O", color: "rot", size: "M" } }),
    };
    const cfg = getCrossListingFieldConfig("kaufland")!;
    const result = mergeForTarget(sources, "kaufland", cfg);
    expect(result.values.attributes).toEqual({ brand: "O", color: "rot", size: "M" });
    expect(result.fieldSources.attributes).toBe("otto");
  });
});
