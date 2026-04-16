import type { CrossListingDraftValues } from "./crossListingDraftTypes";

export type ValidationIssue = { field: string; message: string };
export type ValidationResult = { valid: boolean; errors: ValidationIssue[] };

const HTTPS = /^https:\/\//i;
const EAN_REGEX = /^\d{8,14}$/;

function nonEmpty(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return false;
}

function numVal(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function validateForAmazonSubmit(
  values: CrossListingDraftValues,
  productType: string
): ValidationResult {
  const errors: ValidationIssue[] = [];

  // --- Titel ---
  if (!values.title?.trim()) {
    errors.push({ field: "title", message: "Titel ist Pflicht." });
  } else if (values.title.length > 200) {
    errors.push({ field: "title", message: "Titel darf max. 200 Zeichen haben." });
  }

  // --- Marke ---
  if (!values.brand?.trim()) {
    errors.push({ field: "brand", message: "Marke ist Pflicht." });
  }

  // --- EAN ---
  if (!values.ean?.trim()) {
    errors.push({ field: "ean", message: "EAN/GTIN ist Pflicht." });
  } else if (!EAN_REGEX.test(values.ean.trim())) {
    errors.push({ field: "ean", message: "EAN muss 8–14 Ziffern haben." });
  }

  // --- Beschreibung ---
  if (!values.description?.trim()) {
    errors.push({ field: "description", message: "Beschreibung ist Pflicht." });
  }

  // --- Bilder ---
  const validImages = values.images.filter((u) => u.trim() && HTTPS.test(u));
  if (validImages.length === 0) {
    errors.push({ field: "images", message: "Mindestens ein HTTPS-Bild ist Pflicht." });
  }

  // --- Preis ---
  const price = numVal(values.priceEur);
  if (price === null || price <= 0) {
    errors.push({ field: "priceEur", message: "Verkaufspreis (>0) ist Pflicht." });
  }

  // --- Produkttyp ---
  if (!productType?.trim()) {
    errors.push({ field: "productType", message: "Produkttyp muss gesetzt sein." });
  }

  // --- Pflicht-Attribute ---
  const attrs = values.attributes ?? {};

  if (!nonEmpty(attrs.country_of_origin) && !nonEmpty(attrs.Ursprungsland)) {
    errors.push({ field: "country_of_origin", message: "Ursprungsland ist Pflicht." });
  }

  if (!nonEmpty(attrs.supplier_declared_dg_hz_regulation) && !nonEmpty(attrs.Gefahrgutvorschrift)) {
    errors.push({ field: "supplier_declared_dg_hz_regulation", message: "Gefahrgutvorschrift ist Pflicht." });
  }

  if (!nonEmpty(attrs.batteries_required) && !nonEmpty(attrs["Batterien erforderlich?"])) {
    errors.push({ field: "batteries_required", message: "Batterien erforderlich? muss gesetzt sein." });
  }

  if (!nonEmpty(attrs.batteries_included) && !nonEmpty(attrs["Batterien enthalten?"])) {
    errors.push({ field: "batteries_included", message: "Batterien enthalten? muss gesetzt sein." });
  }

  // Browse-Node wird automatisch gesetzt (detectBrowseNode), daher kein blockierender Error.

  // EPR-Verpackung
  if (!nonEmpty(attrs["epr_product_packaging.main_material"]) && !nonEmpty(attrs.Verpackungsmaterial)) {
    errors.push({ field: "epr_product_packaging", message: "Verpackungsmaterial ist Pflicht." });
  }

  return { valid: errors.length === 0, errors };
}
