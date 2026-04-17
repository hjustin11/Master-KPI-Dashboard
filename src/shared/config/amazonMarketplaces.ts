/**
 * Amazon EU Multi-Country Marketplace Registry.
 *
 * Eine Unified-Account-SP-API-Verbindung kann mit denselben Credentials
 * (LWA Refresh-Token, AWS Creds, Seller-ID) auf allen EU-Marktplätzen operieren.
 * Pro Land unterscheiden sich nur marketplace_id + language_tag + Währung.
 *
 * Phase 1: Konfiguration existiert, DE ist per Default aktiv, alle anderen
 * Länder sind abgeschaltet. Aktivierung läuft später über eine DB-Tabelle
 * `amazon_marketplace_config`.
 */

export type AmazonMarketplaceConfig = {
  /** Dashboard-Slug: "amazon-de", "amazon-fr", ... */
  slug: string;
  /** SP-API marketplace_id (fest) */
  marketplaceId: string;
  /** Display-Name */
  name: string;
  /** Kurzform für kompakte UIs */
  shortName: string;
  /** ISO-Ländercode */
  country: string;
  /** Flag-Emoji */
  countryFlag: string;
  /** Endkunden-Domain */
  domain: string;
  /** Amazon-Content-Sprache */
  languageTag: string;
  /** ISO-Währung der Auszahlungen auf diesem Marktplatz */
  currencyCode: string;
  /** Default-Locale für issueLocale / Fehlermeldungen */
  issueLocale: string;
  /** Phase-1-Default: nur DE aktiv; DB überschreibt später */
  enabled: boolean;
};

export const AMAZON_EU_MARKETPLACES: AmazonMarketplaceConfig[] = [
  {
    slug: "amazon-de",
    marketplaceId: "A1PA6795UKMFR9",
    name: "Amazon Deutschland",
    shortName: "Amazon DE",
    country: "DE",
    countryFlag: "🇩🇪",
    domain: "amazon.de",
    languageTag: "de_DE",
    currencyCode: "EUR",
    issueLocale: "de_DE",
    enabled: true,
  },
  {
    slug: "amazon-fr",
    marketplaceId: "A13V1IB3VIYZZH",
    name: "Amazon Frankreich",
    shortName: "Amazon FR",
    country: "FR",
    countryFlag: "🇫🇷",
    domain: "amazon.fr",
    languageTag: "fr_FR",
    currencyCode: "EUR",
    issueLocale: "fr_FR",
    enabled: false,
  },
  {
    slug: "amazon-it",
    marketplaceId: "APJ6JRA9NG5V4",
    name: "Amazon Italien",
    shortName: "Amazon IT",
    country: "IT",
    countryFlag: "🇮🇹",
    domain: "amazon.it",
    languageTag: "it_IT",
    currencyCode: "EUR",
    issueLocale: "it_IT",
    enabled: false,
  },
  {
    slug: "amazon-es",
    marketplaceId: "A1RKKUPIHCS9HS",
    name: "Amazon Spanien",
    shortName: "Amazon ES",
    country: "ES",
    countryFlag: "🇪🇸",
    domain: "amazon.es",
    languageTag: "es_ES",
    currencyCode: "EUR",
    issueLocale: "es_ES",
    enabled: false,
  },
  {
    slug: "amazon-nl",
    marketplaceId: "A1805IZSGTT6HS",
    name: "Amazon Niederlande",
    shortName: "Amazon NL",
    country: "NL",
    countryFlag: "🇳🇱",
    domain: "amazon.nl",
    languageTag: "nl_NL",
    currencyCode: "EUR",
    issueLocale: "nl_NL",
    enabled: false,
  },
  {
    slug: "amazon-pl",
    marketplaceId: "A1C3SOZRARQ6R3",
    name: "Amazon Polen",
    shortName: "Amazon PL",
    country: "PL",
    countryFlag: "🇵🇱",
    domain: "amazon.pl",
    languageTag: "pl_PL",
    currencyCode: "PLN",
    issueLocale: "pl_PL",
    enabled: false,
  },
  {
    slug: "amazon-se",
    marketplaceId: "A2NODRKZP88ZB9",
    name: "Amazon Schweden",
    shortName: "Amazon SE",
    country: "SE",
    countryFlag: "🇸🇪",
    domain: "amazon.se",
    languageTag: "sv_SE",
    currencyCode: "SEK",
    issueLocale: "sv_SE",
    enabled: false,
  },
  {
    slug: "amazon-be",
    marketplaceId: "AMEN7PMS3EDWL",
    name: "Amazon Belgien",
    shortName: "Amazon BE",
    country: "BE",
    countryFlag: "🇧🇪",
    domain: "amazon.com.be",
    languageTag: "fr_BE",
    currencyCode: "EUR",
    issueLocale: "fr_BE",
    enabled: false,
  },
  {
    slug: "amazon-uk",
    marketplaceId: "A1F83G8C2ARO7P",
    name: "Amazon UK",
    shortName: "Amazon UK",
    country: "GB",
    countryFlag: "🇬🇧",
    domain: "amazon.co.uk",
    languageTag: "en_GB",
    currencyCode: "GBP",
    issueLocale: "en_GB",
    enabled: false,
  },
];

const BY_SLUG = new Map(AMAZON_EU_MARKETPLACES.map((m) => [m.slug, m]));
const BY_MARKETPLACE_ID = new Map(
  AMAZON_EU_MARKETPLACES.map((m) => [m.marketplaceId, m])
);

/** Phase-1-Default: DE. Spätere Phasen können via DB-Flag überschreiben. */
export const DEFAULT_AMAZON_SLUG = "amazon-de";

export function getAmazonMarketplaceBySlug(slug: string): AmazonMarketplaceConfig | undefined {
  return BY_SLUG.get(slug);
}

export function getAmazonMarketplaceByMarketplaceId(
  marketplaceId: string
): AmazonMarketplaceConfig | undefined {
  return BY_MARKETPLACE_ID.get(marketplaceId);
}

export function getEnabledAmazonMarketplaces(): AmazonMarketplaceConfig[] {
  return AMAZON_EU_MARKETPLACES.filter((m) => m.enabled);
}

export function isAmazonSlug(slug: string): boolean {
  return slug.startsWith("amazon-") && BY_SLUG.has(slug);
}

/**
 * Default-Marketplace-ID für bestehenden Code der kein Slug weiterreicht.
 * Nutzt die ENV-Liste (falls gesetzt) als Fallback, sonst die Config-Default.
 * Das hält Phase-1-Code rückwärtskompatibel.
 */
export function getDefaultAmazonMarketplaceId(envMarketplaceIds?: string[]): string {
  if (envMarketplaceIds && envMarketplaceIds.length > 0 && envMarketplaceIds[0]) {
    return envMarketplaceIds[0];
  }
  return BY_SLUG.get(DEFAULT_AMAZON_SLUG)?.marketplaceId ?? "A1PA6795UKMFR9";
}

export function getLanguageTagForMarketplaceId(
  marketplaceId: string,
  fallback = "de_DE"
): string {
  return BY_MARKETPLACE_ID.get(marketplaceId)?.languageTag ?? fallback;
}

export function getIssueLocaleForMarketplaceId(
  marketplaceId: string,
  fallback = "de_DE"
): string {
  return BY_MARKETPLACE_ID.get(marketplaceId)?.issueLocale ?? fallback;
}
