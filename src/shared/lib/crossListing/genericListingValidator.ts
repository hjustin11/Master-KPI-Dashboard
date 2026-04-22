/**
 * Generischer Pre-Submit-Validator für Cross-Listing-Drafts.
 *
 * Prüft gegen die Marketplace-Field-Config (required, maxLength, maxItems, maxBytes).
 * Liefert strukturierte Errors + Warnings — analog zu `validateForAmazonSubmit`
 * aber für alle Non-Amazon-Marktplätze.
 */

import type {
  CrossListingDraftValues,
  CrossListingFieldConfig,
  CrossListingFieldDef,
  CrossListingFieldKey,
} from "./crossListingDraftTypes";

export type GenericValidationIssue = { field: string; message: string };

export type GenericValidationResult = {
  valid: boolean;
  errors: GenericValidationIssue[];
  warnings: GenericValidationIssue[];
};

const HTTPS_PREFIX = /^https:\/\//i;
const EAN_REGEX = /^\d{8,14}$/;

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function getFieldValue(values: CrossListingDraftValues, key: CrossListingFieldKey): unknown {
  return (values as unknown as Record<string, unknown>)[key];
}

function isEmptyValue(def: CrossListingFieldDef, raw: unknown): boolean {
  if (def.key === "bullets" || def.key === "images" || def.key === "tags") {
    return !Array.isArray(raw) || raw.length === 0;
  }
  if (def.key === "attributes") {
    return !raw || typeof raw !== "object" || Object.keys(raw as Record<string, unknown>).length === 0;
  }
  return typeof raw !== "string" || raw.trim().length === 0;
}

export function validateCrossListingDraft(
  values: CrossListingDraftValues,
  config: CrossListingFieldConfig
): GenericValidationResult {
  const errors: GenericValidationIssue[] = [];
  const warnings: GenericValidationIssue[] = [];

  for (const def of config.fields) {
    const raw = getFieldValue(values, def.key);
    const empty = isEmptyValue(def, raw);

    if (def.required && empty) {
      errors.push({ field: def.key, message: `Pflichtfeld '${def.key}' fehlt.` });
      continue;
    }
    if (empty) continue;

    if (def.type === "text" || def.type === "textarea") {
      const v = String(raw).trim();
      if (def.maxLength && v.length > def.maxLength) {
        errors.push({
          field: def.key,
          message: `'${def.key}' überschreitet das Zeichenlimit (${v.length}/${def.maxLength}).`,
        });
      }
      if (def.maxBytes && byteLength(v) > def.maxBytes) {
        errors.push({
          field: def.key,
          message: `'${def.key}' überschreitet das Byte-Limit (${byteLength(v)}/${def.maxBytes}).`,
        });
      }
    }

    if (def.type === "bullets" && Array.isArray(raw)) {
      const arr = (raw as string[]).map((s) => s.trim()).filter(Boolean);
      if (def.maxItems && arr.length > def.maxItems) {
        warnings.push({
          field: def.key,
          message: `'${def.key}' hat ${arr.length} Einträge, Limit ${def.maxItems} — überschüssige werden gekürzt.`,
        });
      }
      if (def.maxLength) {
        arr.forEach((s, i) => {
          if (s.length > def.maxLength!) {
            errors.push({
              field: def.key,
              message: `Bullet #${i + 1} überschreitet das Zeichenlimit (${s.length}/${def.maxLength}).`,
            });
          }
        });
      }
    }

    if (def.type === "tags" && Array.isArray(raw) && def.maxItems) {
      if ((raw as string[]).length > def.maxItems) {
        warnings.push({
          field: def.key,
          message: `'${def.key}' hat mehr als ${def.maxItems} Einträge.`,
        });
      }
    }

    if (def.type === "images" && Array.isArray(raw)) {
      const urls = (raw as string[]).map((u) => u.trim()).filter(Boolean);
      const nonHttps = urls.filter((u) => !HTTPS_PREFIX.test(u));
      if (nonHttps.length > 0) {
        warnings.push({
          field: def.key,
          message: `${nonHttps.length} Bild-URL(s) ohne https — werden vom Marktplatz ggf. abgelehnt.`,
        });
      }
      if (def.maxItems && urls.length > def.maxItems) {
        warnings.push({
          field: def.key,
          message: `'${def.key}' hat ${urls.length} Bilder, Limit ${def.maxItems}.`,
        });
      }
    }

    if (def.type === "number") {
      const s = String(raw).trim();
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) {
        errors.push({
          field: def.key,
          message: `'${def.key}' ist keine gültige Zahl ('${s}').`,
        });
      } else if (def.key === "priceEur" && n <= 0) {
        errors.push({ field: def.key, message: `Preis muss größer 0 sein.` });
      } else if (def.key === "stockQty" && n < 0) {
        errors.push({ field: def.key, message: `Bestand darf nicht negativ sein.` });
      }
    }

    if (def.key === "ean" && typeof raw === "string") {
      const v = raw.trim();
      if (v && !EAN_REGEX.test(v)) {
        errors.push({ field: "ean", message: `EAN muss 8–14 Ziffern haben.` });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
