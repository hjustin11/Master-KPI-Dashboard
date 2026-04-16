/** Hardcodierte Liste — KEIN Import von attributeRegistry (nutzt node:fs, nicht client-safe). */
const KNOWN_PRODUCT_TYPES = [
  "ANIMAL_STAIR", "ANIMAL_WATER_DISPENSER", "AREA_DEODORIZER",
  "FOOD_STORAGE_CONTAINER", "HAIR_TRIMMER", "LITTER_BOX",
  "PET_ACTIVITY_STRUCTURE", "PET_FEEDER", "PET_SUPPLIES", "WASTE_BAG",
] as const;

export type DetectionResult = {
  productType: string;
  confidence: number;
  reasoning: string;
};

export type BrowseNodeResult = {
  nodeId: string;
  nodeName: string;
  confidence: number;
  source: "auto" | "default";
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
  const validTypes = new Set<string>(KNOWN_PRODUCT_TYPES);
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

// --- Browse-Node Auto-Detection ---

type BrowseNodeRule = { keywords: RegExp; nodeId: string; nodeName: string };
type BrowseNodeConfig = { defaultId: string; defaultName: string; rules: BrowseNodeRule[] };

const BROWSE_NODE_MAP: Record<string, BrowseNodeConfig> = {
  WASTE_BAG: {
    defaultId: "64745031", defaultName: "Müllbeutel",
    rules: [
      { keywords: /\b(katzentoilette\w*|katzenstreu\w*|streu\w*)\b/i, nodeId: "13357953031", nodeName: "Katzentoilettenauskleidung" },
      { keywords: /\b(hundetoilette\w*|welpen\w*)\b/i, nodeId: "470716031", nodeName: "Toiletteneinlagen für Hundetoiletten" },
      { keywords: /\b(baby\w*|windel\w*)\b/i, nodeId: "9645594031", nodeName: "Baby Windelbeutel" },
    ],
  },
  LITTER_BOX: {
    defaultId: "470780031", defaultName: "Katzentoiletten",
    rules: [
      { keywords: /\bhund\w*|welpe\w*/i, nodeId: "470714031", nodeName: "Hundetoiletten" },
    ],
  },
  PET_ACTIVITY_STRUCTURE: {
    defaultId: "13357926031", defaultName: "Kratzbäume & -möbel für Katzen",
    rules: [
      { keywords: /\btunnel\w*\b/i, nodeId: "4254582031", nodeName: "Tunnel für Katzen" },
      { keywords: /\b(kratzpappe\w*|kratzbrett\w*|kratzkarton\w*)\b/i, nodeId: "13357923031", nodeName: "Kratzpappen für Katzen" },
      { keywords: /\b(vogel\w*|käfig\w*|leiter\w*)\b/i, nodeId: "470870031", nodeName: "Leitern für Vogelkäfige" },
      { keywords: /\b(kleintier\w*|laufrad\w*|hamster\w*)\b/i, nodeId: "470823031", nodeName: "Laufräder für Kleintiere" },
    ],
  },
  PET_FEEDER: {
    defaultId: "13357988031", defaultName: "Fressnäpfe für Hunde",
    rules: [
      { keywords: /\b(automatisch\w*|timer|automat\w*)\b/i, nodeId: "470699031", nodeName: "Automatisierte Futterspender für Hunde" },
      { keywords: /\b(vogel|vögel)\b/i, nodeId: "470879031", nodeName: "Vogelnäpfe" },
      { keywords: /\b(fisch|aquarium)\b/i, nodeId: "470576031", nodeName: "Automatisierte Futterspender für Fische" },
      { keywords: /\b(katze\w*)\b/i, nodeId: "13357990031", nodeName: "Fressnäpfe für Katzen" },
    ],
  },
  ANIMAL_WATER_DISPENSER: {
    defaultId: "470703031", defaultName: "Trinkbrunnen für Hunde",
    rules: [
      { keywords: /\b(katze)\b/i, nodeId: "13357992031", nodeName: "Trinkbrunnen für Katzen" },
      { keywords: /\b(vogel)\b/i, nodeId: "470880031", nodeName: "Vogeltränken" },
      { keywords: /\b(kleintier|nager)\b/i, nodeId: "470822031", nodeName: "Wasserflaschen für Kleintiere" },
      { keywords: /\b(geflügel|huhn|hühner)\b/i, nodeId: "4546041031", nodeName: "Tränken für Geflügel" },
    ],
  },
  ANIMAL_STAIR: {
    defaultId: "470724031", defaultName: "Treppen & Stufen für Hunde",
    rules: [
      { keywords: /\bkatze\w*\b/i, nodeId: "13357928031", nodeName: "Treppen & Stufen für Katzen" },
    ],
  },
  AREA_DEODORIZER: {
    defaultId: "3628726031", defaultName: "Spray Lufterfrischer",
    rules: [
      { keywords: /\b(hund|hundegeruch)\b/i, nodeId: "27348839031", nodeName: "Entferner für Hundegeruch" },
      { keywords: /\b(kleintier|käfig|nager)\b/i, nodeId: "27348837031", nodeName: "Geruchsentferner für Kleintiere" },
      { keywords: /\b(elektrisch|plug|steckdose)\b/i, nodeId: "3628727031", nodeName: "Elektrische Lufterfrischer" },
      { keywords: /\b(baby|windel)\b/i, nodeId: "9645595031", nodeName: "Baby Windeleimer-Deodorant" },
    ],
  },
  FOOD_STORAGE_CONTAINER: {
    defaultId: "470700031", defaultName: "Futteraufbewahrung für Hunde",
    rules: [
      { keywords: /\b(katze)\b/i, nodeId: "13357987031", nodeName: "Futteraufbewahrung für Katzen" },
    ],
  },
  HAIR_TRIMMER: {
    defaultId: "3186410031", defaultName: "Haarscherer",
    rules: [
      { keywords: /\b(pferd|pony)\b/i, nodeId: "470838031", nodeName: "Schermaschinen für Pferde" },
      { keywords: /\b(hund)\b/i, nodeId: "13357943031", nodeName: "Fellpflege-Scheren für Hunde" },
      { keywords: /\b(frauen?|damen)\b/i, nodeId: "3186413031", nodeName: "Trimmer für Frauen" },
    ],
  },
  PET_SUPPLIES: {
    defaultId: "12950271", defaultName: "Haustierbedarf",
    rules: [
      { keywords: /\bhund\w*\b/i, nodeId: "340852031", nodeName: "Hunde" },
      { keywords: /\bkatze\w*\b/i, nodeId: "340853031", nodeName: "Katzen" },
      { keywords: /\b(kleintier\w*|hamster|kaninchen)\b/i, nodeId: "340856031", nodeName: "Kleintiere" },
      { keywords: /\b(vogel|vögel)\b/i, nodeId: "340854031", nodeName: "Vögel" },
      { keywords: /\b(fisch\w*|aquarium)\b/i, nodeId: "340855031", nodeName: "Fische & Aquaristik" },
    ],
  },
};

/**
 * Erkennt die passende Amazon Browse-Node-ID basierend auf Produkttyp + Titel/Beschreibung.
 * Fallback: Default-Node für den Produkttyp.
 */
export function detectBrowseNode(
  productType: string,
  title: string,
  description?: string | null
): BrowseNodeResult {
  const config = BROWSE_NODE_MAP[productType];
  if (!config) {
    return { nodeId: "12950271", nodeName: "Haustierbedarf", confidence: 0.3, source: "default" };
  }

  const searchText = `${title} ${description ?? ""}`;

  for (const rule of config.rules) {
    if (rule.keywords.test(searchText)) {
      return { nodeId: rule.nodeId, nodeName: rule.nodeName, confidence: 0.8, source: "auto" };
    }
  }

  return { nodeId: config.defaultId, nodeName: config.defaultName, confidence: 0.6, source: "default" };
}
