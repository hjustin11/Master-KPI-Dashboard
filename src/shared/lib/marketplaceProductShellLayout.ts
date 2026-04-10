import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

/** Slug wie in den Dashboard-Routen (`/shopify/products` → `shopify`). */
export type MarketplaceProductShellSlug =
  | "shopify"
  | "ebay"
  | "kaufland"
  | "otto"
  | "fressnapf"
  | "zooplus"
  | "mediamarkt-saturn"
  | "tiktok";

export type ShellFieldFormat = "text" | "currencyEur" | "integer" | "boolean";

export type ShellLayoutField = {
  /** Schlüssel in `row.extras` */
  extrasKey: string;
  /** i18n-Key unter `marketplaceProducts.shellLayout.fields.*` */
  labelKey: string;
  format?: ShellFieldFormat;
};

export type ShellMarketplaceSection = {
  /** i18n: `marketplaceProducts.shellLayout.sections.*` */
  titleKey: string;
  hintKey?: string;
  fields: ShellLayoutField[];
};

export type ShellLayoutDefinition = {
  marketplaceSections: ShellMarketplaceSection[];
};

const SHOPIFY: ShellLayoutDefinition = {
  marketplaceSections: [
    {
      titleKey: "shopifyCatalog",
      hintKey: "shopifyCatalogHint",
      fields: [
        { extrasKey: "vendor", labelKey: "vendor", format: "text" },
        { extrasKey: "product_type", labelKey: "productType", format: "text" },
        { extrasKey: "handle", labelKey: "handle", format: "text" },
        { extrasKey: "storefront_url", labelKey: "storefrontUrl", format: "text" },
        { extrasKey: "admin_product_url", labelKey: "adminProductUrl", format: "text" },
        { extrasKey: "description_text", labelKey: "descriptionText", format: "text" },
        { extrasKey: "tags", labelKey: "tags", format: "text" },
        { extrasKey: "created_at", labelKey: "createdAt", format: "text" },
        { extrasKey: "updated_at", labelKey: "updatedAt", format: "text" },
        { extrasKey: "variant_id", labelKey: "variantId", format: "text" },
        { extrasKey: "variant_title", labelKey: "variantTitle", format: "text" },
        { extrasKey: "variant_barcode", labelKey: "variantBarcode", format: "text" },
      ],
    },
  ],
};

const EBAY: ShellLayoutDefinition = {
  marketplaceSections: [
    {
      titleKey: "ebayOffer",
      hintKey: "ebayOfferHint",
      fields: [
        { extrasKey: "condition", labelKey: "condition", format: "text" },
        { extrasKey: "locale", labelKey: "locale", format: "text" },
        { extrasKey: "group_ids", labelKey: "groupIds", format: "text" },
        { extrasKey: "package_weight_value", labelKey: "packageWeight", format: "text" },
        { extrasKey: "package_weight_unit", labelKey: "packageWeightUnit", format: "text" },
        { extrasKey: "mpn", labelKey: "mpn", format: "text" },
        { extrasKey: "epid", labelKey: "epid", format: "text" },
      ],
    },
  ],
};

const MIRAKL: ShellLayoutDefinition = {
  marketplaceSections: [
    {
      titleKey: "miraklOffer",
      hintKey: "miraklOfferHint",
      fields: [
        { extrasKey: "category_label", labelKey: "category", format: "text" },
        { extrasKey: "leadtime_to_ship", labelKey: "leadtimeToShip", format: "integer" },
        { extrasKey: "min_shipping_price_amount", labelKey: "minShippingPrice", format: "currencyEur" },
        { extrasKey: "state", labelKey: "offerState", format: "text" },
        { extrasKey: "description_excerpt", labelKey: "descriptionExcerpt", format: "text" },
      ],
    },
  ],
};

const KAUFLAND: ShellLayoutDefinition = {
  marketplaceSections: [
    {
      titleKey: "kauflandUnit",
      hintKey: "kauflandUnitHint",
      fields: [
        { extrasKey: "id_offer", labelKey: "idOffer", format: "text" },
        { extrasKey: "id_unit", labelKey: "idUnit", format: "text" },
        { extrasKey: "id_product", labelKey: "idProduct", format: "text" },
        { extrasKey: "unit_status", labelKey: "unitStatus", format: "text" },
        { extrasKey: "listing_status", labelKey: "listingStatus", format: "text" },
        { extrasKey: "fixed_price_raw", labelKey: "fixedPriceRaw", format: "text" },
      ],
    },
  ],
};

const OTTO: ShellLayoutDefinition = {
  marketplaceSections: [
    {
      titleKey: "ottoProduct",
      hintKey: "ottoProductHint",
      fields: [
        { extrasKey: "product_reference", labelKey: "productReference", format: "text" },
        { extrasKey: "active_status", labelKey: "activeStatus", format: "text" },
        { extrasKey: "variation_id", labelKey: "variationId", format: "text" },
        { extrasKey: "brand_hint", labelKey: "brand", format: "text" },
        { extrasKey: "product_line_hint", labelKey: "productLine", format: "text" },
      ],
    },
  ],
};

const TIKTOK: ShellLayoutDefinition = {
  marketplaceSections: [],
};

const LAYOUTS: Record<MarketplaceProductShellSlug, ShellLayoutDefinition> = {
  shopify: SHOPIFY,
  ebay: EBAY,
  kaufland: KAUFLAND,
  otto: OTTO,
  fressnapf: MIRAKL,
  zooplus: MIRAKL,
  "mediamarkt-saturn": MIRAKL,
  tiktok: TIKTOK,
};

export function resolveShellLayout(slug: string): ShellLayoutDefinition {
  const k = slug as MarketplaceProductShellSlug;
  return LAYOUTS[k] ?? { marketplaceSections: [] };
}

export function extrasKeysForTechnicalTable(
  row: MarketplaceProductListRow,
  layout: ShellLayoutDefinition
): string[] {
  const used = new Set<string>();
  for (const sec of layout.marketplaceSections) {
    for (const f of sec.fields) used.add(f.extrasKey);
  }
  const ex = row.extras ?? {};
  return Object.keys(ex).filter((k) => !used.has(k)).sort((a, b) => a.localeCompare(b));
}

/**
 * Frische Listen-API-Zeile überlagert die Tabellenzeile (u. a. `extras`).
 */
export function displayRowFromApi(
  tableRow: MarketplaceProductListRow,
  apiRecord: Record<string, unknown> | null
): MarketplaceProductListRow {
  if (!apiRecord) return tableRow;
  const ex = apiRecord.extras;
  const extrasFromApi =
    ex && typeof ex === "object" && !Array.isArray(ex) ? (ex as Record<string, unknown>) : undefined;
  return {
    sku: String(apiRecord.sku ?? tableRow.sku),
    secondaryId: String(apiRecord.secondaryId ?? tableRow.secondaryId),
    title: String(apiRecord.title ?? tableRow.title),
    statusLabel: String(apiRecord.statusLabel ?? tableRow.statusLabel),
    isActive: typeof apiRecord.isActive === "boolean" ? apiRecord.isActive : tableRow.isActive,
    priceEur: typeof apiRecord.priceEur === "number" ? apiRecord.priceEur : tableRow.priceEur,
    stockQty: typeof apiRecord.stockQty === "number" ? apiRecord.stockQty : tableRow.stockQty,
    extras: extrasFromApi ?? tableRow.extras,
  };
}
