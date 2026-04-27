import { z } from "zod";

/**
 * Zentrale Env-Validierung.
 *
 * - **Pflicht-Vars** sind im Schema als `min(1)` markiert.
 * - **Optionale Vars** werden hier nur dokumentiert/typisiert und durchgereicht; die meisten
 *   Marktplatz- und LLM-Keys sind optional, weil sie in Production über `integration_secrets`
 *   nachgereicht werden können (siehe `integrationSecrets.ts`). Wir validieren hier daher
 *   lediglich Format, nicht Anwesenheit.
 * - **Build-Zeit-Verhalten:** Wenn `SKIP_ENV_VALIDATION=1` gesetzt ist, wird nur das Schema
 *   geparst (für `next build` ohne Secrets, z. B. lokale Sanity-Builds).
 *
 * Der Importeur erhält ein typsicheres `env`-Objekt. Bei Fehlern wird **beim ersten Import**
 * ein aussagekräftiger Fehler geworfen — das passiert spätestens beim Server-Start.
 */

const trimmedString = z
  .string()
  .transform((v) => v?.trim() ?? "")
  .pipe(z.string());

const optionalString = trimmedString.optional().or(z.literal(""));

const url = trimmedString.refine(
  (v) => v === "" || /^https?:\/\//.test(v),
  "Muss eine http(s)://-URL sein"
);

const positiveIntString = trimmedString
  .refine((v) => v === "" || /^\d+$/.test(v), "Muss eine positive Ganzzahl sein")
  .optional();

const skipValidation = process.env.SKIP_ENV_VALIDATION === "1";

