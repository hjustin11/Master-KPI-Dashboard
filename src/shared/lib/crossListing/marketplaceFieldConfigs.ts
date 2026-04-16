import type {
  CrossListingFieldConfig,
  CrossListingFieldDef,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";

const PET_SPECIES = ["Hund", "Katze", "Kleintier", "Vogel", "Fisch", "Pferd"] as const;
const CONDITIONS = ["Neu", "Gebraucht"] as const;

function categoryField(hintSuffix: string): CrossListingFieldDef {
  return {
    key: "category",
    type: "text",
    labelKey: "crossListing.field.category",
    required: false,
    section: "catalog",
    maxLength: 200,
    hintKey: `crossListing.field.category.hint.${hintSuffix}`,
  };
}

const CATALOG_CORE_WITHOUT_CATEGORY: readonly CrossListingFieldDef[] = [
  { key: "brand", type: "text", labelKey: "crossListing.field.brand", required: true, section: "catalog", maxLength: 80 },
  { key: "ean", type: "text", labelKey: "crossListing.field.ean", required: true, section: "catalog", maxLength: 14 },
  { key: "priceEur", type: "number", labelKey: "crossListing.field.priceEur", required: true, section: "catalog", unit: "EUR" },
  { key: "stockQty", type: "number", labelKey: "crossListing.field.stockQty", required: false, section: "catalog" },
];

function catalogCore(hintSuffix: string): readonly CrossListingFieldDef[] {
  return [...CATALOG_CORE_WITHOUT_CATEGORY, categoryField(hintSuffix)];
}

const DIMENSIONS: readonly CrossListingFieldDef[] = [
  { key: "dimL", type: "number", labelKey: "crossListing.field.dimL", required: false, section: "catalog", unit: "cm" },
  { key: "dimW", type: "number", labelKey: "crossListing.field.dimW", required: false, section: "catalog", unit: "cm" },
  { key: "dimH", type: "number", labelKey: "crossListing.field.dimH", required: false, section: "catalog", unit: "cm" },
  { key: "weight", type: "number", labelKey: "crossListing.field.weight", required: false, section: "catalog", unit: "kg" },
];

const COMMON_CONTENT = (titleMax: number, descMax: number): readonly CrossListingFieldDef[] => [
  { key: "title", type: "text", labelKey: "crossListing.field.title", required: true, section: "content", maxLength: titleMax },
  { key: "description", type: "textarea", labelKey: "crossListing.field.description", required: true, section: "content", maxLength: descMax },
];

const IMAGE_FIELD = (max: number): CrossListingFieldDef => ({
  key: "images",
  type: "images",
  labelKey: "crossListing.field.images",
  required: true,
  section: "images",
  maxItems: max,
});

const ATTRIBUTE_FIELD: CrossListingFieldDef = {
  key: "attributes",
  type: "attributes",
  labelKey: "crossListing.field.attributes",
  required: false,
  section: "platform",
  hintKey: "crossListing.field.attributes.hint",
};

function amazonFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("amazon"),
    { key: "uvpEur", type: "number", labelKey: "crossListing.field.uvpEur", required: false, section: "catalog", unit: "EUR" },
    ...DIMENSIONS,
    { key: "handlingTime", type: "number", labelKey: "crossListing.field.handlingTime", required: false, section: "catalog", unit: "d" },
    { key: "condition", type: "select", labelKey: "crossListing.field.condition", required: false, section: "catalog", options: CONDITIONS },
    ...COMMON_CONTENT(200, 2000),
    { key: "bullets", type: "bullets", labelKey: "crossListing.field.bullets", required: true, section: "content", maxItems: 5, maxLength: 500 },
    { key: "searchTerms", type: "text", labelKey: "crossListing.field.searchTerms", required: false, section: "content", maxBytes: 249 },
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

function ottoFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("otto"),
    ...DIMENSIONS,
    ...COMMON_CONTENT(150, 4000),
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

function ebayFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("ebay"),
    ...DIMENSIONS,
    { key: "condition", type: "select", labelKey: "crossListing.field.condition", required: true, section: "catalog", options: CONDITIONS },
    ...COMMON_CONTENT(80, 4000),
    { key: "bullets", type: "bullets", labelKey: "crossListing.field.bullets", required: false, section: "content", maxItems: 6, maxLength: 300 },
    IMAGE_FIELD(24),
    ATTRIBUTE_FIELD,
  ];
}

function kauflandFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("kaufland"),
    ...DIMENSIONS,
    { key: "condition", type: "select", labelKey: "crossListing.field.condition", required: false, section: "catalog", options: CONDITIONS },
    ...COMMON_CONTENT(200, 4000),
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

function fressnapfFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("fressnapf"),
    ...DIMENSIONS,
    { key: "petSpecies", type: "select", labelKey: "crossListing.field.petSpecies", required: true, section: "platform", options: PET_SPECIES },
    ...COMMON_CONTENT(200, 4000),
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

function mmsFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("mediamarkt-saturn"),
    ...DIMENSIONS,
    ...COMMON_CONTENT(200, 4000),
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

function zooplusFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("zooplus"),
    ...DIMENSIONS,
    { key: "petSpecies", type: "select", labelKey: "crossListing.field.petSpecies", required: true, section: "platform", options: PET_SPECIES },
    ...COMMON_CONTENT(200, 4000),
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

function tiktokFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("tiktok"),
    ...DIMENSIONS,
    ...COMMON_CONTENT(100, 2000),
    IMAGE_FIELD(9),
    ATTRIBUTE_FIELD,
  ];
}

function shopifyFields(): readonly CrossListingFieldDef[] {
  return [
    ...catalogCore("shopify"),
    ...DIMENSIONS,
    ...COMMON_CONTENT(200, 8000),
    { key: "tags", type: "tags", labelKey: "crossListing.field.tags", required: false, section: "platform", maxItems: 20 },
    { key: "seoTitle", type: "text", labelKey: "crossListing.field.seoTitle", required: false, section: "platform", maxLength: 70 },
    { key: "seoDescription", type: "textarea", labelKey: "crossListing.field.seoDescription", required: false, section: "platform", maxLength: 160 },
    IMAGE_FIELD(10),
    ATTRIBUTE_FIELD,
  ];
}

export const CROSS_LISTING_FIELD_CONFIGS: Record<CrossListingTargetSlug, CrossListingFieldConfig> = {
  amazon: { slug: "amazon", platformHintKey: "crossListing.hint.amazon", fields: amazonFields() },
  otto: { slug: "otto", platformHintKey: "crossListing.hint.otto", fields: ottoFields() },
  ebay: { slug: "ebay", platformHintKey: "crossListing.hint.ebay", fields: ebayFields() },
  kaufland: { slug: "kaufland", platformHintKey: "crossListing.hint.kaufland", fields: kauflandFields() },
  fressnapf: { slug: "fressnapf", platformHintKey: "crossListing.hint.fressnapf", fields: fressnapfFields() },
  "mediamarkt-saturn": {
    slug: "mediamarkt-saturn",
    platformHintKey: "crossListing.hint.mediamarkt-saturn",
    fields: mmsFields(),
  },
  zooplus: { slug: "zooplus", platformHintKey: "crossListing.hint.zooplus", fields: zooplusFields() },
  tiktok: { slug: "tiktok", platformHintKey: "crossListing.hint.tiktok", fields: tiktokFields() },
  shopify: { slug: "shopify", platformHintKey: "crossListing.hint.shopify", fields: shopifyFields() },
};

export function getCrossListingFieldConfig(slug: string): CrossListingFieldConfig | null {
  return (CROSS_LISTING_FIELD_CONFIGS as Record<string, CrossListingFieldConfig | undefined>)[slug] ?? null;
}
