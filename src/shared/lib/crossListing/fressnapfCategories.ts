/**
 * Fressnapf Mirakl-Kategorien (Hierarchy-Codes).
 *
 * **WICHTIG (Stand 2026-04-21):** Fressnapfs Mirakl verwendet NICHT die
 * numerischen Warengruppen-Codes aus `Fressnapf_Warengruppen.xlsx` (z. B.
 * "201001"), sondern eigene `marketplace_*`-Hierarchy-Codes. Die WGR-Codes
 * werden von Mirakl mit "1001|The category 201001 is unknown" abgelehnt
 * (Fehlerberichte 120065/120076/120086).
 *
 * Diese Liste stammt aus `GET /api/hierarchies` der Fressnapf-Mirakl-Instanz
 * (fressnapfde-prod.mirakl.net). Jeder Artikel muss im PM01-CSV den
 * `category`-Wert aus dieser Liste tragen.
 *
 * Zusätzlich verlangt Mirakl pro Hierarchie weitere Pflicht-Attribute
 * (z. B. `animal_categories`, `material`, `size`, `color`) — diese werden
 * vom submitListingDispatcher in das CSV geschrieben, soweit Daten vorliegen.
 */

export type FressnapfCategory = {
  /** Mirakl hierarchy code (z. B. "marketplace_animal_housing"). */
  code: string;
  /** Deutscher Anzeigename (Labels aus /api/hierarchies). */
  labelDe: string;
};

/**
 * Vollständige Liste aus `/api/hierarchies` (Stand 2026-04-21, Fressnapfde-prod).
 * 41 Codes (4 mehr als frühere Annahme: backpacks_and_bags, clothing, shoes).
 */
export const FRESSNAPF_CATEGORIES: readonly FressnapfCategory[] = [
  { code: "marketplace_accessoires", labelDe: "Accessoires" },
  { code: "marketplace_animal_care_aid", labelDe: "Tier-Pflegehilfe" },
  { code: "marketplace_animal_care_product", labelDe: "Tier-Pflegemittel" },
  { code: "marketplace_animal_clothing", labelDe: "Tier-Bekleidung" },
  { code: "marketplace_animal_diaper_protective_pant", labelDe: "Tier-Windeln & Schutzhöschen" },
  { code: "marketplace_animal_drink", labelDe: "Tier-Getränk" },
  { code: "marketplace_animal_feeding_drink_dispenser", labelDe: "Tier-Fütterungszubehör & Tränken" },
  { code: "marketplace_animal_flap_door", labelDe: "Tier-Klappen & Türen" },
  { code: "marketplace_animal_food", labelDe: "Tier-Futter" },
  { code: "marketplace_animal_harness_collar_muzzle", labelDe: "Tier-Geschirre, Halsbänder & Maulkörbe" },
  { code: "marketplace_animal_housing", labelDe: "Tier-Behausung" },
  { code: "marketplace_animal_housing_facility", labelDe: "Tier-Behausungseinrichtung" },
  { code: "marketplace_animal_leash", labelDe: "Tier-Leinen" },
  { code: "marketplace_animal_nutritional_supplement", labelDe: "Tier-Nahrungsergänzung" },
  { code: "marketplace_animal_otc_medication", labelDe: "Tier-Rezeptfreie Medikamente" },
  { code: "marketplace_animal_scratch_accessory", labelDe: "Tier-Kratzzubehör" },
  { code: "marketplace_animal_sleeping_place", labelDe: "Tier-Schlafplatz" },
  { code: "marketplace_animal_snack", labelDe: "Tier-Snack" },
  { code: "marketplace_animal_toilet", labelDe: "Tier-Toiletten" },
  { code: "marketplace_animal_toilet_spare_part_equipment", labelDe: "Tier-Toiletten-Ersatzteile & Zubehör" },
  { code: "marketplace_animal_toy_activity_training", labelDe: "Tier-Spielzeug, Beschäftigung & Training" },
  { code: "marketplace_animal_transport_aid", labelDe: "Tier-Transporthilfen" },
  { code: "marketplace_backpacks_and_bags", labelDe: "Rucksäcke und Taschen" },
  { code: "marketplace_base_substrate", labelDe: "Bodengrund" },
  { code: "marketplace_books_media", labelDe: "Bücher & Medien" },
  { code: "marketplace_car_supply", labelDe: "Autozubehör" },
  { code: "marketplace_cat_litter", labelDe: "Katzenstreu" },
  { code: "marketplace_cleaning_accessory", labelDe: "Reinigungszubehör" },
  { code: "marketplace_cleanser", labelDe: "Reinigungsmittel" },
  { code: "marketplace_clothing", labelDe: "Kleidung" },
  { code: "marketplace_lighting_heat_lamp", labelDe: "Beleuchtung & Wärmelampe" },
  { code: "marketplace_other_supply", labelDe: "Sonstiges Zubehör" },
  { code: "marketplace_pesticides", labelDe: "Schädlingsbekämpfungsmittel" },
  { code: "marketplace_riding_accessories", labelDe: "Reitzubehör" },
  { code: "marketplace_set", labelDe: "Set" },
  { code: "marketplace_shoes", labelDe: "Schuhe" },
  { code: "marketplace_small_animal_housing_bath_sandpit", labelDe: "Kleintierhäuser, Badehäuser & Buddelkisten" },
  { code: "marketplace_technic_technical_accessory", labelDe: "Technik & Technikzubehör" },
  { code: "marketplace_veterinary_medical_equipment", labelDe: "Tier-Medizinisches Zubehör" },
  { code: "marketplace_water_care", labelDe: "Wasserpflege" },
];

