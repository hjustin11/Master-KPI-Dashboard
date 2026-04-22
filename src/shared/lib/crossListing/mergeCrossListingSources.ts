import type {
  CrossListingDraftValues,
  CrossListingFieldConfig,
  CrossListingFieldKey,
  CrossListingFieldSources,
  CrossListingSourceMap,
  CrossListingSourceRecord,
  CrossListingSourceSlug,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";
import { emptyDraftValues } from "./crossListingDraftTypes";

/**
 * Standard-Prioritätsreihenfolge der Quellen pro Feld.
 * Ziel-Marktplatz wird vor dem Merge automatisch ausgeschlossen.
 */
const TEXT_ORDER: readonly CrossListingSourceSlug[] = [
  "amazon", "otto", "shopify", "ebay", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn", "tiktok", "xentral",
];
const XENTRAL_FIRST: readonly CrossListingSourceSlug[] = [
  "xentral", "amazon", "shopify", "otto", "ebay", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn", "tiktok",
];

const MIRAKL_SLUGS: readonly CrossListingSourceSlug[] = [
  "otto", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn",
];

const FIELD_PRIORITIES: Partial<Record<CrossListingFieldKey, readonly CrossListingSourceSlug[]>> = {
  title: TEXT_ORDER,
  description: ["amazon", "shopify", "otto", "ebay", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn", "tiktok", "xentral"],
  bullets: ["amazon", "ebay", "otto", "shopify", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn", "tiktok"],
  priceEur: XENTRAL_FIRST,
  uvpEur: XENTRAL_FIRST,
  stockQty: XENTRAL_FIRST,
  // EAN: Xentral bevorzugt (Single Source of Truth), aber Fallback auf
  // Marktplatz-Quellen damit der EAN niemals leer bleibt — Kaufland/Otto/etc.
  // lehnen Uploads ohne EAN ab.
  ean: XENTRAL_FIRST,
  brand: XENTRAL_FIRST,
  category: ["amazon", "otto", "shopify", "ebay", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn", "tiktok", "xentral"],
  dimL: XENTRAL_FIRST,
  dimW: XENTRAL_FIRST,
  dimH: XENTRAL_FIRST,
  weight: XENTRAL_FIRST,
  petSpecies: ["fressnapf", "zooplus", "amazon", "otto", "shopify", "ebay", "kaufland", "mediamarkt-saturn", "tiktok"],
  tags: ["shopify", "amazon", "otto", "ebay"],
  attributes: TEXT_ORDER,
};

/** Für Mirakl-Target: andere Mirakl-Quellen bevorzugen (ähnliche Kategorie-Strukturen). */
const MIRAKL_CATEGORY_ORDER: readonly CrossListingSourceSlug[] = [
  "otto", "kaufland", "fressnapf", "zooplus", "mediamarkt-saturn",
  "amazon", "shopify", "ebay", "tiktok", "xentral",
];

const MERGE_DEBUG = (() => {
  try {
    return typeof process !== "undefined" && process.env?.CROSS_LISTING_MERGE_DEBUG === "1";
  } catch {
    return false;
  }
})();

function debugLog(field: string, source: CrossListingSourceSlug | null) {
  if (MERGE_DEBUG) {
    console.debug(`[cross-listing merge] ${field} ← ${source ?? "(none)"}`);
  }
}

type EligibleEntry = { slug: CrossListingSourceSlug; record: CrossListingSourceRecord };

function orderSources(
  sources: CrossListingSourceMap,
  target: CrossListingTargetSlug,
  field: CrossListingFieldKey
): EligibleEntry[] {
  // Category: wenn Target ein Mirakl-Slug ist → andere Mirakl-Quellen bevorzugen.
  let order: readonly CrossListingSourceSlug[];
  if (field === "category" && (MIRAKL_SLUGS as readonly string[]).includes(target)) {
    order = MIRAKL_CATEGORY_ORDER;
  } else {
    order = FIELD_PRIORITIES[field] ?? TEXT_ORDER;
  }
  const result: EligibleEntry[] = [];
  for (const slug of order) {
    if (slug === target) continue;
    const record = sources[slug];
    if (record) result.push({ slug, record });
  }
  return result;
}

function pickString(
  entries: EligibleEntry[],
  getter: (r: CrossListingSourceRecord) => string | null | undefined,
  minLength = 0
): { value: string; source: CrossListingSourceSlug | null } {
  let fallback: { value: string; source: CrossListingSourceSlug } | null = null;
  for (const entry of entries) {
    const raw = getter(entry.record);
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length >= minLength) {
      return { value: trimmed, source: entry.slug };
    }
    if (!fallback) fallback = { value: trimmed, source: entry.slug };
  }
  return fallback ?? { value: "", source: null };
}

function pickNumber(
  entries: EligibleEntry[],
  getter: (r: CrossListingSourceRecord) => number | null | undefined
): { value: string; source: CrossListingSourceSlug | null } {
  for (const entry of entries) {
    const raw = getter(entry.record);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return { value: String(raw), source: entry.slug };
    }
  }
  return { value: "", source: null };
}

/** Fallback: aus der längsten Description Bullets extrahieren. */
function extractBulletsFromDescription(
  entries: EligibleEntry[],
  maxItems: number
): { value: string[]; source: CrossListingSourceSlug | null } {
  let longest: { text: string; source: CrossListingSourceSlug } | null = null;
  for (const entry of entries) {
    const desc = entry.record.description;
    if (!desc) continue;
    if (!longest || desc.length > longest.text.length) {
      longest = { text: desc, source: entry.slug };
    }
  }
  if (!longest) return { value: [], source: null };
  const text = longest.text.replace(/<[^>]+>/g, "\n");
  // Bullet-Marker zuerst versuchen
  const bulletSplit = text
    .split(/\n[\s]*(?:[•\-*]|\d+\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 500);
  if (bulletSplit.length >= 2) {
    return { value: bulletSplit.slice(0, maxItems), source: longest.source };
  }
  // Sonst Sätze
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 500);
  if (sentences.length === 0) return { value: [], source: null };
  return { value: sentences.slice(0, maxItems), source: longest.source };
}

function pickBullets(entries: EligibleEntry[]): { value: string[]; source: CrossListingSourceSlug | null } {
  // Amazon bevorzugt: wenn Amazon-Record bullets hat → diese hart nehmen.
  const amazonEntry = entries.find((e) => e.slug === "amazon");
  if (amazonEntry) {
    const list = amazonEntry.record.bullets.filter((b) => b.trim().length > 0);
    if (list.length > 0) return { value: list, source: "amazon" };
  }
  let best: { value: string[]; source: CrossListingSourceSlug } | null = null;
  for (const entry of entries) {
    const list = entry.record.bullets.filter((b) => b.trim().length > 0);
    if (list.length === 0) continue;
    if (!best || list.length > best.value.length) best = { value: list, source: entry.slug };
  }
  return best ?? { value: [], source: null };
}

/** Bilder-Union: alle Bilder aller Quellen, nach Priorität geordnet, Duplikate entfernt. */
function unionImages(
  entries: EligibleEntry[],
  maxItems: number | undefined
): { value: string[]; source: CrossListingSourceSlug | null } {
  const seen = new Set<string>();
  const out: string[] = [];
  let firstSource: CrossListingSourceSlug | null = null;
  for (const entry of entries) {
    for (const url of entry.record.images) {
      const u = url.trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      if (!firstSource) firstSource = entry.slug;
      if (maxItems && out.length >= maxItems) return { value: out, source: firstSource };
    }
  }
  return { value: out, source: firstSource };
}

function pickTags(entries: EligibleEntry[]): { value: string[]; source: CrossListingSourceSlug | null } {
  const seen = new Set<string>();
  const out: string[] = [];
  let firstSource: CrossListingSourceSlug | null = null;
  for (const entry of entries) {
    for (const t of entry.record.tags) {
      const v = t.trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      out.push(v);
      if (!firstSource) firstSource = entry.slug;
    }
  }
  return { value: out, source: firstSource };
}

function pickAttributes(entries: EligibleEntry[]): {
  value: Record<string, string>;
  source: CrossListingSourceSlug | null;
} {
  let best: { value: Record<string, string>; source: CrossListingSourceSlug } | null = null;
  for (const entry of entries) {
    const attrs = entry.record.attributes;
    const count = Object.keys(attrs).length;
    if (count === 0) continue;
    if (!best || count > Object.keys(best.value).length) {
      best = { value: { ...attrs }, source: entry.slug };
    }
  }
  return best ?? { value: {}, source: null };
}

/** Fallback: Marke aus Amazon-Titel extrahieren (erstes Wort / erste Wortgruppe). */
function deriveBrandFromTitle(sources: CrossListingSourceMap): string | null {
  const slugs: CrossListingSourceSlug[] = ["amazon", "otto", "shopify"];
  for (const slug of slugs) {
    const rec = sources[slug];
    if (!rec?.title) continue;
    const match = rec.title.trim().match(/^([\p{L}][\p{L}\d&'’.\-]{1,39})/u);
    if (match && match[1]) return match[1];
  }
  return null;
}

/** PetSpecies aus Titel/Description/Kategorie/Tags ableiten, wenn keine Quelle direkt liefert. */
function derivePetSpecies(sources: CrossListingSourceMap): string | null {
  const MAP: Array<[RegExp, string]> = [
    // Deutsch
    [/\bhund(?:e|en|ep|chen|ef)?\b/i, "Hund"],
    [/\bkatze(?:n)?\b|\bkater\b|\bkätzchen\b/i, "Katze"],
    [/\b(?:kleintier|nager|hamster|kaninchen|meerschweinchen|ratte|maus|chinchilla|frettchen)\b/i, "Kleintier"],
    [/\b(?:vogel|vögel|sittich|papagei|kanarien|wellensittich)\b/i, "Vogel"],
    [/\b(?:fisch|aquarium|aquaristik|garnele|koi)\b/i, "Fisch"],
    [/\b(?:pferd|pony|equine|reiten)\b/i, "Pferd"],
    // Englisch
    [/\b(?:dog|puppy|puppies|canine)\b/i, "Hund"],
    [/\b(?:cat|kitten|feline)\b/i, "Katze"],
    [/\b(?:rabbit|hamster|guinea\s*pig|rodent)\b/i, "Kleintier"],
    [/\b(?:bird|parrot|canary|budgie)\b/i, "Vogel"],
    [/\b(?:fish|aquarium|tank)\b/i, "Fisch"],
    [/\b(?:horse|pony|equestrian)\b/i, "Pferd"],
  ];
  // Alle Quellen durchsuchen (inkl. xentral für category/brand), nicht nur ausgewählte.
  for (const slug of Object.keys(sources) as CrossListingSourceSlug[]) {
    const rec = sources[slug];
    if (!rec) continue;
    const hay = [
      rec.title ?? "",
      rec.description ?? "",
      rec.category ?? "",
      rec.brand ?? "",
      ...(rec.tags ?? []),
      ...Object.values(rec.attributes ?? {}),
      ...(rec.bullets ?? []),
    ]
      .join(" ")
      .toLowerCase();
    for (const [re, label] of MAP) if (re.test(hay)) return label;
  }
  return null;
}

export type MergeResult = {
  values: CrossListingDraftValues;
  fieldSources: CrossListingFieldSources;
};

export function mergeForTarget(
  sources: CrossListingSourceMap,
  target: CrossListingTargetSlug,
  config: CrossListingFieldConfig
): MergeResult {
  const values = emptyDraftValues();
  const fieldSources: CrossListingFieldSources = {};

  for (const field of config.fields) {
    const entries = orderSources(sources, target, field.key);

    switch (field.key) {
      case "title": {
        // Min-Length 30: Shopify-Mini-Titel werden übersprungen wenn ein längerer existiert.
        const p = pickString(entries, (r) => r.title, 30);
        values.title = p.value;
        if (p.source) fieldSources.title = p.source;
        debugLog("title", p.source);
        break;
      }
      case "description": {
        const p = pickString(entries, (r) => r.description);
        values.description = p.value;
        if (p.source) fieldSources.description = p.source;
        debugLog("description", p.source);
        break;
      }
      case "bullets": {
        let p = pickBullets(entries);
        if (p.value.length === 0) {
          // Fallback: aus der längsten Description extrahieren.
          p = extractBulletsFromDescription(entries, field.maxItems ?? 5);
        }
        values.bullets = p.value;
        if (p.source) fieldSources.bullets = p.source;
        debugLog("bullets", p.source);
        break;
      }
      case "images": {
        const p = unionImages(entries, field.maxItems);
        values.images = p.value;
        if (p.source) fieldSources.images = p.source;
        break;
      }
      case "priceEur": {
        const p = pickNumber(entries, (r) => r.priceEur);
        values.priceEur = p.value;
        if (p.source) fieldSources.priceEur = p.source;
        break;
      }
      case "uvpEur": {
        const p = pickNumber(entries, (r) => r.uvpEur);
        values.uvpEur = p.value;
        if (p.source) fieldSources.uvpEur = p.source;
        break;
      }
      case "stockQty": {
        const p = pickNumber(entries, (r) => r.stockQty);
        values.stockQty = p.value;
        if (p.source) fieldSources.stockQty = p.source;
        break;
      }
      case "ean": {
        const p = pickString(entries, (r) => r.ean);
        values.ean = p.value;
        if (p.source) fieldSources.ean = p.source;
        break;
      }
      case "brand": {
        let p = pickString(entries, (r) => r.brand);
        if (!p.value) {
          const derived = deriveBrandFromTitle(sources);
          if (derived) p = { value: derived, source: "amazon" };
        }
        values.brand = p.value;
        if (p.source) fieldSources.brand = p.source;
        break;
      }
      case "category": {
        const p = pickString(entries, (r) => r.category);
        values.category = p.value;
        if (p.source) fieldSources.category = p.source;
        break;
      }
      case "dimL": {
        const p = pickNumber(entries, (r) => r.dimL);
        values.dimL = p.value;
        if (p.source) fieldSources.dimL = p.source;
        break;
      }
      case "dimW": {
        const p = pickNumber(entries, (r) => r.dimW);
        values.dimW = p.value;
        if (p.source) fieldSources.dimW = p.source;
        break;
      }
      case "dimH": {
        const p = pickNumber(entries, (r) => r.dimH);
        values.dimH = p.value;
        if (p.source) fieldSources.dimH = p.source;
        break;
      }
      case "weight": {
        const p = pickNumber(entries, (r) => r.weight);
        values.weight = p.value;
        if (p.source) fieldSources.weight = p.source;
        break;
      }
      case "petSpecies": {
        let p = pickString(entries, (r) => r.petSpecies);
        if (!p.value) {
          const derived = derivePetSpecies(sources);
          if (derived) p = { value: derived, source: "amazon" };
        }
        values.petSpecies = p.value;
        if (p.source) fieldSources.petSpecies = p.source;
        break;
      }
      case "tags": {
        const p = pickTags(entries);
        values.tags = p.value;
        if (p.source) fieldSources.tags = p.source;
        break;
      }
      case "attributes": {
        const p = pickAttributes(entries);
        values.attributes = p.value;
        if (p.source) fieldSources.attributes = p.source;
        break;
      }
      case "searchTerms":
      case "seoTitle":
      case "seoDescription":
      case "condition":
      case "handlingTime":
        // Wird regelbasiert (optimizeForTarget) oder vom User befüllt.
        break;
    }
  }

  return { values, fieldSources };
}
