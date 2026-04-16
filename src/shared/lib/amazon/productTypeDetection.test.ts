import { describe, it, expect } from "vitest";
import { detectAmazonProductType } from "./productTypeDetection";

describe("detectAmazonProductType", () => {
  it("erkennt Müllbeutel als WASTE_BAG", () => {
    const r = detectAmazonProductType("Premium Müllbeutel XL 120 Stück");
    expect(r.productType).toBe("WASTE_BAG");
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("erkennt Kotbeutel als WASTE_BAG", () => {
    const r = detectAmazonProductType("AstroPet Kotbeutel für Hunde");
    expect(r.productType).toBe("WASTE_BAG");
  });

  it("erkennt Kratzbaum als PET_ACTIVITY_STRUCTURE", () => {
    const r = detectAmazonProductType("AstroPet Kratzbaum Modern 120cm");
    expect(r.productType).toBe("PET_ACTIVITY_STRUCTURE");
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("erkennt Katzentoilette als LITTER_BOX", () => {
    const r = detectAmazonProductType("Selbstreinigende Katzentoilette XXL");
    expect(r.productType).toBe("LITTER_BOX");
  });

  it("erkennt Haartrimmer als HAIR_TRIMMER", () => {
    const r = detectAmazonProductType("Profi Schermaschine für Hunde");
    expect(r.productType).toBe("HAIR_TRIMMER");
  });

  it("erkennt Futterspender als PET_FEEDER", () => {
    const r = detectAmazonProductType("Automatischer Futterspender 5L");
    expect(r.productType).toBe("PET_FEEDER");
  });

  it("erkennt Trinkbrunnen als ANIMAL_WATER_DISPENSER", () => {
    const r = detectAmazonProductType("Katzenbrunnen Trinkbrunnen 2.5L");
    expect(r.productType).toBe("ANIMAL_WATER_DISPENSER");
  });

  it("erkennt Tiertreppe als ANIMAL_STAIR", () => {
    const r = detectAmazonProductType("Hundetreppe 3 Stufen klappbar");
    expect(r.productType).toBe("ANIMAL_STAIR");
  });

  it("erkennt Lufterfrischer als AREA_DEODORIZER", () => {
    const r = detectAmazonProductType("AstroPet Geruchsentferner Spray 500ml");
    expect(r.productType).toBe("AREA_DEODORIZER");
  });

  it("fällt auf PET_SUPPLIES zurück bei unklarem Titel", () => {
    const r = detectAmazonProductType("AstroPet Zubehör Set Premium");
    expect(r.productType).toBe("PET_SUPPLIES");
    expect(r.confidence).toBe(0.5);
  });

  it("matcht Beschreibungs-Keywords mit niedrigerer Konfidenz", () => {
    const r = detectAmazonProductType("AstroPet Produkt", "Dieser Futterbehälter fasst 10kg");
    expect(r.productType).toBe("FOOD_STORAGE_CONTAINER");
    expect(r.confidence).toBeLessThan(0.8);
  });
});