/**
 * Erlaubte Werte für `animal_categories` (aus `/api/values_lists`).
 * Nur diese Werte werden von Fressnapfs PM01 akzeptiert.
 */
export const FRESSNAPF_ANIMAL_CATEGORIES = [
  "aquarium_fish",
  "cat",
  "dog",
  "horse",
  "insect",
  "invertebrate",
  "n_a",
  "ornamental_bird",
  "pond_fish",
  "small_animal",
  "terrarium_animal",
  "wild_animal",
  "wild_bird",
] as const;
export type FressnapfAnimalCategory = (typeof FRESSNAPF_ANIMAL_CATEGORIES)[number];

/**
 * Verifiziert aktive PM01-Kategorien auf Fressnapf (Stand 2026-04-21,
 * aus Sample der existierenden Offers des Users). Nur diese Codes wurden
 * **real beobachtet** in der `category_code`-Spalte bestehender Produkte:
 *
 *   marketplace_animal_care_aid
 *   marketplace_animal_feeding_drink_dispenser
 *   marketplace_animal_scratch_accessory   ← alle Katzenmöbel/Lodges/Türme
 *   marketplace_animal_toilet
 *   marketplace_animal_toilet_spare_part_equipment
 *   marketplace_cat_litter
 *   marketplace_riding_accessories
 *   marketplace_technic_technical_accessory
 *
 * `marketplace_animal_housing` ist zwar in /api/hierarchies gelistet, wird aber
 * von PM01 (noch) als unknown rejected. Möglicherweise bei Fressnapf nicht
 * für Seller-Uploads aktiviert. → Lodges/Kratzmöbel routen wir jetzt auf
 * `scratch_accessory` (wo alle existierenden Produkte auch stehen).
 */
const DEPRECATED_CODE_REPLACEMENTS: Record<string, string> = {
  // Katze
  "201001": "marketplace_animal_scratch_accessory", // KNF Liegeplatz → Kratz-Möbel (housing/sleeping inaktiv)
  "201002": "marketplace_animal_scratch_accessory", // KNF Kratzbäume
  "201003": "marketplace_animal_scratch_accessory", // KNF Kratzbretter & -pappen
  "201005": "marketplace_animal_scratch_accessory", // KNF Möbel (Höhlen/Lodges mit Kratzbrett)
  "201011": "marketplace_animal_toy_activity_training",
  "201020": "marketplace_animal_harness_collar_muzzle",
  "201044": "marketplace_animal_care_product",
  "201055": "marketplace_animal_feeding_drink_dispenser",
  "201070": "marketplace_cat_litter",
  "201071": "marketplace_animal_toilet",
  "201072": "marketplace_animal_toilet_spare_part_equipment",
  "201073": "marketplace_animal_flap_door",
  // Hund
  "202001": "marketplace_animal_sleeping_place",
  "202002": "marketplace_animal_housing",
  "202011": "marketplace_animal_toy_activity_training",
  "202021": "marketplace_animal_harness_collar_muzzle",
  "202022": "marketplace_animal_harness_collar_muzzle",
  "202024": "marketplace_animal_leash",
  "202041": "marketplace_animal_care_aid",
  "202048": "marketplace_animal_care_product",
  "202055": "marketplace_animal_feeding_drink_dispenser",
  "202060": "marketplace_animal_clothing",
  "202063": "marketplace_accessoires",
  "202082": "marketplace_animal_transport_aid",
  // Futter
  "101001": "marketplace_animal_food",
  "101002": "marketplace_animal_food",
  "101003": "marketplace_animal_snack",
  "102001": "marketplace_animal_food",
  "102002": "marketplace_animal_food",
  "102003": "marketplace_animal_snack",
  "102004": "marketplace_animal_nutritional_supplement",
  "102011": "marketplace_animal_food",
};

