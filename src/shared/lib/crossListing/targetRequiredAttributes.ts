import type {
  CrossListingDraftValues,
  CrossListingSourceMap,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";

/**
 * Marktplatz-spezifische Pflichtattribute, die nach dem Merge in
 * `values.attributes` eingesetzt werden, damit der User sie im Popup-Editor
 * sieht und editieren kann (statt dass der Marktplatz sie mit sinnlosen
 * Defaults — z. B. dem Markennamen — auto-befüllt und dann ablehnt).
 *
 * Empirische Grundlage: Fressnapf.at-Backoffice (2026-04-21) zeigte nach dem
 * PLSP-003BGE-Upload ca. 25 Felder als "Pflicht" oder "Wert gehört nicht zur
 * Liste" — viele davon wurden mit dem Markennamen "PetRhein" default-
 * ausgefüllt, weil wir sie nicht mitgesendet haben.
 *
 * **Kolumn-Codes:** Die hier genutzten Keys sind best-guess Mirakl-/Fressnapf-
 * konforme Attribut-Codes. Für endgültige Verifikation ist der Template-
 * Download aus dem Fressnapf.at-Backoffice (Katalog > Templates) nötig. Die
 * Keys können per User-Edit im Attribute-Editor angepasst werden.
 */

type RequiredAttrBuilder = (
  sources: CrossListingSourceMap,
  values: CrossListingDraftValues,
  sku: string
) => Record<string, string>;

/** Heuristisches Material-Mapping für Haustier-Produkte. */
function deriveMaterial(haystack: string): string | null {
  const h = haystack.toLowerCase();
  if (/sisal/.test(h)) return "Sisal";
  if (/plüsch|plusch|plush/.test(h)) return "Plüsch";
  if (/kunststoff|plastik|plastic/.test(h)) return "Kunststoff";
  if (/metall|edelstahl|aluminium/.test(h)) return "Metall";
  if (/keramik|ceramic/.test(h)) return "Keramik";
  if (/holz|mdf|spanplatte/.test(h)) return "Holz";
  if (/baumwolle|cotton/.test(h)) return "Baumwolle";
  if (/pappe|karton|cardboard/.test(h)) return "Pappe";
  // Sonderfall Safari Lodge / Katzenhöhle: mehrfach-Material, Default
  if (/kratz|scratch|lodge|h(ö|oe)hle/.test(h)) return "Sisal";
  return null;
}

/** Farb-Extraktion aus Titel + Beschreibung (deutsche Standardfarben). */
function deriveColor(haystack: string): string | null {
  const h = haystack.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\bbeige\b/, "Beige"],
    [/\bgrau\b|\bgrey\b|\bgray\b/, "Grau"],
    [/\bschwarz\b|\bblack\b/, "Schwarz"],
    [/\bwei(ß|ss)\b|\bwhite\b/, "Weiß"],
    [/\bbraun\b|\bbrown\b/, "Braun"],
    [/\bblau\b|\bblue\b/, "Blau"],
    [/\bgr(ü|ue)n\b|\bgreen\b/, "Grün"],
    [/\brot\b|\bred\b/, "Rot"],
    [/\bgelb\b|\byellow\b/, "Gelb"],
    [/\brosa\b|\bpink\b/, "Rosa"],
    [/\blila\b|\bviolett\b|\bpurple\b/, "Lila"],
    [/\borange\b/, "Orange"],
    [/\bnatur\b|\bnatural\b/, "Natur"],
  ];
  for (const [re, name] of patterns) if (re.test(h)) return name;
  return null;
}

/** Variant-Group-Code aus SKU ableiten (letztes Farb-/Varianten-Suffix weg). */
function deriveVariantGroupCode(sku: string): string {
  // PLSP-003BGE → PLSP-003 (Suffix nach letztem "-" entfernen, wenn es 1–5 Buchstaben ist)
  const m = sku.match(/^(.+?)-[A-Za-z]{1,5}$/);
  return m?.[1] ?? sku;
}

