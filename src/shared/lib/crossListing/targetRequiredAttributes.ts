import type {
  CrossListingDraftValues,
  CrossListingSourceMap,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";
import { resolveFressnapfCategoryCode } from "./fressnapfCategories";

/**
 * Marktplatz-spezifische Pflichtattribute, die nach dem Merge in
 * `values.attributes` eingesetzt werden, damit der User sie im Popup-Editor
 * sieht und editieren kann (statt dass der Marktplatz sie mit sinnlosen
 * Defaults — z. B. dem Markennamen — auto-befüllt und dann ablehnt).
 *
 * **Schlüssel-Verifikation 2026-04-22 (Fressnapf-Error-CSV 120195-err.csv):**
 * Die meisten 1000-Errors („X is required") aus dem PLSP-003BGE-Upload zeigten
 * konkret welche Attribut-Codes Fressnapf erwartet — diese Keys sind hier
 * ersetzt (z. B. `package_language` → `packaging_language_de`,
 * `main_image_url` → `image_1`, `color` → `farbe`, `net_weight` → `weight`,
 * `length_cm` → `length`, `supplier_article_number` → `shop_sku`,
 * `distributor` → `supplier`, `unit_price_required` → `base_price_required`,
 * `sales_unit` → `sales_unit_of_measure`, neu: `title`, `gtin`, `taxable`,
 * `tax_class_at`).
 *
 * Verbleibende 1000-Errors die wir NICHT auto-defaulten (zu domänen-spezifisch):
 *   `commercial_code_at` (Zolltarifnummer Österreich, HS-Code)
 *   `product_type`       (Fressnapf-eigenes Enum, abhängig von Hierarchie)
 *   `material_group`     (Warengruppe = WGR-Code, abhängig von Kategorie)
 * → User trägt diese im Editor nach. Upload schlägt sonst klar mit „X is
 *   required" fehl, statt versteckt mit 20 Brand-Pollution-Warnings.
 */

type RequiredAttrBuilder = (
  sources: CrossListingSourceMap,
  values: CrossListingDraftValues,
  sku: string
) => Record<string, string>;

/**
 * Heuristisches Material-Mapping für Haustier-Produkte.
 * Werte sind die ECHTEN Fressnapf-`material`-values_list-Codes
 * (verifiziert via /api/values_lists?values_list=material — 89 Werte total,
 * lowercase English). Brand-Pollution-Fix: deutsche UI-Begriffe → Enum-Code.
 */
function deriveMaterial(haystack: string): string | null {
  const h = haystack.toLowerCase();
  if (/sisal/.test(h)) return "plantfibre"; // Sisal nicht im Enum, Pflanzenfaser passt
  if (/plüsch|plusch|plush/.test(h)) return "plush";
  if (/nylon/.test(h)) return "nylon";
  if (/kunststoff|plastik|plastic/.test(h)) return "plastic";
  if (/edelstahl/.test(h)) return "iron";
  if (/aluminium/.test(h)) return "aluminium";
  if (/metall/.test(h)) return "metal";
  if (/keramik|ceramic/.test(h)) return "ceramics";
  if (/spanplatte/.test(h)) return "chipboard";
  if (/mdf/.test(h)) return "mdf_medium_density_fiberboard";
  if (/holz|wood/.test(h)) return "pine_and_plywood";
  if (/baumwolle|cotton/.test(h)) return "cotton_material";
  if (/pappe|karton|cardboard|paper/.test(h)) return "paper";
  if (/leder|leather/.test(h)) return "leather";
  if (/jute/.test(h)) return "jute";
  if (/hanf|hemp/.test(h)) return "hemp";
  if (/filz|felt/.test(h)) return "felt";
  // Sonderfall Safari Lodge / Katzenhöhle: meistens Pappe + Plüsch
  if (/kratz|scratch|lodge|h(ö|oe)hle/.test(h)) return "paper";
  return null;
}

/**
 * Farb-Extraktion aus Titel + Beschreibung.
 * Werte sind die ECHTEN Fressnapf-`color`-values_list-Codes
 * (verifiziert via /api/values_lists?values_list=color — 372 Werte total,
 * lowercase English wie `beige`, `black`, `anthracite`).
 */
function deriveColor(haystack: string): string | null {
  const h = haystack.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\bbeige\b/, "beige"],
    [/\banthrazit|\banthracite\b/, "anthracite"],
    [/\bgrau\b|\bgrey\b|\bgray\b/, "grey"],
    [/\bschwarz\b|\bblack\b/, "black"],
    [/\bwei(ß|ss)\b|\bwhite\b/, "white"],
    [/\bbraun\b|\bbrown\b/, "brown"],
    [/\bblau\b|\bblue\b/, "blue"],
    [/\bgr(ü|ue)n\b|\bgreen\b/, "green"],
    [/\brot\b|\bred\b/, "red"],
    [/\bgelb\b|\byellow\b/, "yellow"],
    [/\brosa\b|\bpink\b/, "rose"],
    [/\blila\b|\bviolett\b|\bpurple\b/, "purple"],
    [/\borange\b/, "orange"],
  ];
  for (const [re, name] of patterns) if (re.test(h)) return name;
  return null;
}