/**
 * Heuristisches Mapping aus deutschen Rohdaten-Labels (z. B. "Kratzmöbel")
 * auf Mirakl-Hierarchy-Codes. Reihenfolge ist wichtig — spezifischere
 * Patterns zuerst.
 */
const LABEL_HINTS: Array<{ pattern: RegExp; code: string }> = [
  // Kratzzubehör — umfasst ALLE Katzenmöbel mit Kratzfunktion.
  // Fressnapf klassifiziert Kratzbäume, Lodges-mit-Kratzbrett, Tonnen, Pappen
  // alle unter scratch_accessory (sample aus /api/offers bestätigt).
  {
    pattern:
      /kratz|scratch|katzenh(ö|oe)hle|katzenm(ö|oe)bel|lodge|cave|tower|kratztonne|kuschel.*katz/i,
    code: "marketplace_animal_scratch_accessory",
  },
  // Toilette & Klappen
  { pattern: /katzentoil|katzenklo|litter.?box|tier.?toilette/i, code: "marketplace_animal_toilet" },
  { pattern: /toilettenzubeh(ö|oe)r|streuschaufel|katzenstreumatte|kotbeutel/i, code: "marketplace_animal_toilet_spare_part_equipment" },
  { pattern: /katzenklappe|hundeklappe|flap.?door|(katzen|hunde).?t(ü|ue)r/i, code: "marketplace_animal_flap_door" },
  { pattern: /streu|cat.?litter/i, code: "marketplace_cat_litter" },
  // Echte Behausung (NUR für Hundehütten/Kleintierhäuser — `animal_housing`
  // wird von Fressnapf-PM01 aktuell NICHT für Seller-Uploads akzeptiert,
  // aber wenn ein User explizit für Hund/Kleintier unterwegs ist, lassen
  // wir das Mapping stehen).
  { pattern: /hundeh(ü|ue)tte|kleintierhaus|kleintierh(ä|ae)user|housing/i, code: "marketplace_animal_housing" },
  { pattern: /behausung.?einrichtung|housing.?facility/i, code: "marketplace_animal_housing_facility" },
  // Liege/Schlafplatz (ohne Kratz-/Lodge-Elemente)
  { pattern: /katzenbett|hundebett|liegeplatz|schlafplatz|sleeping.?place|bed\b/i, code: "marketplace_animal_sleeping_place" },
  // Näpfe & Fütterung
  { pattern: /trinkbrunnen|napf|bowl|feeding|wassersp/i, code: "marketplace_animal_feeding_drink_dispenser" },
  // Spielzeug
  { pattern: /spielzeug|spielz\.|toy|activity|training/i, code: "marketplace_animal_toy_activity_training" },
  // HB / Leine / Geschirr
  { pattern: /leine|leash/i, code: "marketplace_animal_leash" },
  { pattern: /halsband|geschirr|maulkorb|harness|collar|muzzle/i, code: "marketplace_animal_harness_collar_muzzle" },
  // Bekleidung / Accessoires
  { pattern: /bekleidung|mantel|pullover|clothing/i, code: "marketplace_animal_clothing" },
  // Transport
  { pattern: /transport|trage|carrier|transportbox/i, code: "marketplace_animal_transport_aid" },
  // Pflege
  { pattern: /b(ü|ue)rste|brush|care.?aid|schermaschine/i, code: "marketplace_animal_care_aid" },
  { pattern: /shampoo|pflege|care.?product|ungeziefer/i, code: "marketplace_animal_care_product" },
  // Futter
  { pattern: /snack|leckerli|kauartikel|treat/i, code: "marketplace_animal_snack" },
  { pattern: /futter|food|(haupt|trocken|nass)?nahrung/i, code: "marketplace_animal_food" },
  { pattern: /nahrungserg(ä|ae)nzung|supplement/i, code: "marketplace_animal_nutritional_supplement" },
  { pattern: /get(ä|ae)nk|drink|wasser/i, code: "marketplace_animal_drink" },
];

