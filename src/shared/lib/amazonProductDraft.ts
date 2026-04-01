import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { getMissingAmazonRequiredFields } from "@/shared/lib/amazonProductTypeSchema";

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
  listPriceEur: number | null;
  quantity: number | null;
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
  listPriceEur: string;
  quantity: string;
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
    listPriceEur: row.priceEur != null ? Number(row.priceEur) : null,
    quantity: row.stockQty != null ? Number(row.stockQty) : null,
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
    images: [],
    productType: "",
    brand: "",
    conditionType: "new_new",
    externalProductId: "",
    externalProductIdType: "ean",
    listPriceEur: "",
    quantity: "",
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
    images: source.images,
    productType: source.productType,
    brand: source.brand,
    conditionType: source.conditionType,
    externalProductId: source.externalProductId,
    externalProductIdType: source.externalProductIdType,
    listPriceEur: source.listPriceEur != null ? String(source.listPriceEur) : "",
    quantity: source.quantity != null ? String(source.quantity) : "",
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
    images: normalizeStringList(obj.images, 20),
    productType: typeof obj.productType === "string" ? obj.productType.trim() : "",
    brand: typeof obj.brand === "string" ? obj.brand.trim() : "",
    conditionType: typeof obj.conditionType === "string" ? obj.conditionType.trim() : "new_new",
    externalProductId: typeof obj.externalProductId === "string" ? obj.externalProductId.trim() : "",
    externalProductIdType: externalType,
    listPriceEur: typeof obj.listPriceEur === "string" ? obj.listPriceEur.trim() : "",
    quantity: typeof obj.quantity === "string" ? obj.quantity.trim() : "",
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
    images: normalizeStringList(obj.images, 20),
    productType: typeof obj.productType === "string" ? obj.productType.trim() : "",
    brand: typeof obj.brand === "string" ? obj.brand.trim() : "",
    conditionType: typeof obj.conditionType === "string" ? obj.conditionType.trim() : "new_new",
    externalProductId: typeof obj.externalProductId === "string" ? obj.externalProductId.trim() : "",
    externalProductIdType: externalType,
    listPriceEur:
      typeof obj.listPriceEur === "number" && Number.isFinite(obj.listPriceEur) ? obj.listPriceEur : null,
    quantity: typeof obj.quantity === "number" && Number.isFinite(obj.quantity) ? obj.quantity : null,
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
  const hasContent = values.description || values.bulletPoints.length > 0 || values.images.length > 0;
  if (mode === "edit_existing") return hasCore && hasContent ? "ready" : "draft";
  return getMissingAmazonRequiredFields(values).length === 0 ? "ready" : "draft";
}
