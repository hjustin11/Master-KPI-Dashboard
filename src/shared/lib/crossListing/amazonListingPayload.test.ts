import { describe, it, expect } from "vitest";
import { buildAmazonListingPutBody } from "./amazonListingPayload";
import { emptyDraftValues, type CrossListingDraftValues } from "./crossListingDraftTypes";

const MID = "A1PA6795UKMFR9";

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
  it("baut gültiges Body für PET_SUPPLIES", () => {
    const r = buildAmazonListingPutBody({ values: v(), marketplaceId: MID, productType: "PET_SUPPLIES" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.productType).toBe("PET_SUPPLIES");
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.item_name).toBeDefined();
    expect(a.brand).toBeDefined();
    expect(a.manufacturer).toBeDefined();
    expect(a.condition_type).toEqual([{ value: "new_new", marketplace_id: MID }]);
    expect(a.country_of_origin).toEqual([{ value: "DE", marketplace_id: MID }]);
    expect(a.batteries_required).toEqual([{ value: "false", marketplace_id: MID }]);
    expect(a.supplier_declared_dg_hz_regulation).toEqual([{ value: "not_applicable", marketplace_id: MID }]);
  });

  it("übersetzt deutsche Werte via Alias", () => {
    const r = buildAmazonListingPutBody({
      values: v({ condition: "Neu", attributes: { country_of_origin: "Deutschland", supplier_declared_dg_hz_regulation: "Nicht zutreffend" } }),
      marketplaceId: MID,
      productType: "PET_SUPPLIES",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.condition_type).toEqual([{ value: "new_new", marketplace_id: MID }]);
    expect(a.country_of_origin).toEqual([{ value: "DE", marketplace_id: MID }]);
    expect(a.supplier_declared_dg_hz_regulation).toEqual([{ value: "not_applicable", marketplace_id: MID }]);
  });

  it("WASTE_BAG hat KEINE Elektro-Felder", () => {
    const r = buildAmazonListingPutBody({ values: v(), marketplaceId: MID, productType: "WASTE_BAG" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.power_plug_type).toBeUndefined();
    expect(a.accepted_voltage_frequency).toBeUndefined();
    expect(a.eu_energy_label_efficiency_class).toBeUndefined();
    expect(a.efficiency).toBeUndefined();
  });

  it("HAIR_TRIMMER enthält Elektro-Felder wenn gesetzt", () => {
    const r = buildAmazonListingPutBody({
      values: v({ attributes: { power_plug_type: "type_c_europlug", accepted_voltage_frequency: "50_hz" } }),
      marketplaceId: MID,
      productType: "HAIR_TRIMMER",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.power_plug_type).toBeDefined();
    expect(a.accepted_voltage_frequency).toBeDefined();
  });

  it("Bilder-Struktur: media_location toplevel", () => {
    const r = buildAmazonListingPutBody({ values: v(), marketplaceId: MID, productType: "PET_SUPPLIES" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    expect(a.main_product_image_locator).toEqual([
      { media_location: "https://example.com/main.jpg", marketplace_id: MID },
    ]);
  });

  it("list_price hat value_with_tax als Number", () => {
    const r = buildAmazonListingPutBody({ values: v(), marketplaceId: MID, productType: "PET_SUPPLIES" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.body.attributes as Record<string, unknown>;
    const lp = (a.list_price as Array<{ value_with_tax: unknown }>)[0];
    expect(typeof lp.value_with_tax).toBe("number");
    expect(lp.value_with_tax).toBe(12.99);
  });

  it("schlägt fehl ohne Pflichtfelder", () => {
    const r = buildAmazonListingPutBody({
      values: v({ title: "", brand: "", priceEur: "", images: [] }),
      marketplaceId: MID,
      productType: "PET_SUPPLIES",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.field).sort()).toEqual(["brand", "images", "priceEur", "title"]);
  });

  it("kürzt Bullets auf max 5", () => {
    const r = buildAmazonListingPutBody({
      values: v({ bullets: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"] }),
      marketplaceId: MID,
      productType: "PET_SUPPLIES",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.body.attributes.bullet_point as unknown[]).length).toBe(5);
  });

  it("browse_nodes aus Attributen", () => {
    const r = buildAmazonListingPutBody({
      values: v({ attributes: { recommended_browse_nodes: "2127215031" } }),
      marketplaceId: MID,
      productType: "PET_SUPPLIES",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.attributes.recommended_browse_nodes).toEqual([
      { value: "2127215031", marketplace_id: MID },
    ]);
  });
});