/**
 * Mirakl-Codes, die laut Hierarchies existieren, aber von Fressnapfs PM01
 * (noch) nicht für Seller-Uploads akzeptiert werden. Auf nächstbesten
 * real-aktiven Code umleiten.
 *
 * Quelle: Sample aus /api/offers zeigte, welche Codes echte existierende
 * Produkte tragen (Stand 2026-04-21).
 */
const PM01_INACTIVE_REDIRECTS: Record<string, string> = {
  marketplace_animal_housing: "marketplace_animal_scratch_accessory",
  marketplace_animal_housing_facility: "marketplace_animal_scratch_accessory",
  marketplace_animal_sleeping_place: "marketplace_animal_scratch_accessory",
  marketplace_animal_toy_activity_training: "marketplace_animal_scratch_accessory",
};

/**
 * Mappt eine User-Eingabe (Hierarchy-Code, deutscher Name oder Label) auf
 * einen Fressnapf-Mirakl-Hierarchy-Code. Gibt null zurück wenn nichts passt.
 */
export function resolveFressnapfCategoryCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 1) Bereits ein marketplace_*-Code?
  if (/^marketplace_[a-z_]+$/.test(trimmed)) {
    const hit = FRESSNAPF_CATEGORIES.find((c) => c.code === trimmed);
    if (!hit) return null;
    // PM01-inaktive Codes auf real-aktive umleiten
    return PM01_INACTIVE_REDIRECTS[hit.code] ?? hit.code;
  }
  // 2) Alt-WGR-Code (numerisch) aus dem Warengruppen-xlsx?
  if (/^\d{6}$/.test(trimmed)) {
    return DEPRECATED_CODE_REPLACEMENTS[trimmed] ?? null;
  }
  // 3) Voller deutscher Label (z. B. "Tier-Behausung")
  const byLabel = FRESSNAPF_CATEGORIES.find(
    (c) => c.labelDe.toLowerCase() === trimmed.toLowerCase()
  );
  if (byLabel) return PM01_INACTIVE_REDIRECTS[byLabel.code] ?? byLabel.code;
  // 4) Heuristisches Hint-Mapping auf deutsches Rohlabel
  for (const hint of LABEL_HINTS) {
    if (hint.pattern.test(trimmed)) {
      return PM01_INACTIVE_REDIRECTS[hint.code] ?? hint.code;
    }
  }
  return null;
}

export function fressnapfCategoryLabel(code: string): string {
  const hit = FRESSNAPF_CATEGORIES.find((c) => c.code === code);
  return hit ? `${code} — ${hit.labelDe}` : code;
}

/**
 * Ermittelt die Tierart (`cat`, `dog`, `small_animal`, ...) aus Freitext-
 * Signalen (Titel/Beschreibung), um das Pflicht-Attribut `animal_categories`
 * im Mirakl-PM01-Upload zu füllen. Rückgabewerte entsprechen den Codes aus
 * Fressnapfs `/api/values_lists` (values_list=animal_categories).
 *
 * Reale Fressnapf-Werte (Stand 2026-04-21):
 *   aquarium_fish, cat, dog, horse, insect, invertebrate, n_a,
 *   ornamental_bird, pond_fish, small_animal, terrarium_animal,
 *   wild_animal, wild_bird.
 * (NICHT `bird`, `reptile`, `fish` — das wäre ein ungültiger Wert!)
 */
export function detectFressnapfAnimalCategory(text: string): FressnapfAnimalCategory | null {
  const t = text.toLowerCase();
  if (/katze|katzen|cat\b|kitten/.test(t)) return "cat";
  if (/hund|hunde|dog\b|welpe|puppy/.test(t)) return "dog";
  if (/ziervogel|kanarien|wellensittich|sittich|papagei/.test(t)) return "ornamental_bird";
  if (/wildvogel|wild.?bird|gartenvogel|meise|amsel/.test(t)) return "wild_bird";
  if (/teichfisch|koi\b|pond.?fish/.test(t)) return "pond_fish";
  if (/aquarium|zierfisch|fisch|fish/.test(t)) return "aquarium_fish";
  if (/kaninchen|rabbit|hamster|meerschwein|nager|frettchen|chinchilla/.test(t)) return "small_animal";
  if (/pferd|horse|reit|pony/.test(t)) return "horse";
  if (/terrarium|schlange|echse|gecko|schildkröte|reptil/.test(t)) return "terrarium_animal";
  if (/nutztier|wild.?tier|farm.?animal/.test(t)) return "wild_animal";
  if (/insekt|insect|grille|heuschrecke/.test(t)) return "insect";
  if (/wirbellos|invertebrate|krebs|garnele|schnecke/.test(t)) return "invertebrate";
  return null;
}
