/**
 * Kompakte Datenquellen-Labels für Analytics → Marktplätze → Artikel & Preisvergleich.
 * Sollte mit `app/api/marketplaces/price-parity/route.ts` sinngemäß übereinstimmen.
 */

import type { AnalyticsMarketplaceSlug } from "@/shared/lib/analytics-marketplaces";

export type PriceParityColumnApiDoc = {
  /** Anzeigename der Quelle, z. B. "Amazon" */
  source: string;
  /** Technischer Schlüssel der Pipeline (snake_case) */
  apiId: string;
  /** Optional: HTTP-Pfad oder Kurzbeschreibung des Endpunkts */
  route?: string;
  /** Optional: ein kurzer Zusatz (Fallback, Overrides, …) */
  hint?: string;
};

const OVERRIDE_HINT =
  "Manuelle Werte: Supabase `marketplace_price_stock_overrides` (nach API-Merge).";

export const PRICE_PARITY_DOC_XENTRAL_SKU: PriceParityColumnApiDoc = {
  source: "Xentral",
  apiId: "xentral_api_articles_sku",
  route: "GET /api/xentral/articles?all=1&limit=…",
  hint: "Feld `items[].sku` (normiert Kleinbuchstaben).",
};

export const PRICE_PARITY_DOC_XENTRAL_STOCK: PriceParityColumnApiDoc = {
  source: "Xentral",
  apiId: "xentral_api_articles_stock",
  route: "GET /api/xentral/articles?all=1&limit=…",
  hint: "Feld `items[].stock` (Stamm-Lager, nicht FBA-pro Marktplatz).",
};

export const PRICE_PARITY_DOC_XENTRAL_NAME: PriceParityColumnApiDoc = {
  source: "Xentral",
  apiId: "xentral_api_articles_name",
  route: "GET /api/xentral/articles?all=1&limit=…",
  hint: "Feld `items[].name`.",
};

export const PRICE_PARITY_DOC_AMAZON: PriceParityColumnApiDoc = {
  source: "Amazon",
  apiId: "amazon_api_products_price",
  route: "GET /api/amazon/products?status=all&all=1",
  hint: `Bestand nur aus derselben API (amazon_api_products_stock); kein Xentral-Fallback. Ohne API-Bestand wird 0 gezeigt + Hinweis. ${OVERRIDE_HINT}`,
};

function flexMarketplaceDoc(label: string, apiId: string, apiPath: string): PriceParityColumnApiDoc {
  return {
    source: label,
    apiId,
    route: `GET ${apiPath}`,
    hint: `Preis: \`priceEur\` u. a.; Bestand: Felder wie in skuSnapshotMapFromProductItems. ${OVERRIDE_HINT}`,
  };
}

export const PRICE_PARITY_DOC_OTTO: PriceParityColumnApiDoc = {
  source: "Otto",
  apiId: "otto_api_orders_line_price",
  route: "OAuth → GET /v4/orders (letzte 60 Tage, Pagination)",
  hint: `Keine Produktlisten-API hier; Preis aus Auftragsposition. Bestand ohne API-Wert = 0 + Hinweis (kein Xentral-Fallback). ${OVERRIDE_HINT}`,
};

export const PRICE_PARITY_DOC_EBAY = flexMarketplaceDoc("eBay", "ebay_api_products", "/api/ebay/products");
export const PRICE_PARITY_DOC_KAUFLAND = flexMarketplaceDoc(
  "Kaufland",
  "kaufland_api_products",
  "/api/kaufland/products"
);
export const PRICE_PARITY_DOC_FRESSNAPF = flexMarketplaceDoc(
  "Fressnapf",
  "fressnapf_api_products",
  "/api/fressnapf/products"
);
export const PRICE_PARITY_DOC_MMS = flexMarketplaceDoc(
  "MediaMarkt & Saturn",
  "mediamarkt_saturn_api_products",
  "/api/mediamarkt-saturn/products"
);
export const PRICE_PARITY_DOC_ZOOPLUS = flexMarketplaceDoc("ZooPlus", "zooplus_api_products", "/api/zooplus/products");
export const PRICE_PARITY_DOC_SHOPIFY = flexMarketplaceDoc("Shopify", "shopify_api_products", "/api/shopify/products");

export const PRICE_PARITY_DOC_TIKTOK: PriceParityColumnApiDoc = {
  source: "TikTok",
  apiId: "tiktok_api_products",
  route: "GET /api/tiktok/products",
  hint: `Analog Flex-Marktplätze; bei 501/leer: Spalte „nicht verbunden“. ${OVERRIDE_HINT}`,
};

export const PRICE_PARITY_DOC_BY_MARKETPLACE_SLUG: Record<AnalyticsMarketplaceSlug, PriceParityColumnApiDoc> = {
  otto: PRICE_PARITY_DOC_OTTO,
  ebay: PRICE_PARITY_DOC_EBAY,
  kaufland: PRICE_PARITY_DOC_KAUFLAND,
  fressnapf: PRICE_PARITY_DOC_FRESSNAPF,
  "mediamarkt-saturn": PRICE_PARITY_DOC_MMS,
  zooplus: PRICE_PARITY_DOC_ZOOPLUS,
  tiktok: PRICE_PARITY_DOC_TIKTOK,
  shopify: PRICE_PARITY_DOC_SHOPIFY,
};
