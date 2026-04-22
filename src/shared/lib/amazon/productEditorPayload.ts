import type { AmazonProductDraftValues } from "@/shared/lib/amazonProductDraft";
import { translatePayloadValues } from "@/shared/lib/amazon/attributeRegistry";

export type AmazonProductEditorPutBody = {
  productType: string;
  requirements: "LISTING";
  attributes: Record<string, unknown>;
};

export type ProductEditorPayloadIssue = { field: string; message: string };

export type BuildProductEditorPayloadArgs = {
  values: AmazonProductDraftValues;
  marketplaceId: string;
  languageTag: string;
  /** Fallback-Produkttyp falls der Draft keinen gesetzt hat. */
  productTypeFallback?: string;
};

export type BuildProductEditorPayloadResult =
  | { ok: true; body: AmazonProductEditorPutBody; warnings: ProductEditorPayloadIssue[] }
  | { ok: false; errors: ProductEditorPayloadIssue[]; warnings: ProductEditorPayloadIssue[] };

const EAN_REGEX = /^\d{8,14}$/;

function localizedText(value: string, marketplaceId: string, languageTag: string) {
  return { value, language_tag: languageTag, marketplace_id: marketplaceId };
}

function plain(value: unknown, marketplaceId: string) {
  return { value, marketplace_id: marketplaceId };
}

function toNumber(input: string): number | null {
  if (!input) return null;
  const normalized = input.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Baut den PUT-Body für die Amazon Listings Items API aus den Editor-Draft-Werten.
 *
 * Ziel: nur die im Editor editierbaren Felder senden (Titel, Bullets, Description,
 * Preise, Marke, Condition, externe Produkt-ID, Bilder). Nicht-editierte Felder
 * bleiben unverändert, weil Amazon `requirements: "LISTING"` als Teil-Update versteht.
 *
 * Alias-Übersetzung (deutsch→API) wird über die Attribute-Registry erledigt.
 */
export function buildAmazonProductEditorPutBody(
  args: BuildProductEditorPayloadArgs
): BuildProductEditorPayloadResult {
  const errors: ProductEditorPayloadIssue[] = [];
  const warnings: ProductEditorPayloadIssue[] = [];
  const { values, marketplaceId, languageTag } = args;

  const productType = (values.productType || args.productTypeFallback || "").trim();
  if (!productType) {
    errors.push({ field: "productType", message: "productType fehlt." });
  }

  const attributes: Record<string, unknown> = {};

  const title = values.title.trim();
  if (!title) {
    errors.push({ field: "title", message: "Titel ist Pflicht." });
  } else {
    attributes.item_name = [localizedText(title, marketplaceId, languageTag)];
  }

  const brand = values.brand.trim();
  if (brand) {
    attributes.brand = [localizedText(brand, marketplaceId, languageTag)];
  }

  const description = values.description.trim();
  if (description) {
    attributes.product_description = [localizedText(description, marketplaceId, languageTag)];
  }

  const bullets = values.bulletPoints.map((b) => b.trim()).filter(Boolean);
  if (bullets.length > 0) {
    attributes.bullet_point = bullets.map((b) => localizedText(b, marketplaceId, languageTag));
  }

  const listPrice = toNumber(values.listPriceEur);
  if (listPrice != null) {
    attributes.purchasable_offer = [
      {
        marketplace_id: marketplaceId,
        currency: "EUR",
        our_price: [{ schedule: [{ value_with_tax: listPrice }] }],
      },
    ];
  }

  const uvp = toNumber(values.uvpEur);
  if (uvp != null) {
    attributes.list_price = [{ ...plain(uvp, marketplaceId), currency: "EUR" }];
  }

  const conditionType = values.conditionType.trim();
  if (conditionType) {
    attributes.condition_type = [plain(conditionType, marketplaceId)];
  }

  const externalId = values.externalProductId.trim();
  const externalIdType = values.externalProductIdType;
  if (externalId && externalIdType && externalIdType !== "none") {
    if (externalIdType === "ean" || externalIdType === "gtin") {
      if (!EAN_REGEX.test(externalId)) {
        warnings.push({
          field: "externalProductId",
          message: `EAN/GTIN '${externalId}' hat ungültiges Format (erwartet 8–14 Ziffern).`,
        });
      }
    }
    attributes.externally_assigned_product_identifier = [
      {
        value: externalId,
        type: externalIdType.toUpperCase(),
        marketplace_id: marketplaceId,
      },
    ];
  }

  const images = values.images.map((x) => x.trim()).filter(Boolean).slice(0, 9);
  if (images.length > 0) {
    attributes.main_product_image_locator = [plain(images[0], marketplaceId)];
    for (let i = 1; i < images.length; i += 1) {
      const key = `other_product_image_locator_${i}`;
      attributes[key] = [plain(images[i], marketplaceId)];
    }
  }

  const quantity = toNumber(values.quantity);
  const handlingTime = toNumber(values.handlingTime);
  if (quantity != null || handlingTime != null) {
    const fa: Record<string, unknown> = { marketplace_id: marketplaceId };
    if (quantity != null) fa.quantity = Math.trunc(quantity);
    if (handlingTime != null) fa.lead_time_to_ship_max_days = Math.trunc(handlingTime);
    attributes.fulfillment_availability = [fa];
  }

  // Passthrough aller zusätzlichen Draft-Attribute (mit Alias-Übersetzung).
  // Nur hinzufügen wenn der Key noch nicht bereits gesetzt ist.
  const translated = translatePayloadValues(values.attributes ?? {});
  for (const [key, val] of Object.entries(translated)) {
    if (attributes[key] !== undefined) continue;
    if (!val || typeof val !== "string") continue;
    attributes[key] = [plain(val, marketplaceId)];
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
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