const baseSchema = z.object({
  // ---- Supabase (Pflicht) ----
  NEXT_PUBLIC_SUPABASE_URL: skipValidation ? optionalString : url.refine((v) => v.length > 0, "Pflicht"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: skipValidation
    ? optionalString
    : trimmedString.refine((v) => v.length > 0, "Pflicht"),
  SUPABASE_SERVICE_ROLE_KEY: optionalString, // Optional in Dev; Pflicht in Prod (manuell setzen).

  // ---- App ----
  NEXT_PUBLIC_APP_URL: optionalString,
  APP_BASE_URL: optionalString,
  OWNER_EMAILS: optionalString,

  // ---- Xentral ----
  XENTRAL_BASE_URL: optionalString,
  XENTRAL_APP_BASE_URL: optionalString,
  XENTRAL_SALES_ORDER_WEB_PATH: optionalString,
  XENTRAL_API_ACCOUNT_ID: optionalString,
  XENTRAL_APP_NAME: optionalString,
  XENTRAL_INITKEY: optionalString,
  XENTRAL_KEY: optionalString,
  XENTRAL_PAT: optionalString,
  XENTRAL_DELIVERY_SALES_SYNC_SECRET: optionalString,
  XENTRAL_DELIVERY_SALES_SYNC_PAGES_PER_RUN: positiveIntString,
  XENTRAL_DELIVERY_SALES_LIVE_WINDOW_DAYS: positiveIntString,
  XENTRAL_DELIVERY_SALES_CACHE_PATH: optionalString,
  XENTRAL_ORDERS_CACHE_FRESH_MS: positiveIntString,
  XENTRAL_ORDERS_CACHE_STALE_MS: positiveIntString,
  XENTRAL_ARTICLES_CACHE_DISABLE: optionalString,
  XENTRAL_ORDERS_CACHE_DISABLE: optionalString,

  // ---- Amazon SP-API ----
  AMAZON_SP_API_REFRESH_TOKEN: optionalString,
  AMAZON_SP_API_CLIENT_ID: optionalString,
  AMAZON_SP_API_CLIENT_SECRET: optionalString,
  AMAZON_AWS_ACCESS_KEY_ID: optionalString,
  AMAZON_AWS_SECRET_ACCESS_KEY: optionalString,
  AMAZON_AWS_SESSION_TOKEN: optionalString,
  AMAZON_SP_API_REGION: optionalString,
  AMAZON_SP_API_ENDPOINT: optionalString,
  AMAZON_SP_API_MARKETPLACE_ID: optionalString,
  AMAZON_SP_API_SELLER_ID: optionalString,
  AMAZON_SP_API_MAX_429_RETRIES: positiveIntString,
  AMAZON_SP_API_ORDERS_PAGE_DELAY_MS: positiveIntString,
  AMAZON_SALES_GRANULARITY_TIMEZONE: optionalString,
  AMAZON_RULEBOOK_PATH: optionalString,

  // ---- LLM ----
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,
  AMAZON_LLM_PROVIDER: z.enum(["claude", "openai"]).optional().or(z.literal("")),
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalString,
  AMAZON_TITLE_LLM_MODEL: optionalString,

  // ---- Marketplace Fees ----
  MARKETPLACE_FEE_DEFAULT_PERCENT: optionalString,
  MARKETPLACE_FEE_AMAZON_PERCENT: optionalString,
  MARKETPLACE_FEE_EBAY_PERCENT: optionalString,
  MARKETPLACE_FEE_OTTO_PERCENT: optionalString,
  MARKETPLACE_FEE_KAUFLAND_PERCENT: optionalString,
  MARKETPLACE_FEE_FRESSNAPF_PERCENT: optionalString,
  MARKETPLACE_FEE_MEDIAMARKT_SATURN_PERCENT: optionalString,
  MARKETPLACE_FEE_ZOOPLUS_PERCENT: optionalString,
  MARKETPLACE_FEE_TIKTOK_PERCENT: optionalString,
  MARKETPLACE_FEE_SHOPIFY_PERCENT: optionalString,

  // ---- Otto / Kaufland / Mirakl-Plattformen / Shopify / TikTok / eBay ----
  OTTO_API_BASE_URL: optionalString,
  OTTO_API_CLIENT_ID: optionalString,
  OTTO_API_CLIENT_SECRET: optionalString,
  OTTO_API_SCOPES: optionalString,
  OTTO_PRODUCTS_PATH: optionalString,
  OTTO_PRODUCTS_API_VERSION: optionalString,
  KAUFLAND_API_BASE_URL: optionalString,
  KAUFLAND_CLIENT_KEY: optionalString,
  KAUFLAND_SECRET_KEY: optionalString,
  KAUFLAND_PARTNER_CLIENT_KEY: optionalString,
  KAUFLAND_PARTNER_SECRET_KEY: optionalString,
  KAUFLAND_USER_AGENT: optionalString,
  KAUFLAND_STOREFRONT: optionalString,
  FRESSNAPF_API_BASE_URL: optionalString,
  FRESSNAPF_API_KEY: optionalString,
  FRESSNAPF_AUTH_MODE: optionalString,
  FRESSNAPF_ORDERS_PATH: optionalString,
  FRESSNAPF_PAGE_SIZE_PARAM: optionalString,
  FRESSNAPF_AMOUNT_SCALE: optionalString,
  FRESSNAPF_PAGINATION_DELAY_MS: positiveIntString,
  FRESSNAPF_MAX_429_RETRIES: positiveIntString,
  FRESSNAPF_USE_ORDER_DATE_FILTER: optionalString,
  MMS_API_BASE_URL: optionalString,
  MMS_API_KEY: optionalString,
  MMS_AUTH_MODE: optionalString,
  MMS_ORDERS_PATH: optionalString,
  ZOOPLUS_API_BASE_URL: optionalString,
  ZOOPLUS_API_KEY: optionalString,
  ZOOPLUS_AUTH_MODE: optionalString,
  SHOPIFY_API_BASE_URL: optionalString,
  SHOPIFY_API_KEY: optionalString,
  SHOPIFY_ORDERS_PATH: optionalString,
  SHOPIFY_PRODUCTS_PATH: optionalString,
  SHOPIFY_LOCATION_ID: optionalString,
  TIKTOK_API_BASE_URL: optionalString,
  TIKTOK_CLIENT_KEY: optionalString,
  TIKTOK_SECRET_KEY: optionalString,
  TIKTOK_AUTH_MODE: optionalString,
  TIKTOK_ORDERS_PATH: optionalString,
  EBAY_API_BASE_URL: optionalString,
  EBAY_AUTH_MODE: optionalString,
  EBAY_CLIENT_KEY: optionalString,
  EBAY_SECRET_KEY: optionalString,
  EBAY_ORDERS_PATH: optionalString,
  EBAY_PRODUCTS_PATH: optionalString,

  // ---- Caches & Cron ----
  INTEGRATION_CACHE_FRESH_MS: positiveIntString,
  INTEGRATION_CACHE_STALE_MS: positiveIntString,
  INTEGRATION_CACHE_DEV_MEMORY: optionalString,
  CRON_SECRET: optionalString,
  INTEGRATION_CACHE_WARM_SECRET: optionalString,
  PRICE_PARITY_CACHE_DISABLE: optionalString,
  PRICE_PARITY_AMAZON_FETCH_MS: positiveIntString,
  PROCUREMENT_LINES_CACHE_DISABLE: optionalString,
  IMAGE_PROXY_ALLOWED_HOSTS: optionalString,

  // ---- Public-Flags ----
  NEXT_PUBLIC_XENTRAL_ADDRESS_DEMO_ORDERS: optionalString,
  NEXT_PUBLIC_LOCAL_TEST_MODE: optionalString,
  NEXT_PUBLIC_LOCAL_OWNER_EMAILS: optionalString,
  NEXT_PUBLIC_KAUFLAND_ORDER_URL_TEMPLATE: optionalString,
  NEXT_PUBLIC_TIKTOK_ORDER_URL_TEMPLATE: optionalString,
  NEXT_PUBLIC_SHOPIFY_ORDER_URL_TEMPLATE: optionalString,
  NEXT_PUBLIC_OTTO_ORDER_URL_TEMPLATE: optionalString,
  NEXT_PUBLIC_FRESSNAPF_ORDER_URL_TEMPLATE: optionalString,

  // ---- Runtime ----
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = baseSchema.safeParse(process.env);

if (!parsed.success && !skipValidation) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`\n[env] Konfigurationsfehler — folgende Variablen sind ungültig:\n${issues}\n`);
  // In Production hart abbrechen; in Dev nur warnen, damit lokales Setup ohne Secrets möglich bleibt.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Ungültige Umgebungsvariablen — siehe Log oben.");
  }
}

export const env = (parsed.success ? parsed.data : (process.env as unknown)) as z.infer<typeof baseSchema>;

export type Env = typeof env;
