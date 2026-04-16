import type { CrossListingDraftValues } from "./crossListingDraftTypes";

export type BuildAmazonListingPayloadArgs = {
  values: CrossListingDraftValues;
  marketplaceId: string;
  productType?: string;
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

function toNumber(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function nonEmptyString(s: string): string | null {
  const v = s?.trim() ?? "";
  return v.length > 0 ? v : null;
}

function localizedValue(value: string, marketplaceId: string, languageTag: string) {
  return { value, language_tag: languageTag, marketplace_id: marketplaceId };
}

function plainValue(value: unknown, marketplaceId: string) {
  return { value, marketplace_id: marketplaceId };
}

export function buildAmazonListingPutBody(
  args: BuildAmazonListingPayloadArgs
): BuildResult {
  const { values, marketplaceId } = args;
  const productType = (args.productType ?? "PRODUCT").trim() || "PRODUCT";
  const languageTag = args.languageTag ?? "de_DE";

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const title = nonEmptyString(values.title);
  const brand = nonEmptyString(values.brand);
  const description = nonEmptyString(values.description);
  const ean = nonEmptyString(values.ean);
  const priceEur = toNumber(values.priceEur);
  const stockQty = toNumber(values.stockQty);

  if (!marketplaceId) errors.push({ field: "marketplaceId", message: "marketplaceId fehlt." });
  if (!title) errors.push({ field: "title", message: "Titel ist Pflicht." });
  if (!brand) errors.push({ field: "brand", message: "Marke ist Pflicht." });
  if (priceEur === null || priceEur <= 0) {
    errors.push({ field: "priceEur", message: "Preis (>0) ist Pflicht." });
  }
  if (ean && !EAN_REGEX.test(ean)) {
    errors.push({ field: "ean", message: "EAN muss 8–14 Ziffern haben." });
  }

  const validImages = values.images
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && HTTPS_PREFIX.test(u));
  const droppedImageCount = values.images.length - validImages.length;
  if (droppedImageCount > 0) {
    warnings.push({
      field: "images",
      message: `${droppedImageCount} Bild(er) ohne https übersprungen.`,
    });
  }
  if (validImages.length === 0) {
    errors.push({ field: "images", message: "Mindestens ein https-Bild ist Pflicht." });
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const attributes: Record<string, unknown> = {};

  attributes.item_name = [localizedValue(title!, marketplaceId, languageTag)];
  attributes.brand = [localizedValue(brand!, marketplaceId, languageTag)];

  if (description) {
    attributes.product_description = [localizedValue(description, marketplaceId, languageTag)];
  }

  const bullets = values.bullets
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .slice(0, 5);
  if (bullets.length > 0) {
    attributes.bullet_point = bullets.map((b) => localizedValue(b, marketplaceId, languageTag));
  }

  // Amazon erwartet media_location als Toplevel-Key neben marketplace_id, NICHT verschachtelt in value.
  attributes.main_product_image_locator = [
    { media_location: validImages[0], marketplace_id: marketplaceId },
  ];
  for (let i = 1; i <= 8 && i < validImages.length; i++) {
    attributes[`other_product_image_locator_${i}`] = [
      { media_location: validImages[i], marketplace_id: marketplaceId },
    ];
  }

  if (ean) {
    attributes.externally_assigned_product_identifier = [
      { type: "ean", value: ean, marketplace_id: marketplaceId },
    ];
  }

  attributes.list_price = [
    { currency: "EUR", value_with_tax: priceEur, marketplace_id: marketplaceId },
  ];

  attributes.purchasable_offer = [
    {
      currency: "EUR",
      our_price: [{ schedule: [{ value_with_tax: priceEur }] }],
      marketplace_id: marketplaceId,
    },
  ];

  if (stockQty !== null && stockQty >= 0) {
    attributes.fulfillment_availability = [
      {
        fulfillment_channel_code: "DEFAULT",
        quantity: Math.max(0, Math.trunc(stockQty)),
      },
    ];
  }

  const dimL = toNumber(values.dimL);
  const dimW = toNumber(values.dimW);
  const dimH = toNumber(values.dimH);
  if (dimL && dimW && dimH) {
    attributes.item_package_dimensions = [
      {
        length: { value: dimL, unit: "centimeters" },
        width: { value: dimW, unit: "centimeters" },
        height: { value: dimH, unit: "centimeters" },
        marketplace_id: marketplaceId,
      },
    ];
  }
  const weight = toNumber(values.weight);
  if (weight && weight > 0) {
    attributes.item_package_weight = [
      { value: weight, unit: "kilograms", marketplace_id: marketplaceId },
    ];
  }

  const condition = nonEmptyString(values.condition) ?? "Neu";
  const conditionMap: Record<string, string> = {
    neu: "new_new",
    new: "new_new",
    gebraucht: "used_good",
    used: "used_good",
  };
  const conditionType = conditionMap[condition.toLowerCase()] ?? "new_new";
  attributes.condition_type = [{ value: conditionType, marketplace_id: marketplaceId }];

  // --- PET_SUPPLIES-Pflichtfelder (Amazon DE) ---
  // manufacturer = brand (Pflicht, Mapping 1:1)
  attributes.manufacturer = [localizedValue(brand!, marketplaceId, languageTag)];

  // model_number: SKU als Fallback (Pflicht!), model_name: Titel als Fallback
  const modelNumber = nonEmptyString(values.attributes?.model_number ?? "") ?? args.sku ?? brand!;
  attributes.model_number = [plainValue(modelNumber, marketplaceId)];
  const modelName = nonEmptyString(values.attributes?.model_name ?? "") ?? title!;
  attributes.model_name = [localizedValue(modelName, marketplaceId, languageTag)];

  // Farbe: aus Attributen oder "Mehrfarbig"
  const color = nonEmptyString(values.attributes?.color ?? values.attributes?.Farbe ?? "") ?? "Mehrfarbig";
  attributes.color = [localizedValue(color, marketplaceId, languageTag)];

  // Ursprungsland — Amazon erwartet ISO 2-Letter-Code
  const originRaw = nonEmptyString(values.attributes?.country_of_origin ?? "") ?? "DE";
  const COUNTRY_MAP: Record<string, string> = {
    deutschland: "DE", germany: "DE", china: "CN", usa: "US", "united states": "US",
    italien: "IT", italy: "IT", frankreich: "FR", france: "FR", spanien: "ES", spain: "ES",
    niederlande: "NL", netherlands: "NL", polen: "PL", poland: "PL",
    tschechien: "CZ", "czech republic": "CZ", österreich: "AT", austria: "AT",
    schweiz: "CH", switzerland: "CH", türkei: "TR", turkey: "TR",
  };
  const origin = COUNTRY_MAP[originRaw.toLowerCase()] ?? (originRaw.length === 2 ? originRaw.toUpperCase() : "DE");
  attributes.country_of_origin = [plainValue(origin, marketplaceId)];

  // unit_count — Amazon erwartet value + type Subfelder
  const unitCountVal = toNumber(values.attributes?.unit_count ?? "1") ?? 1;
  const unitCountType = nonEmptyString(values.attributes?.unit_count_type ?? "") ?? "Stück";
  attributes.unit_count = [{ value: unitCountVal, type: unitCountType, marketplace_id: marketplaceId }];

  // Gefahrgutvorschriften
  if (!values.attributes?.supplier_declared_dg_hz_regulation) {
    attributes.supplier_declared_dg_hz_regulation = [plainValue("not_applicable", marketplaceId)];
  }

  // Enthält Lebensmittel/Getränke + Flüssigkeit
  if (!values.attributes?.contains_food_or_beverage) {
    attributes.contains_food_or_beverage = [plainValue("false", marketplaceId)];
  }
  if (!values.attributes?.contains_liquid_contents) {
    attributes.contains_liquid_contents = [plainValue("false", marketplaceId)];
  }

  // Netzstecker — Amazon-Enum: "does_not_require_a_plug" für nicht-elektrische Produkte
  if (!values.attributes?.power_plug_type) {
    attributes.power_plug_type = [plainValue("does_not_require_a_plug", marketplaceId)];
  }

  // Spannungsfrequenz — Amazon-Enum: für nicht-elektrische Produkte weglassen, User setzt falls nötig
  // (Amazon akzeptiert kein does_not_apply — nur echte Enum-Werte oder Feld weglassen)

  // Energieeffizienzklasse — für nicht-energierelevante Produkte weglassen
  // (Amazon akzeptiert kein does_not_apply — nur echte Enum-Werte oder Feld weglassen)

  // Effizienz
  if (!values.attributes?.efficiency) {
    attributes.efficiency = [localizedValue("Nicht zutreffend", marketplaceId, languageTag)];
  }

  // Garantie
  if (!values.attributes?.warranty_description) {
    attributes.warranty_description = [localizedValue("Gesetzliche Gewährleistung", marketplaceId, languageTag)];
  }

  // Anleitung
  if (!values.attributes?.directions) {
    attributes.directions = [localizedValue("Siehe Produktverpackung", marketplaceId, languageTag)];
  }

  // Bestimmte Nutzungsmöglichkeiten
  if (!values.attributes?.specific_uses_for_product) {
    const species = nonEmptyString(values.petSpecies) ?? "Haustiere";
    attributes.specific_uses_for_product = [localizedValue(species, marketplaceId, languageTag)];
  }

  // Enthaltene Komponenten
  if (!values.attributes?.included_components) {
    attributes.included_components = [localizedValue(title!, marketplaceId, languageTag)];
  }

  // recommended_browse_nodes: aus Attributen wenn gesetzt (Amazon category tree ID)
  if (values.attributes?.recommended_browse_nodes) {
    attributes.recommended_browse_nodes = [plainValue(values.attributes.recommended_browse_nodes, marketplaceId)];
  }

  // --- User-Attribute (Freitext aus Dialog) ---
  for (const [k, v] of Object.entries(values.attributes ?? {})) {
    if (!k || typeof v !== "string" || !v.trim()) continue;
    if (attributes[k] !== undefined) continue;
    attributes[k] = [{ value: v.trim(), marketplace_id: marketplaceId }];
  }

  return {
    ok: true,
    body: {
      productType,
      requirements: "LISTING",
      attributes,
    },
    warnings,
  };
}
