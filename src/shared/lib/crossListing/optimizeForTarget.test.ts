import { describe, it, expect } from "vitest";
import {
  clampTitleForTarget,
  deriveSeoDescription,
  deriveSeoTitle,
  normalizeBullets,
  optimizeForTarget,
  prefixBrand,
  stripBannedTitleChars,
} from "./optimizeForTarget";
import { emptyDraftValues } from "./crossListingDraftTypes";

describe("stripBannedTitleChars", () => {
  it("entfernt !, ?, €, ™, ® bei Amazon", () => {
    expect(stripBannedTitleChars("Tolles Spielzeug! Für Hunde? €29 ™", "amazon")).toBe(
      "Tolles Spielzeug Für Hunde 29"
    );
  });
  it("lässt andere Marktplätze unangetastet", () => {
    expect(stripBannedTitleChars("Titel!", "otto")).toBe("Titel!");
  });
});

describe("clampTitleForTarget", () => {
  it("kürzt Amazon-Titel auf 200 Zeichen, an Wortgrenze", () => {
    const long = "A".repeat(100) + " " + "B".repeat(150);
    const out = clampTitleForTarget(long, "amazon");
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(" ")).toBe(false);
  });
  it("kürzt eBay auf 80", () => {
    const out = clampTitleForTarget("Langer eBay Titel ".repeat(10), "ebay");
    expect(out.length).toBeLessThanOrEqual(80);
  });
  it("kürzt TikTok auf 100", () => {
    const out = clampTitleForTarget("x".repeat(150), "tiktok");
    expect(out.length).toBeLessThanOrEqual(100);
  });
  it("lässt kurze Titel unverändert", () => {
    expect(clampTitleForTarget("Kurzer Titel", "amazon")).toBe("Kurzer Titel");
  });
});

describe("prefixBrand", () => {
  it("setzt Marke voran wenn nicht bereits enthalten", () => {
    expect(prefixBrand("Hundespielzeug", "PetRhein")).toBe("PetRhein Hundespielzeug");
  });
  it("dedupe wenn Marke bereits am Anfang", () => {
    expect(prefixBrand("PetRhein Hundespielzeug", "PetRhein")).toBe("PetRhein Hundespielzeug");
  });
  it("case-insensitive Prefix-Check", () => {
    expect(prefixBrand("petrhein hundespielzeug", "PetRhein")).toBe("petrhein hundespielzeug");
  });
});

describe("normalizeBullets", () => {
  it("trimt, dedupliziert, respektiert maxItems + maxLength", () => {
    const out = normalizeBullets(
      ["  robust  ", "ROBUST", "langlebig", "x".repeat(600), "", "natürlich"],
      3,
      100
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("robust");
    expect(out[1]).toBe("langlebig");
    expect(out[2].length).toBeLessThanOrEqual(100);
  });
});

describe("deriveSeoTitle", () => {
  it("hängt Shop-Suffix an wenn Platz reicht", () => {
    expect(deriveSeoTitle("Hundespielzeug")).toContain("astropet.de");
  });
  it("respektiert 70-Zeichen-Limit", () => {
    const out = deriveSeoTitle("x".repeat(100));
    expect(out.length).toBeLessThanOrEqual(70);
  });
});

describe("deriveSeoDescription", () => {
  it("kürzt auf 160 Zeichen und entfernt HTML", () => {
    const html = "<p>Eine <strong>tolle</strong> Beschreibung.</p> ".repeat(10);
    const out = deriveSeoDescription(html);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out).not.toContain("<");
  });
  it("kurze Beschreibung bleibt unverändert", () => {
    expect(deriveSeoDescription("Kurz.")).toBe("Kurz.");
  });
});

describe("optimizeForTarget", () => {
  it("Amazon: Brand-Prefix + Clamping + Bullets-Normalisierung", () => {
    const values = {
      ...emptyDraftValues(),
      title: "Hundespielzeug aus Kautschuk!",
      brand: "PetRhein",
      bullets: ["  Robust  ", "ROBUST", "Natürlich"],
    };
    const result = optimizeForTarget(values, "amazon");
    expect(result.values.title).toBe("PetRhein Hundespielzeug aus Kautschuk");
    expect(result.changed.title).toBe(true);
    expect(result.values.bullets).toEqual(["Robust", "Natürlich"]);
    expect(result.changed.bullets).toBe(true);
  });

  it("Shopify: SEO-Titel + SEO-Beschreibung werden abgeleitet, wenn leer", () => {
    const values = {
      ...emptyDraftValues(),
      title: "Kauspielzeug Naturkautschuk",
      description: "Ein sehr robustes Kauspielzeug für große Hunde aus reinem Naturkautschuk.",
    };
    const result = optimizeForTarget(values, "shopify");
    expect(result.values.seoTitle).toContain("astropet.de");
    expect(result.values.seoDescription.length).toBeGreaterThan(0);
    expect(result.changed.seoTitle).toBe(true);
    expect(result.changed.seoDescription).toBe(true);
  });

  it("Condition-Default wird gesetzt wenn leer", () => {
    const values = { ...emptyDraftValues(), condition: "" };
    const result = optimizeForTarget(values, "otto");
    expect(result.values.condition).toBe("Neu");
    expect(result.changed.condition).toBe(true);
  });

  it("keine Änderungen → changed ist leer (außer condition default)", () => {
    const values = {
      ...emptyDraftValues(),
      title: "Kurzer Titel",
      condition: "Neu",
    };
    const result = optimizeForTarget(values, "otto");
    expect(Object.keys(result.changed)).toEqual([]);
  });
});
