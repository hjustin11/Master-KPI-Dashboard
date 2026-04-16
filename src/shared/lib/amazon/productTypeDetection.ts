import { getProductTypes } from "./attributeRegistry";

export type DetectionResult = {
  productType: string;
  confidence: number;
  reasoning: string;
};

type KeywordRule = {
  productType: string;
  keywords: RegExp;
};

const KEYWORD_RULES: KeywordRule[] = [
  { productType: "WASTE_BAG", keywords: /\b(müllbeutel|abfallbeutel|kotbeutel|hundebeutel|beutel\s*für|waste\s*bag|poop\s*bag)\b/i },
  { productType: "LITTER_BOX", keywords: /\b(katzentoilette|katzenklo|toilette|litter\s*box|katzen\s*wc)\b/i },
  { productType: "PET_ACTIVITY_STRUCTURE", keywords: /\b(kratzbaum|kratzmöbel|kratzpappe|kratzbrett|kratzstamm|katzenmöbel|cat\s*tree|scratching)\b/i },
  { productType: "PET_FEEDER", keywords: /\b(futterspender|fressnapf|futternapf|napf|futterautomat|futterstation|feeder|pet\s*bowl)\b/i },
  { productType: "ANIMAL_WATER_DISPENSER", keywords: /\b(wasserspender|trinkbrunnen|wasserfontäne|water\s*fountain|trinknapf|wassernapf)\b/i },
  { productType: "ANIMAL_STAIR", keywords: /\b(treppe|rampe|stufe|tiertreppe|hundetreppe|katzentreppe|pet\s*stairs)\b/i },
  { productType: "AREA_DEODORIZER", keywords: /\b(lufterfrischer|geruchsentferner|deodorizer|duftspray|geruchsneutralisierer|odor)\b/i },
  { productType: "FOOD_STORAGE_CONTAINER", keywords: /\b(vorratsbehälter|futterbehälter|futterdose|futterbox|vorratsdose|storage\s*container)\b/i },
  { productType: "HAIR_TRIMMER", keywords: /\b(trimmer|schermaschine|haarschneider|fellschneider|grooming\s*clipper|hair\s*trimmer)\b/i },
];

/**
 * Erkennt den Amazon-Produkttyp anhand von Titel, Beschreibung und Tags.
 * Fallback-Kaskade: Keyword-Match → PET_SUPPLIES.
 */
export function detectAmazonProductType(
  title: string,
  description?: string | null,
  tags?: string[]
): DetectionResult {
  const validTypes = new Set(getProductTypes());
  const searchText = [title, description ?? "", ...(tags ?? [])].join(" ");

  // 1) Keyword-Match im Titel (höchste Konfidenz für Titel-Treffer)
  for (const rule of KEYWORD_RULES) {
    if (!validTypes.has(rule.productType)) continue;
    if (rule.keywords.test(title)) {
      return {
        productType: rule.productType,
        confidence: 0.85,
        reasoning: `Titel enthält Schlüsselwort für ${rule.productType}.`,
      };
    }
  }

  // 2) Keyword-Match in Beschreibung/Tags (niedrigere Konfidenz)
  for (const rule of KEYWORD_RULES) {
    if (!validTypes.has(rule.productType)) continue;
    if (rule.keywords.test(searchText)) {
      return {
        productType: rule.productType,
        confidence: 0.65,
        reasoning: `Beschreibung/Tags enthalten Schlüsselwort für ${rule.productType}.`,
      };
    }
  }

  // 3) Fallback: PET_SUPPLIES
  return {
    productType: "PET_SUPPLIES",
    confidence: 0.5,
    reasoning: "Kein spezifischer Produkttyp erkannt — Fallback auf PET_SUPPLIES.",
  };
}
