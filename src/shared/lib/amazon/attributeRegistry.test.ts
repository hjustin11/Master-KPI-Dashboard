import { describe, it, expect } from "vitest";
import {
  getProductTypes,
  getFieldsForProductType,
  getBasePflichtFields,
  translateToApiKey,
  translatePayloadValues,
} from "./attributeRegistry";

describe("attributeRegistry", () => {
  it("listet 10 Produkttypen", () => {
    const types = getProductTypes();
    expect(types.length).toBe(10);
    expect(types).toContain("WASTE_BAG");
    expect(types).toContain("PET_SUPPLIES");
    expect(types).toContain("HAIR_TRIMMER");
  });

  it("liefert Felder für PET_SUPPLIES", () => {
    const fields = getFieldsForProductType("PET_SUPPLIES");
    expect(Object.keys(fields).length).toBeGreaterThan(0);
  });

  it("liefert leere Felder für unbekannten Typ", () => {
    const fields = getFieldsForProductType("NONEXISTENT_TYPE");
    expect(Object.keys(fields).length).toBe(0);
  });

  it("liefert 27 Pflichtfelder", () => {
    const pflicht = getBasePflichtFields();
    expect(pflicht.length).toBe(27);
    expect(pflicht[0].api).toBe("item_name");
  });

  it("übersetzt 'Neu' → 'new_new'", () => {
    expect(translateToApiKey("condition_type.value", "Neu")).toBe("new_new");
  });

  it("übersetzt 'Deutschland' → 'DE'", () => {
    expect(translateToApiKey("country_of_origin.value", "Deutschland")).toBe("DE");
  });

  it("übersetzt 'Ja' bei batteries_required → 'true'", () => {
    expect(translateToApiKey("batteries_required.value", "Ja")).toBe("true");
  });

  it("übersetzt 'Nein' bei batteries_required → 'false'", () => {
    expect(translateToApiKey("batteries_required.value", "Nein")).toBe("false");
  });

  it("übersetzt 'Nicht zutreffend' → 'not_applicable'", () => {
    expect(translateToApiKey("supplier_declared_dg_hz_regulation.value", "Nicht zutreffend")).toBe("not_applicable");
  });

  it("übersetzt 'Zentimeter' → 'centimeters'", () => {
    expect(translateToApiKey("item_dimensions.length.unit", "Zentimeter")).toBe("centimeters");
  });

  it("übersetzt 'Papier' → 'paper'", () => {
    expect(translateToApiKey("epr_product_packaging.main_material", "Papier")).toBe("paper");
  });

  it("gibt unbekannten Wert unverändert zurück", () => {
    expect(translateToApiKey("condition_type.value", "UNKNOWN_VALUE")).toBe("UNKNOWN_VALUE");
  });

  it("translatePayloadValues übersetzt batch", () => {
    const result = translatePayloadValues({
      condition_type: "Neu",
      supplier_declared_dg_hz_regulation: "Nicht zutreffend",
      batteries_required: "Nein",
      some_custom_field: "Bleibt",
    });
    expect(result.condition_type).toBe("new_new");
    expect(result.supplier_declared_dg_hz_regulation).toBe("not_applicable");
    expect(result.batteries_required).toBe("false");
    expect(result.some_custom_field).toBe("Bleibt");
  });
});
