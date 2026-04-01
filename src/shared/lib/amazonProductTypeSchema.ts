export type AmazonDynamicAttributeField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export type AmazonProductTypeSchema = {
  productType: string;
  label: string;
  attributes: AmazonDynamicAttributeField[];
};

const AMAZON_PRODUCT_TYPE_SCHEMAS: AmazonProductTypeSchema[] = [
  {
    productType: "PET_SUPPLIES",
    label: "Pet Supplies",
    attributes: [
      { key: "target_species", label: "Tierart", placeholder: "z. B. Hund, Katze", required: true },
      { key: "item_form", label: "Produktform", placeholder: "z. B. Pulver, Trockenfutter", required: true },
      { key: "age_range_description", label: "Altersgruppe", placeholder: "z. B. Adult", required: true },
      { key: "size_name", label: "Größe", placeholder: "z. B. 1 kg", required: false },
    ],
  },
  {
    productType: "HEALTH_PERSONAL_CARE",
    label: "Health & Personal Care",
    attributes: [
      { key: "item_form", label: "Produktform", placeholder: "z. B. Spray, Creme", required: true },
      { key: "material_type_free", label: "Material-frei", placeholder: "z. B. paraben free", required: false },
    ],
  },
  {
    productType: "HOME",
    label: "Home",
    attributes: [
      { key: "material", label: "Material", placeholder: "z. B. Edelstahl", required: true },
      { key: "color_name", label: "Farbe", placeholder: "z. B. Schwarz", required: false },
    ],
  },
];

export type AmazonRequiredFieldIssue = { key: string; label: string };

type AmazonDraftLike = {
  sku: string;
  title: string;
  productType: string;
  brand: string;
  conditionType: string;
  externalProductId: string;
  externalProductIdType: "ean" | "upc" | "gtin" | "isbn" | "none";
  listPriceEur: string;
  quantity: string;
  description: string;
  bulletPoints: string[];
  attributes: Record<string, string>;
};

export function getAmazonProductTypeSchema(productTypeRaw: string): AmazonProductTypeSchema | null {
  const productType = productTypeRaw.trim().toUpperCase();
  if (!productType) return null;
  return AMAZON_PRODUCT_TYPE_SCHEMAS.find((schema) => schema.productType === productType) ?? null;
}

export function getAmazonProductTypeOptions(): Array<{ value: string; label: string }> {
  return AMAZON_PRODUCT_TYPE_SCHEMAS.map((schema) => ({
    value: schema.productType,
    label: schema.label,
  }));
}

export function getMissingAmazonRequiredFields(values: AmazonDraftLike): AmazonRequiredFieldIssue[] {
  const issues: AmazonRequiredFieldIssue[] = [];
  if (!values.sku.trim()) issues.push({ key: "sku", label: "SKU" });
  if (!values.title.trim()) issues.push({ key: "title", label: "Titel" });
  if (!values.productType.trim()) issues.push({ key: "productType", label: "Produkttyp" });
  if (!values.brand.trim()) issues.push({ key: "brand", label: "Marke" });
  if (!values.conditionType.trim()) issues.push({ key: "conditionType", label: "Zustand" });
  if (!values.listPriceEur.trim()) issues.push({ key: "listPriceEur", label: "Preis (EUR)" });
  if (!values.quantity.trim()) issues.push({ key: "quantity", label: "Bestand" });
  if (!values.description.trim()) issues.push({ key: "description", label: "Beschreibung" });
  if (values.bulletPoints.map((x) => x.trim()).filter(Boolean).length === 0) {
    issues.push({ key: "bulletPoints", label: "Mind. 1 Bulletpoint" });
  }
  if (values.externalProductIdType !== "none" && !values.externalProductId.trim()) {
    issues.push({ key: "externalProductId", label: "Externe Produkt-ID" });
  }

  const schema = getAmazonProductTypeSchema(values.productType);
  if (schema) {
    for (const field of schema.attributes) {
      if (!field.required) continue;
      if (!(values.attributes[field.key] ?? "").trim()) {
        issues.push({ key: `attribute:${field.key}`, label: field.label });
      }
    }
  }
  return issues;
}
