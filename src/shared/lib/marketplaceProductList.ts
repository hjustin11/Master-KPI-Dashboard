/** Einheitliche Tabellenzeile für Marktplatz-Produktlisten (wie Amazon-Produkte). */
export type MarketplaceProductListRow = {
  sku: string;
  secondaryId: string;
  title: string;
  statusLabel: string;
  isActive: boolean;
  /** Brutto EUR, falls die Quelle einen Preis liefert (Preisübersicht / Analytics). */
  priceEur?: number | null;
  /** Marktplatz-Bestand (falls Quelle vorhanden). */
  stockQty?: number | null;
};

export type MarketplaceProductsListResponse = {
  items?: MarketplaceProductListRow[];
  /** Gesamtanzahl Einträge (serverseitige Pagination). */
  totalCount?: number;
  error?: string;
  missingKeys?: string[];
  hint?: string;
  /** PostgREST-Fehler beim Lesen von integration_secrets (nur wenn leer). */
  integrationSecretsLoadErrors?: string[];
  pending?: boolean;
};

const PRODUCT_PAGE_MAX = 200;

/**
 * `limit` in der Query aktiviert serverseitige Seiten (`offset` default 0).
 */
export function parseProductListPagination(request: Request): { limit: number; offset: number } | null {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  if (limitRaw == null || limitRaw === "") return null;
  const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), PRODUCT_PAGE_MAX);
  const offsetRaw = url.searchParams.get("offset");
  const offset = Math.max(Number(offsetRaw ?? "0") || 0, 0);
  return { limit, offset };
}
