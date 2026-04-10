import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { getMissingAmazonRequiredFields } from "@/shared/lib/amazonProductTypeSchema";

/** Feste Anzahl Bild-Slots im Amazon-Entwurfseditor (URL oder data:-Bild pro Feld). */
export const AMAZON_DRAFT_IMAGE_SLOT_COUNT = 10;

export type AmazonProductDraftMode = "edit_existing" | "create_new";
export type AmazonProductDraftStatus = "draft" | "ready";
export type AmazonExternalIdType = "ean" | "upc" | "gtin" | "isbn" | "none";

export type AmazonProductSourceSnapshot = {
  sku: string;
  asin: string;
  title: string;
  statusLabel: string;
  isActive: boolean;
  bulletPoints: string[];
  description: string;
  images: string[];
  productType: string;
  brand: string;
  conditionType: string;
  externalProductId: string;
  externalProductIdType: AmazonExternalIdType;
  uvpEur: number | null;
  listPriceEur: number | null;
  handlingTime: string;
  shippingTemplate: string;
  quantity: number | null;
  packageLength: string;
  packageWidth: string;
  packageHeight: string;
  packageWeight: string;
  attributes: Record<string, string>;
};

export type AmazonProductDraftValues = {
  sku: string;
  asin: string;
  title: string;
  description: string;
  bulletPoints: string[];
  images: string[];
  productType: string;
  brand: string;
  conditionType: string;
  externalProductId: string;
  externalProductIdType: AmazonExternalIdType;
  uvpEur: string;
  listPriceEur: string;
  handlingTime: string;
  shippingTemplate: string;
  quantity: string;
  packageLength: string;
  packageWidth: string;
  packageHeight: string;
  packageWeight: string;
  attributes: Record<string, string>;
};