/** Erste sinnvolle Zeile einer Beschreibung für Kurzbeschreibung. */
function deriveShortDescription(description: string, maxLen = 180): string {
  const stripped = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return "";
  if (stripped.length <= maxLen) return stripped;
  const cut = stripped.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Mapping von UI-PetSpecies (DE) auf Fressnapf-`animal_categories`-Enum.
 * Vollständige Liste aus Fressnapf /api/values_lists?values_list=animal_categories.
 */
function fressnapfAnimalCategory(petSpecies: string): string | null {
  const m = petSpecies.toLowerCase();
  const mapping: Record<string, string> = {
    katze: "cat",
    hund: "dog",
    kleintier: "small_animal",
    vogel: "ornamental_bird",
    fisch: "aquarium_fish",
    pferd: "horse",
  };
  return mapping[m] ?? null;
}

const fressnapfRequiredAttributes: RequiredAttrBuilder = (sources, values, sku) => {
  const hay = `${values.title} ${values.description} ${values.bullets.join(" ")} ${values.category}`;
  const out: Record<string, string> = {};

  // Herkunft / Sprache / Einheiten — globale Defaults, die fast immer gelten.
  out.country_of_origin = "DE";
  out.package_language = "DE";
  out.sales_unit = "Stueck";
  out.content_unit = "Stueck";
  out.unit_quantity = "1";

  // Lieferanten- / Artikel-Identifikation
  out.supplier_article_number = sku;
  out.variant_group_code = deriveVariantGroupCode(sku);
  out.parent_product_id = deriveVariantGroupCode(sku);
  out.manufacturer = values.brand || "";
  out.distributor = values.brand || ""; // Inverkehrbringer (meist = Marke)

  // Inhalts- / Content-Defaults aus den bereits gemergten Werten
  if (values.title) {
    out.product_name = values.title;
    out.shop_article_name = values.title;
    out.designation_1 = values.title;
  }
  const shortDesc = deriveShortDescription(values.description);
  if (shortDesc) out.short_description = shortDesc;
  if (values.bullets[0]) out.selling_point_1 = values.bullets[0];
  if (values.bullets[1]) out.selling_point_2 = values.bullets[1];
  if (values.bullets[2]) out.selling_point_3 = values.bullets[2];

  // Dimensionen / Gewicht — als Fressnapf-Keys aliased zu den Standard-Werten.
  // Fressnapf erwartet DECIMAL mit max. 4 Nachkommastellen.
  if (values.weight) out.net_weight = Number(values.weight).toFixed(3).replace(/\.?0+$/, "");
  if (values.dimL) out.length_cm = Number(values.dimL).toFixed(2).replace(/\.?0+$/, "");
  if (values.dimW) out.width_cm = Number(values.dimW).toFixed(2).replace(/\.?0+$/, "");
  if (values.dimH) out.height_cm = Number(values.dimH).toFixed(2).replace(/\.?0+$/, "");

  // Haupt-/Zusatz-Bild redundant (Fressnapf-Keys)
  if (values.images[0]) out.main_image_url = values.images[0];

  // Heuristische LIST-Werte (Fressnapf verwirft "Brand" als Fallback)
  const material = deriveMaterial(hay);
  if (material) out.material = material;
  const color = deriveColor(hay);
  if (color) out.color = color;

  // Tier-Kategorie aus petSpecies (wenn gesetzt) in Fressnapf-Enum
  const animal = fressnapfAnimalCategory(values.petSpecies);
  if (animal) out.animal_category = animal;

  // Grundpreispflicht: für Stückwaren "nein" (Kratzmöbel, Möbel, Spielzeug);
  // für Futter/Einstreu "ja" (muss user-override werden für Verbrauchsgüter).
  const isConsumable = /futter|einstreu|snack|leckerli|nass|trocken|flocke/i.test(hay);
  out.unit_price_required = isConsumable ? "ja" : "nein";

  return out;
};

const BUILDERS: Partial<Record<CrossListingTargetSlug, RequiredAttrBuilder>> = {
  fressnapf: fressnapfRequiredAttributes,
};

/**
 * Ergänzt `values.attributes` um Marktplatz-spezifische Pflichtattribute mit
 * Smart-Defaults. User-Edits gewinnen (existierende, nicht-leere Werte bleiben).
 * Brand-Pollution aus Quellen (wenn die Source einen Attribut-Wert == brand
 * gesetzt hat, ist das meist ein kaputter Default) wird gefiltert, damit
 * unsere heuristisch abgeleiteten Werte (Material/Farbe/...) greifen.
 */
export function augmentRequiredAttributes(
  slug: CrossListingTargetSlug,
  values: CrossListingDraftValues,
  sources: CrossListingSourceMap,
  sku: string
): Record<string, string> {
  const builder = BUILDERS[slug];
  if (!builder) return values.attributes;
  const defaults = builder(sources, values, sku);
  const out: Record<string, string> = { ...defaults };
  const brandLower = (values.brand ?? "").trim().toLowerCase();
  for (const [k, v] of Object.entries(values.attributes ?? {})) {
    if (!v || !v.trim()) continue;
    // Brand als Attribut-Wert ist fast immer verrauscht (Marktplatz-Auto-Fill).
    if (brandLower && v.trim().toLowerCase() === brandLower) continue;
    out[k] = v;
  }
  return out;
}