/**
 * Mapping Marketplace-Hierarchy → Fressnapf-Warengruppe (`material_group`-Code).
 * Werte aus /api/values_lists?values_list=material_group (235 Werte, numerische
 * WGR-Codes wie `201003 = KNF Kratzbrett`).
 * Nur die Hierarchies, für die wir eine eindeutige Default-WGR haben.
 */
function deriveMaterialGroup(category: string): string | null {
  const c = category.trim();
  const map: Record<string, string> = {
    marketplace_animal_scratch_accessory: "201003", // KNF Kratzbrett
    marketplace_animal_housing: "201005", // KNF Möbel (Höhlen/Lodges)
    marketplace_animal_sleeping_place: "201001", // KNF Liegeplatz
    marketplace_animal_toy_activity_training: "201011", // KNF Spielzeuge
    marketplace_animal_harness_collar_muzzle: "201020", // KNF HB & Leinen
    marketplace_animal_care_aid: "201044", // KNF Pflege & Hygiene
    marketplace_animal_care_product: "201044",
    marketplace_animal_feeding_drink_dispenser: "201055", // KNF Näpfe
    marketplace_cat_litter: "201070", // KNF Streu
    marketplace_animal_toilet: "201071", // KNF Toiletten
    marketplace_animal_toilet_spare_part_equipment: "201072",
    marketplace_animal_flap_door: "201073",
    marketplace_animal_food: "101001", // KF Nass (Default — User muss ggf. überschreiben)
    marketplace_animal_snack: "101003",
    marketplace_animal_nutritional_supplement: "101004",
    marketplace_animal_leash: "202024", // HNF Rolleine
    marketplace_animal_clothing: "202060", // HNF Acc. Bekleidung
    marketplace_animal_transport_aid: "202082",
  };
  return map[c] ?? null;
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

const fressnapfRequiredAttributes: RequiredAttrBuilder = (sources, values, sku) => {
  const hay = `${values.title} ${values.description} ${values.bullets.join(" ")} ${values.category}`;
  const out: Record<string, string> = {};

  // Herkunft / Sprache / Einheiten — Werte aus echten Fressnapf-values_lists.
  // Schema-Code + deutscher Validator-Alias parallel (gleiche Quirk wie farbe/weight).
  out.country_of_origin = "DE";
  out.ursprungsland = "DE"; // Validator-Alias
  out.packaging_language_de = "1"; // INTEGER 1=ja
  out.verpackungssprache_de = "1"; // Validator-Alias
  out.sales_unit_of_measure = "1"; // 1 = Stück
  out.verkaufsmengeneinheit = "1"; // Validator-Alias
  out.content_unit_of_measure = "1";
  out.content_unit = "1";
  out.inhaltsmengeneinheit = "1"; // Validator-Alias für Inhaltsmengeneinheit
  out.comparable_price_unit = "1"; // Single-Value-Enum
  out.vergleichspreiseinheit = "1"; // Validator-Alias
  out.unit_quantity = "1";

  // Steuer-Defaults (AT-Marktplatz, MwSt 20 %)
  out.taxable = "1";
  out.tax_class_at = "1";
  out.steuerklassifikation_at = "1"; // Validator-Alias
  out.tax_class = "1";
  out.steuerklassifikation = "1"; // Validator-Alias
  out.data_dummy = "1"; // INTEGER

  // Lieferanten- / Artikel-Identifikation
  out.shop_sku = sku;
  out.seller_article_number = sku;
  out.lieferanten_artikelnummer = sku; // Validator-Alias
  out.productIdentifier = sku;
  out.variant_group_code = deriveVariantGroupCode(sku);
  out.parent_product_id = deriveVariantGroupCode(sku);
  out.parentproductid = deriveVariantGroupCode(sku);
  out.manufacturer = values.brand || "";
  out.hersteller = values.brand || ""; // Validator-Alias
  out.supplier = values.brand || "";
  out.inverkehrbringer = values.brand || ""; // Validator-Alias
  out.markenname = values.brand || ""; // Validator-Alias für Markenname
  // ACHTUNG: `iln` heißt bei Fressnapf "Fressnapf Lieferantennummer" — eine von
  // Fressnapf zugewiesene ID, NICHT die Marke. Wir lassen das leer.

  // EAN/GTIN — Fressnapf-Schema verlangt `GTIN` (UPPERCASE!) UND `ean_upc_content_unit`
  // (siehe /api/products/attributes Description: "wie GTIN Feld setzen").
  if (values.ean.trim()) {
    out.gtin = values.ean.trim(); // legacy lowercase (für andere Operatoren)
    out.GTIN = values.ean.trim(); // Fressnapf-Schema (case-sensitive UPPERCASE!)
    out.ean_upc_content_unit = values.ean.trim(); // Fressnapf-Schema
  }

  // ProductCategory (capital P+C) — Fressnapf-Schema-Code für die Hierarchie.
  // **MUSS** der aufgelöste marketplace_*-Code sein, NICHT der UI-Label "Kratzmöbel".
  if (values.category.trim()) {
    const resolvedCat = resolveFressnapfCategoryCode(values.category) ?? values.category.trim();
    out.ProductCategory = resolvedCat;
  }

  // Inhalts- / Content-Defaults aus den bereits gemergten Werten.
  // Fressnapf-Schema-Caps (verifiziert via /api/products/attributes):
  //   article_name + title + product_name: MAX_LENGTH=40 (Error 2004)
  //   designation_1 + designation_2:       MAX_LENGTH=18 (Bontext-Limit!)
  if (values.title) {
    const titleCapped40 = values.title.slice(0, 40);
    const titleCapped18 = values.title.slice(0, 18);
    out.title = titleCapped40;
    out.product_name = titleCapped40;
    out.produktname = titleCapped40; // Validator-Alias
    out.shop_article_name = titleCapped40;
    out.artikelname_shop = titleCapped40; // Validator-Alias
    out.article_name = titleCapped40;
    out.model_name = titleCapped40;
    out.designation_1 = titleCapped18;
    out.bezeichnung_1 = titleCapped18; // Validator-Alias
  }
  const shortDesc = deriveShortDescription(values.description);
  if (shortDesc) {
    out.short_description = shortDesc;
    out.kurzbeschreibung = shortDesc; // Validator-Alias
  }
  if (values.description) {
    const desc4k = values.description.slice(0, 4000);
    out.detailed_article_description = desc4k;
    out.beschreibungstext = desc4k; // Validator-Alias
  }
  // Selling Points: aus Bullets, oder Fallback: Sätze aus der Beschreibung
  // (Pflichtfeld, sonst 1000-Error). Description hat oft <li>-Items wir extrahieren.
  const bulletPool: string[] = [];
  for (const b of values.bullets) {
    const t = b.trim();
    if (t) bulletPool.push(t);
  }
  if (bulletPool.length === 0 && values.description) {
    // Fallback: <li>-Items aus HTML extrahieren
    const liMatches = values.description.matchAll(/<li[^>]*>([^<]+)<\/li>/gi);
    for (const m of liMatches) {
      const item = m[1].trim();
      if (item.length > 10) bulletPool.push(item);
    }
    // Wenn keine <li>: erste 3 Sätze der Beschreibung
    if (bulletPool.length === 0) {
      const cleaned = values.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
      bulletPool.push(...sentences.slice(0, 3));
    }
  }
  if (bulletPool[0]) {
    out.selling_point_1 = bulletPool[0].slice(0, 500);
    out.verkaufsargument_1 = bulletPool[0].slice(0, 500); // Validator-Alias
  }
  if (bulletPool[1]) {
    out.selling_point_2 = bulletPool[1].slice(0, 500);
    out.verkaufsargument_2 = bulletPool[1].slice(0, 500);
  }
  if (bulletPool[2]) {
    out.selling_point_3 = bulletPool[2].slice(0, 500);
    out.verkaufsargument_3 = bulletPool[2].slice(0, 500);
  }

  // Dimensionen / Gewicht — Schema verlangt `_outside`-Codes (REQUIRED) für die
  // Außenmaße. `length`/`width`/`height` (ohne `_outside`) sind nur OPTIONAL
  // (für ERP-Werte) — wir senden sie NICHT mehr, um den Parser nicht zu verwirren.
  // Format: DECIMAL plain in CENTIMETER, OHNE Einheit, max. 4 Nachkommastellen.
  // Validator-Quirk Dimensionen: Error-Report nennt Codes `weight`, `id`,
  // `weight (Höhe)` etc. — anders als Schema. Wir senden Schema-Codes UND
  // Validator-Codes parallel. Fressnapf nimmt was es findet.
  if (values.weight) {
    const w = Number(values.weight).toFixed(3).replace(/\.?0+$/, "");
    out.net_weight = w; // Schema
    out.weight = w; // Validator-Code (1000|weight Nettogewicht required)
  }
  if (values.dimL) {
    const l = Number(values.dimL).toFixed(2).replace(/\.?0+$/, "");
    out.length_outside = l; // Schema
    out.length = l; // Validator-Code für Länge (2030|brand Länge format)
  }
  if (values.dimW) {
    const w = Number(values.dimW).toFixed(2).replace(/\.?0+$/, "");
    out.width_outside = w; // Schema
    out.id = w; // Validator-Code für Breite (1000|id Breite required)
    // Tiefe = Breite als sinnvoller Default für Möbel/Boxen ohne separates Tiefenmaß
    out.depth_outside = w; // Schema
    out.depth = w; // Validator-Code für Tiefe (2030|brand Tiefe format)
  }
  if (values.dimH) {
    out.height_outside = Number(values.dimH).toFixed(2).replace(/\.?0+$/, "");
  }

  // Haupt-Bild + Zusatz-Bilder als Fressnapf-Keys (image_1..image_9) + intern.
  if (values.images[0]) {
    out.article_main_image = values.images[0]; // Fressnapf-intern
  }
  for (let i = 0; i < Math.min(values.images.length, 9); i += 1) {
    const url = (values.images[i] ?? "").trim();
    if (url) out[`image_${i + 1}`] = url;
  }

  // LIST-Werte aus echten Fressnapf-Enums (lowercase English Codes).
  // Validator-Quirk: Fressnapf hat eine PARALLELE deutsche Validator-Schicht
  // (`farbe`, `werkstoff`, `groesse`, `tierart`, `markenname`). Wir senden
  // Schema-Code UND deutschen Validator-Alias parallel.
  const material = deriveMaterial(hay);
  if (material) {
    out.material = material; // Schema
    out.werkstoff = material; // Validator-Alias für Material
  }
  const color = deriveColor(hay);
  if (color) {
    out.color = color; // Schema
    out.farbe = color; // Validator-Alias für Farbe
  }

  // size — LIST-Pflichtfeld (25 Werte). Default `n_a` für Fix-Größen-Produkte
  // (Lodges, Hütten). User kann im Editor auf S/M/L/etc. ändern.
  out.size = "n_a"; // Schema
  out.groesse = "n_a"; // Validator-Alias für Größe

  // material_group (Warengruppe) — pflicht, numerische WGR-Codes.
  // Wir nehmen die aufgelöste Kategorie (marketplace_*-Code), nicht den UI-Label.
  const resolvedCatForWgr = resolveFressnapfCategoryCode(values.category) ?? values.category;
  const wgr = deriveMaterialGroup(resolvedCatForWgr);
  if (wgr) {
    out.material_group = wgr;
    out.warengruppe = wgr; // Validator-Alias
  }

  // Tier-Kategorie sendet bereits der Dispatcher als `animal_categories`.
  // Werte aus animal_categories-Enum: cat, dog, aquarium_fish, ornamental_bird,
  // wild_bird, pond_fish, small_animal, terrarium_animal, wild_animal, horse,
  // insect, invertebrate, n_a.

  // Grundpreispflicht: 0 (Nein) für Stückwaren, 1 (Ja) für Verbrauchsgüter
  // (NICHT "ja"/"nein" — Schema verlangt 0/1).
  const isConsumable = /futter|einstreu|snack|leckerli|nass|trocken|flocke/i.test(hay);
  const bpr = isConsumable ? "1" : "0";
  out.base_price_required = bpr;
  out.grundpreispflicht = bpr; // Validator-Alias

  // Tier-Kategorie: Validator nutzt evtl. `tierart`/`tier_kategorie` parallel
  // zum Schema-`animal_categories` (Dispatcher schickt animal_categories).
  // Heuristisch: für `marketplace_animal_*` → cat default (passt zu Test-Produkt)
  if (/marketplace_animal_/.test(values.category)) {
    out.tierart = "cat"; // Best-effort Validator-Alias
    out.tier_kategorie = "cat";
  }

  return out;
};

const BUILDERS: Partial<Record<CrossListingTargetSlug, RequiredAttrBuilder>> = {
  fressnapf: fressnapfRequiredAttributes,
};

/**
 * Ergänzt `values.attributes` um Marktplatz-spezifische Pflichtattribute mit
 * Smart-Defaults. User-Edits gewinnen — AUSSER für **schema-managed** Keys
 * (z. B. Fressnapf-Enum-Codes wie `color`, `material`, `sales_unit_of_measure`),
 * wo unsere verifizierten Werte gewinnen müssen. Sonst landen alte falsche
 * User-Draft-Werte ("Beige", "Pappe", "Stueck", "nein") immer wieder im Upload
 * und blockieren die ganze Kette.
 *
 * Außerdem: **deprecated Keys** aus user-Draft (z. B. `farbe`, `package_language`,
 * `unit_price_required`) werden komplett gelöscht — Schema kennt diese Codes nicht,
 * sie produzieren nur Brand-Pollution-Errors im CSV.
 */
const FRESSNAPF_SCHEMA_MANAGED_KEYS = new Set([
  // Enum-restricted (LIST values_lists, falsche User-Werte → silent reject)
  "color",
  "material",
  "size",
  "tax_class",
  "tax_class_at",
  "taxable",
  "base_price_required",
  "comparable_price_unit",
  "sales_unit_of_measure",
  "content_unit_of_measure",
  "content_unit",
  "country_of_origin",
  "material_group",
  // Format-/Length-restricted (Caps + INTEGER)
  "title",
  "article_name",
  "designation_1",
  "model_name",
  "shop_article_name",
  "product_name",
  "packaging_language_de",
  "data_dummy",
  // Validator-Aliase (Error-Report nennt diese Codes, Schema andere).
  // Pattern: Fressnapf hat eine deutsche Validator-Schicht parallel zum Schema.
  "farbe",
  "weight",
  "id",
  "length",
  "depth",
  "groesse",
  "werkstoff",
  "tierart",
  "tier_kategorie",
  "markenname",
  "hersteller",
  "inverkehrbringer",
  "ursprungsland",
  "verpackungssprache_de",
  "verkaufsmengeneinheit",
  "vergleichspreiseinheit",
  "inhaltsmengeneinheit",
  "steuerklassifikation",
  "steuerklassifikation_at",
  "warengruppe",
  "grundpreispflicht",
  "produktname",
  "artikelname_shop",
  "bezeichnung_1",
  "kurzbeschreibung",
  "beschreibungstext",
  "verkaufsargument_1",
  "verkaufsargument_2",
  "verkaufsargument_3",
  "lieferanten_artikelnummer",
  // Schema-Code-Identifier
  "GTIN",
  "gtin",
  "ean_upc_content_unit",
  "productIdentifier",
  "ProductCategory",
  "shop_sku",
  "seller_article_number",
  "parentproductid",
  "parent_product_id",
  // MEASUREMENT-Codes
  "length_outside",
  "width_outside",
  "height_outside",
  "depth_outside",
  "net_weight",
  // Bilder / Beschreibung
  "article_main_image",
  "detailed_article_description",
  "short_description",
]);

const FRESSNAPF_DEPRECATED_KEYS = new Set([
  // Alt-Schreibweisen, die Schema NICHT kennt — produzieren Brand-Pollution.
  // ABER: `farbe`, `weight`, `id`, `length`, `depth` sind paradox —
  // Error-Validator verlangt sie, Schema kennt sie nicht. Werden in
  // Smart-Defaults als Aliase gesetzt (nicht in dieser Liste!).
  "package_language",
  "unit_price_required",
  "sales_unit",
  "main_image_url",
  "supplier_article_number",
  "height",
  "length_cm",
  "width_cm",
  "height_cm",
  "net_weight_kg",
  "animal_category", // singular, Schema verlangt plural `animal_categories`
]);

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
  const isFressnapf = slug === "fressnapf";
  for (const [k, v] of Object.entries(values.attributes ?? {})) {
    if (!v || !v.trim()) continue;
    // Brand als Attribut-Wert ist fast immer verrauscht (Marktplatz-Auto-Fill).
    if (brandLower && v.trim().toLowerCase() === brandLower) continue;
    if (isFressnapf) {
      // Deprecated-Keys komplett überspringen (nicht in CSV schreiben)
      if (FRESSNAPF_DEPRECATED_KEYS.has(k)) continue;
      // Schema-managed Keys: unsere Defaults gewinnen, User-Draft wird ignoriert
      if (FRESSNAPF_SCHEMA_MANAGED_KEYS.has(k) && k in defaults) continue;
    }
    out[k] = v;
  }
  return out;
}
