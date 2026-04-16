import { describe, it, expect } from "vitest";
import { buildAmazonListingPutBody } from "./amazonListingPayload";
import { emptyDraftValues, type CrossListingDraftValues } from "./crossListingDraftTypes";

const MARKETPLACE_ID = "A1PA6795UKMFR9";

function v(overrides: Partial<CrossListingDraftValues> = {}): CrossListingDraftValues {
  return {
    ...emptyDraftValues(),
    title: "Test Cat Toy",
    brand: "PetRhein",
    description: "Beschreibung.",
    bullets: ["Bullet 1", "Bullet 2"],
    images: ["https://example.com/main.jpg", "https://example.com/2.jpg"],
    priceEur: "12.99",
    stockQty: "10",
    ean: "4262463560286",
    ...overrides,
  };
}

describe("buildAmazonListingPutBody", () => {
  it("baut gültiges Body bei kompletter Eingabe", () => {
    const r = buildAmazonListingPutBody({
      values: v(),
      marketplaceId: MARKETPLACE_ID,
      productType: "PET_SUPPLIES",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.productType).toBe("PET_SUPPLIES");
    expect(r.body.requirements).toBe("LISTING");
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.item_name).toEqual([
      { value: "Test Cat Toy", language_tag: "de_DE", marketplace_id: MARKETPLACE_ID },
    ]);
    expect(a.brand).toBeDefined();
    expect(a.bullet_point).toHaveLength(2);
    expect(a.main_product_image_locator).toEqual([
      { media_location: "https://example.com/main.jpg", marketplace_id: MARKETPLACE_ID },
    ]);
    expect(a.other_product_image_locator_1).toBeDefined();
    expect(a.externally_assigned_product_identifier).toEqual([
      { type: "ean", value: "4262463560286", marketplace_id: MARKETPLACE_ID },
    ]);
    expect(a.fulfillment_availability).toEqual([
      { fulfillment_channel_code: "DEFAULT", quantity: 10 },
    ]);
  });

  it("verwirft non-https Bilder mit Warnung", () => {
    const r = buildAmazonListingPutBody({
      values: v({ images: ["http://insecure.com/x.jpg", "https://ok.com/y.jpg"] }),
      marketplaceId: MARKETPLACE_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.find((w) => w.field === "images")).toBeDefined();
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.main_product_image_locator).toEqual([
      { media_location: "https://ok.com/y.jpg", marketplace_id: MARKETPLACE_ID },
    ]);
  });

  it("schlägt fehl ohne Pflichtfelder", () => {
    const r = buildAmazonListingPutBody({
      values: v({ title: "", brand: "", priceEur: "", images: [] }),
      marketplaceId: MARKETPLACE_ID,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const fields = r.errors.map((e) => e.field).sort();
    expect(fields).toEqual(["brand", "images", "priceEur", "title"]);
  });

  it("schlägt fehl bei ungültiger EAN", () => {
    const r = buildAmazonListingPutBody({
      values: v({ ean: "abc" }),
      marketplaceId: MARKETPLACE_ID,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.find((e) => e.field === "ean")).toBeDefined();
  });

  it("kürzt Bullets auf max 5", () => {
    const r = buildAmazonListingPutBody({
      values: v({ bullets: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"] }),
      marketplaceId: MARKETPLACE_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect((a.bullet_point as unknown[]).length).toBe(5);
  });

  it("setzt Maße und Gewicht wenn alle vorhanden", () => {
    const r = buildAmazonListingPutBody({
      values: v({ dimL: "20", dimW: "15", dimH: "10", weight: "1.5" }),
      marketplaceId: MARKETPLACE_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.item_package_dimensions).toBeDefined();
    expect(a.item_package_weight).toEqual([
      { value: 1.5, unit: "kilograms", marketplace_id: MARKETPLACE_ID },
    ]);
  });

  it("ignoriert Maße wenn unvollständig", () => {
    const r = buildAmazonListingPutBody({
      values: v({ dimL: "20", dimW: "", dimH: "10" }),
      marketplaceId: MARKETPLACE_ID,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.item_package_dimensions).toBeUndefined();
  });
});
