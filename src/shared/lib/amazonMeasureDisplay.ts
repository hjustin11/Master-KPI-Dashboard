import type { AmazonProductDraftValues } from "@/shared/lib/amazonProductDraft";

/** SP-API / Listing condition codes used in the editor (canonical `value` for Select). */
export const AMAZON_EDITOR_CONDITION_VALUES = [
  "new_new",
  "used_like_new",
  "used_very_good",
  "used_good",
  "used_acceptable",
] as const;

export type AmazonEditorConditionValue = (typeof AMAZON_EDITOR_CONDITION_VALUES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyAmazonShippingUuid(s: string): boolean {
  const t = s.trim();
  return t.length >= 32 && UUID_RE.test(t);
}

const CONDITION_ALIASES: Record<string, AmazonEditorConditionValue> = {
  new_new: "new_new",
  new: "new_new",
  neu: "new_new",
  used_like_new: "used_like_new",
  used_very_good: "used_very_good",
  used_good: "used_good",
  used_acceptable: "used_acceptable",
};

/** Maps API / legacy strings to a canonical Select value. */
export function normalizeConditionTypeForDraft(raw: string): AmazonEditorConditionValue {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!key) return "new_new";
  const mapped = CONDITION_ALIASES[key];
  if (mapped) return mapped;
  if ((AMAZON_EDITOR_CONDITION_VALUES as readonly string[]).includes(raw.trim())) {
    return raw.trim() as AmazonEditorConditionValue;
  }
  return "new_new";
}

const DIM_UNIT_TO_CM: Record<string, number> = {
  mm: 0.1,
  millimeter: 0.1,
  millimeters: 0.1,
  cm: 1,
  centimeter: 1,
  centimeters: 1,
  m: 100,
  meter: 100,
  meters: 100,
  in: 2.54,
  inch: 2.54,
  inches: 2.54,
  ft: 30.48,
  foot: 30.48,
  feet: 30.48,
};

const WEIGHT_UNIT_TO_KG: Record<string, number> = {
  mg: 1e-6,
  milligram: 1e-6,
  milligrams: 1e-6,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  oz: 0.028349523125,
  ounce: 0.028349523125,
  ounces: 0.028349523125,
};

function tokenizeUnit(rest: string): string[] {
  return rest
    .toLowerCase()
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((x) => x.replace(/[^a-z]/g, ""))
    .filter(Boolean);
}

function firstKnownDimUnit(tokens: string[]): string | null {
  for (const t of tokens) {
    if (t in DIM_UNIT_TO_CM) return t;
  }
  return null;
}

function firstKnownWeightUnit(tokens: string[]): string | null {
  for (const t of tokens) {
    if (t in WEIGHT_UNIT_TO_KG) return t;
  }
  return null;
}

function parseLooseDecimal(s: string): number | null {
  const t = s.replace(/\s/g, "").trim();
  if (!t) return null;
  let x = t;
  if (x.includes(",") && x.includes(".")) {
    if (x.lastIndexOf(",") > x.lastIndexOf(".")) x = x.replace(/\./g, "").replace(",", ".");
    else x = x.replace(/,/g, "");
  } else if (x.includes(",") && !x.includes(".")) {
    x = x.replace(",", ".");
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Parse leading numeric token (supports `9,6` / `1.234,5`). */
function parseLeadingNumber(s: string): number | null {
  const m = s.trim().match(/^([\d\s.,]+)/);
  if (!m) return null;
  return parseLooseDecimal(m[1]);
}

/**
 * Converts a raw package dimension string (e.g. `48 centimeters`, `12.5`) to a value in cm.
 */
export function parseDimensionToCm(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const num = parseLeadingNumber(t);
  if (num == null) return null;
  const afterNum = t.slice(t.match(/^[\d.,]+/)?.[0]?.length ?? 0).trim();
  if (!afterNum) return num;
  const unit = firstKnownDimUnit(tokenizeUnit(afterNum));
  if (!unit) return num;
  return num * (DIM_UNIT_TO_CM[unit] ?? 1);
}

/**
 * Converts a raw weight string (e.g. `9.6`, `2100 grams`) to kg.
 */
export function parseWeightToKg(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const num = parseLeadingNumber(t);
  if (num == null) return null;
  const afterNum = t.slice(t.match(/^[\d.,]+/)?.[0]?.length ?? 0).trim();
  if (!afterNum) return num;
  const unit = firstKnownWeightUnit(tokenizeUnit(afterNum));
  if (!unit) return num;
  return num * (WEIGHT_UNIT_TO_KG[unit] ?? 1);
}

export function formatPhysicalQuantityForLocale(
  value: number,
  localeTag: string,
  maxFractionDigits = 4
): string {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Human-readable editor string for a length (stored value interpreted as cm). */
export function formatDimensionFieldForEditor(raw: string, localeTag: string): string {
  const t = raw.trim();
  if (!t) return "";
  const cm = parseDimensionToCm(t);
  if (cm == null) return t;
  return formatPhysicalQuantityForLocale(cm, localeTag, 4);
}

/** Human-readable editor string for weight (stored value interpreted as kg). */
export function formatWeightFieldForEditor(raw: string, localeTag: string): string {
  const t = raw.trim();
  if (!t) return "";
  const kg = parseWeightToKg(t);
  if (kg == null) return t;
  return formatPhysicalQuantityForLocale(kg, localeTag, 4);
}

/**
 * Normalizes editor input to a compact string for persistence (dot decimal, no unit text).
 */
export function serializeDimensionFieldForSave(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const cm = parseDimensionToCm(t);
  if (cm == null) return t;
  const rounded = Math.round(cm * 1e6) / 1e6;
  return String(rounded);
}

export function serializeWeightFieldForSave(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const kg = parseWeightToKg(t);
  if (kg == null) return t;
  const rounded = Math.round(kg * 1e6) / 1e6;
  return String(rounded);
}

/** Apply locale display + canonical condition when opening the editor from API/draft JSON. */
export function formatDraftValuesPhysicalFieldsForEditor(
  values: AmazonProductDraftValues,
  localeTag: string
): AmazonProductDraftValues {
  return {
    ...values,
    conditionType: normalizeConditionTypeForDraft(values.conditionType),
    packageLength: formatDimensionFieldForEditor(values.packageLength, localeTag),
    packageWidth: formatDimensionFieldForEditor(values.packageWidth, localeTag),
    packageHeight: formatDimensionFieldForEditor(values.packageHeight, localeTag),
    packageWeight: formatWeightFieldForEditor(values.packageWeight, localeTag),
  };
}

export function serializeDraftPhysicalFieldsForSave(values: AmazonProductDraftValues): Pick<
  AmazonProductDraftValues,
  "packageLength" | "packageWidth" | "packageHeight" | "packageWeight"
> {
  return {
    packageLength: serializeDimensionFieldForSave(values.packageLength),
    packageWidth: serializeDimensionFieldForSave(values.packageWidth),
    packageHeight: serializeDimensionFieldForSave(values.packageHeight),
    packageWeight: serializeWeightFieldForSave(values.packageWeight),
  };
}