export type AmazonProductDraftRecord = {
  id: string;
  marketplace_slug: string;
  mode: AmazonProductDraftMode;
  status: AmazonProductDraftStatus;
  sku: string | null;
  source_snapshot: AmazonProductSourceSnapshot;
  draft_values: AmazonProductDraftValues;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeStringList(input: unknown, max = 12): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

/** Entfernt typische Amazon-Listings-Metadaten (Locale, Marketplace-ID) aus Fließtext. */
export function stripAmazonListingNoiseFragments(text: string): string {
  return text
    .replace(/\b[a-z]{2}_[A-Z]{2}\b/g, " ")
    .replace(/\bA[0-9A-Z]{9,14}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandaloneAmazonNoiseLine(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[a-z]{2}_[A-Z]{2}$/.test(t)) return true;
  if (/^A[0-9A-Z]{9,14}$/.test(t)) return true;
  return false;
}

export function sanitizeAmazonBulletPoints(bullets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of bullets) {
    const cleaned = stripAmazonListingNoiseFragments(raw);
    if (cleaned.length < 3 || isStandaloneAmazonNoiseLine(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= 12) break;
  }
  return out;
}

export function sanitizeAmazonDescription(desc: string): string {
  return desc
    .split(/\n\s*\n+/)
    .map((p) => stripAmazonListingNoiseFragments(p))
    .filter((p) => p.length > 2 && !isStandaloneAmazonNoiseLine(p))
    .join("\n\n");
}

/**
 * Gespeicherter Entwurf + frische API-Daten: leere Felder aus der API nachziehen,
 * Beschreibung/Bulletpoints von Metadaten bereinigen.
 */
export function mergeAmazonDraftValuesWithFresh(
  draft: AmazonProductDraftValues,
  fresh: AmazonProductDraftValues
): AmazonProductDraftValues {
  const pick = (user: string, api: string) => (user.trim() ? user : api);
  const userHasImage = draft.images.some((u) => u.trim());
  const mergedBullets = (() => {
    const fromUser = sanitizeAmazonBulletPoints(draft.bulletPoints);
    const fromApi = sanitizeAmazonBulletPoints(fresh.bulletPoints);
    if (fromUser.length > 0) return fromUser;
    return fromApi;
  })();
  const mergedDesc = (() => {
    const fromUser = sanitizeAmazonDescription(draft.description);
    const fromApi = sanitizeAmazonDescription(fresh.description);
    if (fromUser.length > 0) return fromUser;
    return fromApi;
  })();
  return {
    ...fresh,
    sku: pick(draft.sku, fresh.sku),
    asin: pick(draft.asin, fresh.asin),
    title: pick(draft.title, fresh.title),
    description: mergedDesc,
    bulletPoints: mergedBullets,
    images: userHasImage ? padAmazonDraftImages(draft.images) : padAmazonDraftImages(fresh.images),
    productType: pick(draft.productType, fresh.productType),
    brand: pick(draft.brand, fresh.brand),
    conditionType: draft.conditionType?.trim() ? draft.conditionType : fresh.conditionType,
    externalProductId: pick(draft.externalProductId, fresh.externalProductId),
    externalProductIdType: draft.externalProductId.trim()
      ? draft.externalProductIdType
      : fresh.externalProductIdType,
    uvpEur: pick(draft.uvpEur, fresh.uvpEur),
    listPriceEur: pick(draft.listPriceEur, fresh.listPriceEur),
    handlingTime: pick(draft.handlingTime, fresh.handlingTime),
    shippingTemplate: pick(draft.shippingTemplate, fresh.shippingTemplate),
    quantity: pick(draft.quantity, fresh.quantity),
    packageLength: pick(draft.packageLength, fresh.packageLength),
    packageWidth: pick(draft.packageWidth, fresh.packageWidth),
    packageHeight: pick(draft.packageHeight, fresh.packageHeight),
    packageWeight: pick(draft.packageWeight, fresh.packageWeight),
    attributes: (() => {
      const draftHasAnyValue = Object.values(draft.attributes).some((v) => String(v).trim().length > 0);
      if (!draftHasAnyValue) return { ...fresh.attributes };
      const out = { ...fresh.attributes };
      for (const [k, v] of Object.entries(draft.attributes)) {
        if (String(v).trim()) out[k] = v;
      }
      return out;
    })(),
  };
}

/** Liefert immer genau `AMAZON_DRAFT_IMAGE_SLOT_COUNT` Einträge (leere Strings = freier Slot). */
export function padAmazonDraftImages(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const urls = list
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, AMAZON_DRAFT_IMAGE_SLOT_COUNT);
  const out = [...urls];
  while (out.length < AMAZON_DRAFT_IMAGE_SLOT_COUNT) out.push("");
  return out;
}

export function sourceSnapshotFromRow(row: MarketplaceProductListRow): AmazonProductSourceSnapshot {
  return {
    sku: (row.sku ?? "").trim(),
    asin: (row.secondaryId ?? "").trim(),
    title: (row.title ?? "").trim(),
    statusLabel: (row.statusLabel ?? "").trim(),
    isActive: Boolean(row.isActive),
    bulletPoints: [],
    description: "",
    images: [],
    productType: "",
    brand: "",
    conditionType: "new_new",
    externalProductId: "",
    externalProductIdType: "ean",
    uvpEur: null,
    listPriceEur: row.priceEur != null ? Number(row.priceEur) : null,
    handlingTime: "",
    shippingTemplate: "",
    quantity: row.stockQty != null ? Number(row.stockQty) : null,
    packageLength: "",
    packageWidth: "",
    packageHeight: "",
    packageWeight: "",
    attributes: {},
  };
}

export function emptyDraftValues(): AmazonProductDraftValues {
  return {
    sku: "",
    asin: "",
    title: "",
    description: "",
    bulletPoints: [],
    images: padAmazonDraftImages([]),
    productType: "",
    brand: "",
    conditionType: "new_new",
    externalProductId: "",
    externalProductIdType: "ean",
    uvpEur: "",
    listPriceEur: "",
    handlingTime: "",
    shippingTemplate: "",
    quantity: "",
    packageLength: "",
    packageWidth: "",
    packageHeight: "",
    packageWeight: "",
    attributes: {},
  };
}

export function draftValuesFromSource(source: AmazonProductSourceSnapshot): AmazonProductDraftValues {
  return {
    sku: source.sku,
    asin: source.asin,
    title: source.title,
    description: source.description,
    bulletPoints: source.bulletPoints,
    images: padAmazonDraftImages(source.images),
    productType: source.productType,
    brand: source.brand,
    conditionType: source.conditionType,
    externalProductId: source.externalProductId,
    externalProductIdType: source.externalProductIdType,
    uvpEur: source.uvpEur != null ? String(source.uvpEur) : "",
    listPriceEur: source.listPriceEur != null ? String(source.listPriceEur) : "",
    handlingTime: source.handlingTime,
    shippingTemplate: source.shippingTemplate,
    quantity: source.quantity != null ? String(source.quantity) : "",
    packageLength: source.packageLength,
    packageWidth: source.packageWidth,
    packageHeight: source.packageHeight,
    packageWeight: source.packageWeight,
    attributes: { ...source.attributes },
  };
}

export function normalizeDraftValues(raw: unknown): AmazonProductDraftValues {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const externalTypeRaw = typeof obj.externalProductIdType === "string" ? obj.externalProductIdType.trim().toLowerCase() : "";
  const externalType: AmazonExternalIdType =
    externalTypeRaw === "upc" ||
    externalTypeRaw === "gtin" ||
    externalTypeRaw === "isbn" ||
    externalTypeRaw === "none"
      ? externalTypeRaw
      : "ean";
  return {
    sku: typeof obj.sku === "string" ? obj.sku.trim() : "",
    asin: typeof obj.asin === "string" ? obj.asin.trim() : "",
    title: typeof obj.title === "string" ? obj.title.trim() : "",
    description: typeof obj.description === "string" ? obj.description.trim() : "",
    bulletPoints: normalizeStringList(obj.bulletPoints, 12),
    images: padAmazonDraftImages(obj.images),
    productType: typeof obj.productType === "string" ? obj.productType.trim() : "",
    brand: typeof obj.brand === "string" ? obj.brand.trim() : "",
    conditionType: typeof obj.conditionType === "string" ? obj.conditionType.trim() : "new_new",
    externalProductId: typeof obj.externalProductId === "string" ? obj.externalProductId.trim() : "",
    externalProductIdType: externalType,
    uvpEur: typeof obj.uvpEur === "string" ? obj.uvpEur.trim() : "",
    listPriceEur: typeof obj.listPriceEur === "string" ? obj.listPriceEur.trim() : "",
    handlingTime: typeof obj.handlingTime === "string" ? obj.handlingTime.trim() : "",
    shippingTemplate: typeof obj.shippingTemplate === "string" ? obj.shippingTemplate.trim() : "",
    quantity: typeof obj.quantity === "string" ? obj.quantity.trim() : "",
    packageLength: typeof obj.packageLength === "string" ? obj.packageLength.trim() : "",
    packageWidth: typeof obj.packageWidth === "string" ? obj.packageWidth.trim() : "",
    packageHeight: typeof obj.packageHeight === "string" ? obj.packageHeight.trim() : "",
    packageWeight: typeof obj.packageWeight === "string" ? obj.packageWeight.trim() : "",
    attributes:
      obj.attributes && typeof obj.attributes === "object"
        ? Object.fromEntries(
            Object.entries(obj.attributes as Record<string, unknown>)
              .filter(([k]) => Boolean(k.trim()))
              .map(([k, v]) => [k.trim(), typeof v === "string" ? v.trim() : ""])
          )
        : {},
  };
}

export function normalizeSourceSnapshot(raw: unknown): AmazonProductSourceSnapshot {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const externalTypeRaw = typeof obj.externalProductIdType === "string" ? obj.externalProductIdType.trim().toLowerCase() : "";
  const externalType: AmazonExternalIdType =
    externalTypeRaw === "upc" ||
    externalTypeRaw === "gtin" ||
    externalTypeRaw === "isbn" ||
    externalTypeRaw === "none"
      ? externalTypeRaw
      : "ean";
  return {
    sku: typeof obj.sku === "string" ? obj.sku.trim() : "",
    asin: typeof obj.asin === "string" ? obj.asin.trim() : "",
    title: typeof obj.title === "string" ? obj.title.trim() : "",
    statusLabel: typeof obj.statusLabel === "string" ? obj.statusLabel.trim() : "",
    isActive: Boolean(obj.isActive),
    bulletPoints: normalizeStringList(obj.bulletPoints, 12),
    description: typeof obj.description === "string" ? obj.description.trim() : "",
    images: padAmazonDraftImages(obj.images),
    productType: typeof obj.productType === "string" ? obj.productType.trim() : "",
    brand: typeof obj.brand === "string" ? obj.brand.trim() : "",
    conditionType: typeof obj.conditionType === "string" ? obj.conditionType.trim() : "new_new",
    externalProductId: typeof obj.externalProductId === "string" ? obj.externalProductId.trim() : "",
    externalProductIdType: externalType,
    uvpEur: typeof obj.uvpEur === "number" && Number.isFinite(obj.uvpEur) ? obj.uvpEur : null,
    listPriceEur:
      typeof obj.listPriceEur === "number" && Number.isFinite(obj.listPriceEur) ? obj.listPriceEur : null,
    handlingTime: typeof obj.handlingTime === "string" ? obj.handlingTime.trim() : "",
    shippingTemplate: typeof obj.shippingTemplate === "string" ? obj.shippingTemplate.trim() : "",
    quantity: typeof obj.quantity === "number" && Number.isFinite(obj.quantity) ? obj.quantity : null,
    packageLength: typeof obj.packageLength === "string" ? obj.packageLength.trim() : "",
    packageWidth: typeof obj.packageWidth === "string" ? obj.packageWidth.trim() : "",
    packageHeight: typeof obj.packageHeight === "string" ? obj.packageHeight.trim() : "",
    packageWeight: typeof obj.packageWeight === "string" ? obj.packageWeight.trim() : "",
    attributes:
      obj.attributes && typeof obj.attributes === "object"
        ? Object.fromEntries(
            Object.entries(obj.attributes as Record<string, unknown>)
              .filter(([k]) => Boolean(k.trim()))
              .map(([k, v]) => [k.trim(), typeof v === "string" ? v.trim() : ""])
          )
        : {},
  };
}

export function deriveDraftStatus(
  values: AmazonProductDraftValues,
  mode: AmazonProductDraftMode = "edit_existing"
): AmazonProductDraftStatus {
  const hasCore = values.sku && values.title;
  const hasContent =
    values.description.trim().length > 0 ||
    values.bulletPoints.some((b) => b.trim().length > 0) ||
    values.images.some((img) => img.trim().length > 0);
  if (mode === "edit_existing") return hasCore && hasContent ? "ready" : "draft";
  return getMissingAmazonRequiredFields(values).length === 0 ? "ready" : "draft";
}
