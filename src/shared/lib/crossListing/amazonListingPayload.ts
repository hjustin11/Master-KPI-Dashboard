import type { CrossListingDraftValues } from "./crossListingDraftTypes";
import { translateToApiKey, getProductTypes } from "@/shared/lib/amazon/attributeRegistry";
import { getLanguageTagForMarketplaceId } from "@/shared/config/amazonMarketplaces";

export type BuildAmazonListingPayloadArgs = {
  values: CrossListingDraftValues;
  marketplaceId: string;
  productType: string;
  languageTag?: string;
  sku?: string;
};

export type AmazonListingPutBody = {
  productType: string;
  requirements: "LISTING";
  attributes: Record<string, unknown>;
};

export type ValidationIssue = { field: string; message: string };

export type BuildResult =
  | { ok: true; body: AmazonListingPutBody; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

const HTTPS_PREFIX = /^https:\/\//i;
const EAN_REGEX = /^\d{8,14}$/;

/** Produkttypen die Elektro-Pflichtfelder brauchen. */
const ELECTRIC_TYPES = new Set(["HAIR_TRIMMER"]);

/** Produkttypen die Lebensmittel-Felder brauchen. */
const FOOD_TYPES = new Set(["FOOD_STORAGE_CONTAINER"]);

/** Produkttypen die warranty_description NICHT akzeptieren. */
const NO_WARRANTY_TYPES = new Set(["WASTE_BAG", "AREA_DEODORIZER", "FOOD_STORAGE_CONTAINER"]);

/** Produkttypen die epr_product_packaging NICHT akzeptieren. */
const NO_EPR_TYPES = new Set(["WASTE_BAG"]);

/** Produkttypen die specific_uses_for_product NICHT akzeptieren. */
const NO_SPECIFIC_USES_TYPES = new Set(["WASTE_BAG"]);

/** Produkttypen die directions NICHT akzeptieren. */
const NO_DIRECTIONS_TYPES = new Set(["WASTE_BAG"]);

function toNumber(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function nonEmpty(s: string | undefined | null): string | null {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
}

function loc(value: string, mid: string, lang: string) {
  return { value, language_tag: lang, marketplace_id: mid };
}

function plain(value: unknown, mid: string) {
  return { value, marketplace_id: mid };
}

/**
 * Liest einen Wert aus den Draft-Attributes (deutsch-keys oder API-keys).
 * Übersetzt ihn über die Registry-Alias-Mappings in den API-Key.
 */
function attr(
  attrs: Record<string, string>,
  apiField: string,
  germanLabels: string[],
  aliasKey?: string
): string | null {
  // Suche erst API-Key, dann deutsche Labels
  const raw = nonEmpty(attrs[apiField]) ?? germanLabels.reduce<string | null>(
    (found, label) => found ?? nonEmpty(attrs[label]),
    null
  );
  if (!raw) return null;
  if (aliasKey) return translateToApiKey(aliasKey, raw);
  return raw;
}

export function buildAmazonListingPutBody(
  args: BuildAmazonListingPayloadArgs
): BuildResult {
  const { values, marketplaceId, sku } = args;
  const productType = args.productType.trim();
  const languageTag = args.languageTag ?? getLanguageTagForMarketplaceId(marketplaceId);
  const attrs = values.attributes ?? {};

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- Validierung ---
  const title = nonEmpty(values.title);
  const brand = nonEmpty(values.brand);
  const description = nonEmpty(values.description);
  const ean = nonEmpty(values.ean);
  const priceEur = toNumber(values.priceEur);

  if (!marketplaceId) errors.push({ field: "marketplaceId", message: "marketplaceId fehlt." });
  if (!title) errors.push({ field: "title", message: "Titel ist Pflicht." });
  if (!brand) errors.push({ field: "brand", message: "Marke ist Pflicht." });
  if (priceEur === null || priceEur <= 0) {
    errors.push({ field: "priceEur", message: "Preis (>0) ist Pflicht." });
  }
  if (ean && !EAN_REGEX.test(ean)) {
    errors.push({ field: "ean", message: "EAN muss 8–14 Ziffern haben." });
  }

  const validTypes = getProductTypes();
  if (!validTypes.includes(productType)) {
    warnings.push({ field: "productType", message: `Produkttyp '${productType}' nicht in Registry. Wird trotzdem gesendet.` });
  }

  const validImages = values.images
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && HTTPS_PREFIX.test(u));
  if (values.images.length - validImages.length > 0) {
    warnings.push({ field: "images", message: `${values.images.length - validImages.length} Bild(er) ohne https übersprungen.` });
  }
  if (validImages.length === 0) {
    errors.push({ field: "images", message: "Mindestens ein https-Bild ist Pflicht." });
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  // --- Payload bauen ---
  const a: Record<string, unknown> = {};

  // IDENTIFIKATION
  a.item_name = [loc(title!, marketplaceId, languageTag)];
  a.brand = [loc(brand!, marketplaceId, languageTag)];
  a.manufacturer = [loc(nonEmpty(attrs.manufacturer) ?? brand!, marketplaceId, languageTag)];

  if (description) a.product_description = [loc(description, marketplaceId, languageTag)];

  const bullets = values.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 5);
  if (bullets.length > 0) a.bullet_point = bullets.map((b) => loc(b, marketplaceId, languageTag));

  // BILDER
  a.main_product_image_locator = [{ media_location: validImages[0], marketplace_id: marketplaceId }];
  for (let i = 1; i <= 8 && i < validImages.length; i++) {
    a[`other_product_image_locator_${i}`] = [{ media_location: validImages[i], marketplace_id: marketplaceId }];
  }

  // EAN
  if (ean) {
    a.externally_assigned_product_identifier = [{ type: "ean", value: ean, marketplace_id: marketplaceId }];
  }

  // PREIS
  a.list_price = [{ currency: "EUR", value_with_tax: priceEur, marketplace_id: marketplaceId }];
  a.purchasable_offer = [{ currency: "EUR", our_price: [{ schedule: [{ value_with_tax: priceEur }] }], marketplace_id: marketplaceId }];

  // BESTAND
  const stockQty = toNumber(values.stockQty);
  if (stockQty !== null && stockQty >= 0) {
    const channel = attr(attrs, "fulfillment_channel_code", ["Fulfillment-Kanal"], "fulfillment_availability.fulfillment_channel_code") ?? "DEFAULT";
    a.fulfillment_availability = [{ fulfillment_channel_code: channel, quantity: Math.max(0, Math.trunc(stockQty)) }];
  }

  // MAßE — item_dimensions (Artikel, required) + item_package_dimensions (Verpackung)
  const dimL = toNumber(values.dimL) ?? toNumber(attrs.item_length ?? "") ?? 10;
  const dimW = toNumber(values.dimW) ?? toNumber(attrs.item_width ?? "") ?? 10;
  const dimH = toNumber(values.dimH) ?? toNumber(attrs.item_height ?? "") ?? 5;
  const dims = {
    length: { value: dimL, unit: "centimeters" },
    width: { value: dimW, unit: "centimeters" },
    height: { value: dimH, unit: "centimeters" },
    marketplace_id: marketplaceId,
  };
  a.item_dimensions = [dims];
  a.item_package_dimensions = [dims];
  const weight = toNumber(values.weight);
  if (weight && weight > 0) {
    a.item_package_weight = [{ value: weight, unit: "kilograms", marketplace_id: marketplaceId }];
  }

  // MODELL
  a.model_number = [plain(nonEmpty(attrs.model_number) ?? sku ?? brand!, marketplaceId)];
  a.model_name = [loc(nonEmpty(attrs.model_name) ?? title!, marketplaceId, languageTag)];

  // FARBE
  const color = nonEmpty(attrs.color) ?? nonEmpty(attrs.Farbe) ?? "Mehrfarbig";
  a.color = [loc(color, marketplaceId, languageTag)];

  // URSPRUNGSLAND — Alias-Übersetzung deutsch → ISO
  const originRaw = attr(attrs, "country_of_origin", ["Ursprungsland"], "country_of_origin.value") ?? "DE";
  a.country_of_origin = [plain(originRaw, marketplaceId)];

  // EINHEITEN — unit_count: { value: N, type: { language_tag, value }, marketplace_id }
  const unitRaw = attrs.unit_count ?? "1";
  const unitMatch = unitRaw.match(/(\d+)/);
  const unitVal = unitMatch ? parseInt(unitMatch[1], 10) : 1;
  a.unit_count = [{
    value: unitVal,
    type: { language_tag: languageTag, value: "stück" },
    marketplace_id: marketplaceId,
  }];

  // ANZAHL ARTIKEL — Amazon verlangt number_of_items für WASTE_BAG
  const numItems = toNumber(attrs.number_of_items ?? "1") ?? 1;
  a.number_of_items = [{ value: numItems, marketplace_id: marketplaceId }];

  // ZUSTAND — Alias-Übersetzung
  const conditionRaw = nonEmpty(values.condition) ?? "Neu";
  const conditionApi = translateToApiKey("condition_type.value", conditionRaw);
  a.condition_type = [{ value: conditionApi, marketplace_id: marketplaceId }];

  // COMPLIANCE — immer senden
  const dgHz = attr(attrs, "supplier_declared_dg_hz_regulation", ["Gefahrgutvorschrift"], "supplier_declared_dg_hz_regulation.value") ?? "not_applicable";
  a.supplier_declared_dg_hz_regulation = [plain(dgHz, marketplaceId)];

  const batRequired = attr(attrs, "batteries_required", ["Batterien erforderlich?"], "batteries_required.value") ?? "false";
  a.batteries_required = [plain(batRequired, marketplaceId)];

  const batIncluded = attr(attrs, "batteries_included", ["Batterien enthalten?"], "batteries_included.value") ?? "false";
  a.batteries_included = [plain(batIncluded, marketplaceId)];

  // EPR Verpackung — nur wenn Produkttyp es akzeptiert
  if (!NO_EPR_TYPES.has(productType)) {
    const eprMaterial = attr(attrs, "epr_product_packaging.main_material", ["Verpackungsmaterial"], "epr_product_packaging.main_material") ?? "paper";
    a["epr_product_packaging"] = [{ main_material: eprMaterial, marketplace_id: marketplaceId }];
  }

  // GARANTIE — nur wenn Produkttyp es akzeptiert
  if (!NO_WARRANTY_TYPES.has(productType)) {
    const warranty = nonEmpty(attrs.warranty_description) ?? "Gesetzliche Gewährleistung";
    a.warranty_description = [loc(warranty, marketplaceId, languageTag)];
  }

  // BROWSE-NODE
  const browseNode = nonEmpty(attrs.recommended_browse_nodes);
  if (browseNode) a.recommended_browse_nodes = [plain(browseNode, marketplaceId)];

  // --- PRODUKTTYP-ABHÄNGIGE FELDER ---

  // Felder die NUR für Elektro-Produkte relevant sind
  if (ELECTRIC_TYPES.has(productType)) {
    const plugType = attr(attrs, "power_plug_type", ["Netzstecker"]);
    if (plugType) a.power_plug_type = [plain(plugType, marketplaceId)];

    const voltage = attr(attrs, "accepted_voltage_frequency", ["Zulässige Spannungsfrequenz"]);
    if (voltage) a.accepted_voltage_frequency = [plain(voltage, marketplaceId)];

    const energy = attr(attrs, "eu_energy_label_efficiency_class", ["EU-Energieeffizienzklasse"]);
    if (energy) a.eu_energy_label_efficiency_class = [plain(energy, marketplaceId)];

    const efficiency = nonEmpty(attrs.efficiency);
    if (efficiency) a.efficiency = [loc(efficiency, marketplaceId, languageTag)];
  }
  // NICHT-Elektro: diese Felder NICHT senden → Amazon verlangt sie nicht

  // Lebensmittel-Felder nur wenn relevant
  if (FOOD_TYPES.has(productType)) {
    const food = attr(attrs, "contains_food_or_beverage", ["Enthält Lebensmittel?"], "batteries_required.value") ?? "false";
    a.contains_food_or_beverage = [plain(food, marketplaceId)];
    const liquid = attr(attrs, "contains_liquid_contents", ["Enthält Flüssigkeit?"], "batteries_required.value") ?? "false";
    a.contains_liquid_contents = [plain(liquid, marketplaceId)];
  }

  // Allgemeine optionale Felder — nur wenn Produkttyp sie akzeptiert
  if (!NO_DIRECTIONS_TYPES.has(productType)) {
    const directions = nonEmpty(attrs.directions);
    if (directions) a.directions = [loc(directions, marketplaceId, languageTag)];
  }

  if (!NO_SPECIFIC_USES_TYPES.has(productType)) {
    const specificUses = nonEmpty(attrs.specific_uses_for_product) ?? nonEmpty(values.petSpecies);
    if (specificUses) a.specific_uses_for_product = [loc(specificUses, marketplaceId, languageTag)];
  }

  // included_components — required für WASTE_BAG, immer senden
  const components = nonEmpty(attrs.included_components) ?? `1x ${title}`;
  a.included_components = [loc(components, marketplaceId, languageTag)];

  // Versandvorlage
  const shippingGroup = attr(attrs, "merchant_shipping_group", ["Versandvorlage"], "merchant_shipping_group.value");
  if (shippingGroup) a.merchant_shipping_group = [plain(shippingGroup, marketplaceId)];

  // --- Restliche User-Attribute (nicht-doppelte) ---
  for (const [k, v] of Object.entries(attrs)) {
    if (!k || typeof v !== "string" || !v.trim()) continue;
    if (a[k] !== undefined) continue;
    // Skip interne Steuer-Keys
    if (["unit_count_type", "unit_count", "number_of_items", "Ursprungsland",
      "Gefahrgutvorschrift", "Batterien erforderlich?",
      "Batterien enthalten?", "Verpackungsmaterial", "Fulfillment-Kanal", "Versandvorlage",
      "Farbe", "Browse-Node-ID", "Enthält Lebensmittel?", "Enthält Flüssigkeit?",
      "Netzstecker", "Zulässige Spannungsfrequenz", "EU-Energieeffizienzklasse",
      "recommended_browse_nodes", "included_components", "warranty_description",
      "epr_product_packaging.main_material",
      "directions", "specific_uses_for_product",
      "item_length", "item_width", "item_height",
    ].includes(k)) continue;
    a[k] = [{ value: v.trim(), marketplace_id: marketplaceId }];
  }

  return {
    ok: true,
    body: { productType, requirements: "LISTING", attributes: a },
    warnings,
  };
}
