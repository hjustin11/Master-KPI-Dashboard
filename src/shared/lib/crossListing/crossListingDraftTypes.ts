import type { AnalyticsMarketplaceSlug } from "@/shared/lib/analytics-marketplaces";

export type CrossListingTargetSlug = "amazon" | AnalyticsMarketplaceSlug;

export const CROSS_LISTING_TARGET_SLUGS: readonly CrossListingTargetSlug[] = [
  "amazon",
  "otto",
  "ebay",
  "kaufland",
  "fressnapf",
  "mediamarkt-saturn",
  "zooplus",
  "tiktok",
  "shopify",
] as const;

export type CrossListingSourceSlug = CrossListingTargetSlug | "xentral";

/** Normalisierte Produktdaten aus einer Quelle (ein Marktplatz oder Xentral). */
export type CrossListingSourceRecord = {
  slug: CrossListingSourceSlug;
  title: string | null;
  description: string | null;
  bullets: string[];
  images: string[];
  priceEur: number | null;
  uvpEur: number | null;
  stockQty: number | null;
  ean: string | null;
  brand: string | null;
  category: string | null;
  dimL: number | null;
  dimW: number | null;
  dimH: number | null;
  weight: number | null;
  petSpecies: string | null;
  tags: string[];
  attributes: Record<string, string>;
  /** Originale Rohdaten aus der jeweiligen API, unverändert. */
  raw?: unknown;
};

export type CrossListingSourceMap = Partial<Record<CrossListingSourceSlug, CrossListingSourceRecord | null>>;

/** Eintrag im Bilder-Pool: eine URL, die Quelle + Index innerhalb der Quelle + ob ausgewählt. */
export type CrossListingImageEntry = {
  url: string;
  source: CrossListingSourceSlug | "manual";
  index: number;
  selected: boolean;
};

export type CrossListingSourceDataResponse = {
  sku: string;
  ean: string | null;
  sources: CrossListingSourceMap;
};

/** Feld-Typen die der Dialog rendern kann. */
export type CrossListingFieldType =
  | "text"
  | "textarea"
  | "bullets"
  | "images"
  | "number"
  | "select"
  | "tags"
  | "attributes";

export type CrossListingFieldSection = "catalog" | "content" | "images" | "platform";

export type CrossListingFieldKey =
  | "title"
  | "description"
  | "bullets"
  | "images"
  | "priceEur"
  | "uvpEur"
  | "stockQty"
  | "ean"
  | "brand"
  | "category"
  | "dimL"
  | "dimW"
  | "dimH"
  | "weight"
  | "petSpecies"
  | "tags"
  | "searchTerms"
  | "seoTitle"
  | "seoDescription"
  | "condition"
  | "handlingTime"
  | "attributes";

export type CrossListingFieldDef = {
  key: CrossListingFieldKey;
  type: CrossListingFieldType;
  labelKey: string;
  required: boolean;
  section?: CrossListingFieldSection;
  maxLength?: number;
  maxItems?: number;
  maxBytes?: number;
  unit?: string;
  options?: readonly string[];
  hintKey?: string;
};

export type CrossListingFieldConfig = {
  slug: CrossListingTargetSlug;
  fields: readonly CrossListingFieldDef[];
  /** Kurze Notiz für den Dialog-Header (z. B. Richtlinien-Hinweis). */
  platformHintKey?: string;
};

/** Die editierbaren Werte im Dialog. */
export type CrossListingDraftValues = {
  title: string;
  description: string;
  bullets: string[];
  images: string[];
  priceEur: string;
  uvpEur: string;
  stockQty: string;
  ean: string;
  brand: string;
  category: string;
  dimL: string;
  dimW: string;
  dimH: string;
  weight: string;
  petSpecies: string;
  tags: string[];
  searchTerms: string;
  seoTitle: string;
  seoDescription: string;
  condition: string;
  handlingTime: string;
  amazonProductType: string;
  attributes: Record<string, string>;
};

export type CrossListingFieldSources = Partial<Record<CrossListingFieldKey, CrossListingSourceSlug>>;

export type CrossListingDraftRow = {
  id: string;
  sku: string;
  ean: string | null;
  sourceMarketplaceSlug: string;
  targetMarketplaceSlug: string;
  sourceData: CrossListingSourceMap;
  generatedListing: CrossListingDraftValues | null;
  userEdits: CrossListingDraftValues | null;
  status:
    | "draft"
    | "generating"
    | "ready"
    | "reviewing"
    | "uploading"
    | "uploaded"
    | "failed";
  errorMessage: string | null;
  uploadedAt: string | null;
  marketplaceListingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function emptyDraftValues(): CrossListingDraftValues {
  return {
    title: "",
    description: "",
    bullets: [],
    images: [],
    priceEur: "",
    uvpEur: "",
    stockQty: "",
    ean: "",
    brand: "",
    category: "",
    dimL: "",
    dimW: "",
    dimH: "",
    weight: "",
    petSpecies: "",
    tags: [],
    searchTerms: "",
    seoTitle: "",
    seoDescription: "",
    condition: "Neu",
    handlingTime: "",
    amazonProductType: "",
    attributes: {},
  };
}
