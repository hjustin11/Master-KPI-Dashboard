import { NextResponse } from "next/server";
import {
  ANALYTICS_MARKETPLACES,
  type AnalyticsMarketplaceSlug,
} from "@/shared/lib/analytics-marketplaces";
import { loadMarketplaceProductRowsForPriceParity } from "@/shared/lib/marketplaceProductCachesPrime";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  loadAmazonSpApiProductsConfig,
  type AmazonProductsCachedPayload,
} from "@/shared/lib/amazonProductsSpApiCatalog";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad, readIntegrationCache } from "@/shared/lib/integrationDataCache";
import {
  batchMatchArticles,
  type BatchMatchEntry,
} from "@/shared/lib/crossListing/batchArticleMatcher";
import type { MatchCandidate, MatchType, XentralArticle as MatcherArticle } from "@/shared/lib/crossListing/articleMatcher";

/** Muss unter /api/amazon/products maxDuration (120s) liegen; genug für Kalt-Sync ohne Abort. */
export const maxDuration = 120;

/** Interner fetch zu /api/amazon/products — Fallback falls Cache leer. Reduziert von 115s auf 30s (Cache-First für Amazon aktiv). */
const AMAZON_PRODUCTS_INTERNAL_FETCH_MS = Math.min(
  60_000,
  Math.max(5_000, Number(process.env.PRICE_PARITY_AMAZON_FETCH_MS) || 30_000)
);

class PriceParityHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super("PriceParityHttpError");
    this.name = "PriceParityHttpError";
  }
}

const PRICE_PARITY_CACHE_FRESH_MS = 3 * 60 * 1000;
const PRICE_PARITY_CACHE_STALE_MS = 45 * 60 * 1000;

type XentralArticle = {
  sku: string;
  name: string;
  stock: number;
  price: number | null;
  ean?: string | null;
};

type OttoAmount = { amount?: number | string };
type OttoPositionItem = {
  product?: { sku?: string };
  item_value_reduced_gross_price?: OttoAmount;
  itemValueReducedGrossPrice?: OttoAmount;
  item_value_gross_price?: OttoAmount;
  itemValueGrossPrice?: OttoAmount;
};
type OttoOrder = {
  order_date?: string;
  orderDate?: string;
  position_items?: OttoPositionItem[];
  positionItems?: OttoPositionItem[];
};
type OttoOrdersPayload = {
  resources?: OttoOrder[];
  links?: Array<{ href?: string; rel?: string }>;
};

export type MarketplaceCellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

export type PriceParityMatchInfo = {
  type: MatchType;
  confidence: number;
  marketplaceSku: string | null;
  reason: string;
};

export type PriceParityCell = {
  price: number | null;
  state: MarketplaceCellState;
  stock: number | null;
  stockState: MarketplaceCellState;
  matchInfo?: PriceParityMatchInfo | null;
};

export type PriceParityRow = {
  sku: string;
  name: string;
  stock: number;
  amazon: PriceParityCell;
  otherMarketplaces: Record<string, PriceParityCell>;
  needsReview: boolean;
};

function normSku(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Server-interne `fetch()`-Aufrufe zur eigenen Origin haben standardmäßig keine Session-Cookies —
 * die Middleware würde auf `/login` (HTML) redirecten → `res.json()` wirft „Unexpected token '<'“.
 */
function forwardAuthHeadersFrom(request: Request): HeadersInit {
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return headers;
}

/** Produkte-API je Marktplatz (ohne Amazon-Spalte; Otto liefert hier den Bestand). */
const ANALYTICS_PRODUCTS_API: Partial<Record<AnalyticsMarketplaceSlug, string>> = {
  otto: "/api/otto/products",
  ebay: "/api/ebay/products",
  kaufland: "/api/kaufland/products",
  fressnapf: "/api/fressnapf/products",
  "mediamarkt-saturn": "/api/mediamarkt-saturn/products",
  zooplus: "/api/zooplus/products",
  tiktok: "/api/tiktok/products",
  shopify: "/api/shopify/products",
};

/** Dieselbe Supabase-Cache-Schicht wie die Dashboard-Produkt-GETs (kein interner HTTP-Fetch). */
/** Marktplätze (ohne Amazon) die Produktdaten direkt aus Supabase-Cache lesen statt HTTP-Roundtrip. Amazon nutzt eigene Cache-Logik in fetchAmazonProductsPriceMap(). */
const MP_PRODUCTS_INTEGRATION_CACHE_SLUGS = new Set<AnalyticsMarketplaceSlug>([
  "shopify",
  "ebay",
  "kaufland",
  "fressnapf",
  "zooplus",
  "mediamarkt-saturn",
]);

type SkuSnapshot = {
  price: number | null;
  stock: number | null;
  title?: string | null;
  ean?: string | null;
  secondaryId?: string | null;
  asin?: string | null;
};

/** Extrahiert EAN/GTIN aus `extras` oder direkten Feldern einer Marktplatz-Zeile. */
function extractEan(row: Record<string, unknown>): string | null {
  const extras = (row.extras as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    row.ean,
    row.gtin,
    row.barcode,
    extras.ean,
    extras.gtin,
    extras.barcode,
    extras.productReferences,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return null;
}

function extractAsin(row: Record<string, unknown>): string | null {
  const extras = (row.extras as Record<string, unknown> | undefined) ?? {};
  const candidates = [row.asin, extras.asin];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * SKU → Preis/Bestand aus der jeweiligen `/api/.../products`-Antwort.
 * `priceEur` (Mirakl & Co.) bzw. `price` (Amazon-Listings/Reports).
 */
function skuSnapshotMapFromProductItems(
  items: Array<Record<string, unknown>>,
  priceKey: "priceEur" | "price"
): Map<string, SkuSnapshot> {
  const map = new Map<string, SkuSnapshot>();
  for (const it of items) {
    const sku = typeof it.sku === "string" ? it.sku : "";
    const k = normSku(sku);
    if (!k) continue;
    const p = parseNumber(it[priceKey]);
    const stock =
      parseNumber(it.stockQty) ??
      parseNumber(it.stock) ??
      parseNumber(it.quantity) ??
      parseNumber(it.availableQuantity) ??
      parseNumber(it.inventoryQuantity) ??
      parseNumber(it.inventory_quantity) ??
      parseNumber(it.available) ??
      parseNumber(it.old_inventory_quantity) ??
      parseNumber(it.offer_quantity) ??
      parseNumber(it.available_quantity) ??
      parseNumber(it.fulfillable_quantity) ??
      parseNumber(it.afn_fulfillable_quantity) ??
      parseNumber(it.mfn_fulfillable_quantity) ??
      null;
    const title = typeof it.title === "string" ? it.title : null;
    const secondaryId = typeof it.secondaryId === "string" ? it.secondaryId : null;
    map.set(k, {
      price: p,
      stock,
      title,
      secondaryId,
      ean: extractEan(it),
      asin: extractAsin(it),
    });
  }
  return map;
}

/** Aus Product-Items → Kandidaten für Multi-Identifier-Matching. */
function candidatesFromProductItems(items: Array<Record<string, unknown>>): MatchCandidate[] {
  return items.map((it) => ({
    marketplaceSku: typeof it.sku === "string" ? it.sku : null,
    ean: extractEan(it),
    asin: extractAsin(it),
    title: typeof it.title === "string" ? it.title : null,
    secondaryId: typeof it.secondaryId === "string" ? it.secondaryId : null,
  }));
}

type MarketplaceCatalog = {
  map: Map<string, SkuSnapshot>;
  candidates: MatchCandidate[];
};

async function fetchSkuPriceMapFromProductsApi(
  origin: string,
  path: string,
  initHeaders: HeadersInit,
  forceRefresh = false
): Promise<MarketplaceCatalog | null> {
  try {
    const productsUrl = new URL(path, origin);
    if (forceRefresh) productsUrl.searchParams.set("refresh", "1");
    const res = await fetch(productsUrl.toString(), { cache: "no-store", headers: initHeaders });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const items = json.items ?? [];
    return {
      map: skuSnapshotMapFromProductItems(items, "priceEur"),
      candidates: candidatesFromProductItems(items),
    };
  } catch {
    return null;
  }
}

/**
 * Amazon: gleiche Produktquelle wie die Amazon-Produktseite (`/api/amazon/products`),
 * inkl. 202 „Report wird erstellt“ und Fehlertext aus der API.
 *
 * `marketplaceId` wie in `loadAmazonSpApiProductsConfig` (gleicher Integration-Cache-Key wie die Produkt-API).
 */
async function fetchAmazonProductsPriceMap(
  origin: string,
  initHeaders: HeadersInit,
  marketplaceId: string | undefined,
  forceRefresh = false
): Promise<{
  map: Map<string, SkuSnapshot> | null;
  candidates: MatchCandidate[];
  warning: string | null;
}> {
  if (!forceRefresh && marketplaceId) {
    const cached = await readIntegrationCache<AmazonProductsCachedPayload>(
      `amazon:products:${marketplaceId}`
    );
    if (cached.state !== "miss" && Array.isArray(cached.value?.rows)) {
      const rows = cached.value.rows as Array<Record<string, unknown>>;
      const primary = skuSnapshotMapFromProductItems(rows, "price");
      if (primary.size > 0) return { map: primary, candidates: candidatesFromProductItems(rows), warning: null };
      const fallback = skuSnapshotMapFromProductItems(rows, "priceEur");
      if (fallback.size > 0) return { map: fallback, candidates: candidatesFromProductItems(rows), warning: null };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AMAZON_PRODUCTS_INTERNAL_FETCH_MS);
  try {
    const amazonParams = new URLSearchParams({
      status: "all",
      all: "1",
      ...(forceRefresh ? { refresh: "1" } : {}),
    });
    const res = await fetch(`${origin}/api/amazon/products?${amazonParams}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: initHeaders,
    });

    if (res.status === 202) {
      await res.json().catch(() => ({}));
      return {
        map: null,
        candidates: [],
        warning: "Amazon Produkte werden im Hintergrund aktualisiert. Preisabgleich folgt automatisch.",
      };
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { map: null, candidates: [], warning: err.error ?? `Amazon Produkte (${res.status})` };
    }
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const items = json.items ?? [];
    // Amazon liefert je nach Quelle `price` (Listings/Report) oder `priceEur`.
    const primary = skuSnapshotMapFromProductItems(items, "price");
    if (primary.size > 0) {
      return { map: primary, candidates: candidatesFromProductItems(items), warning: null };
    }
    const fallback = skuSnapshotMapFromProductItems(items, "priceEur");
    return { map: fallback, candidates: candidatesFromProductItems(items), warning: null };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      map: null,
      candidates: [],
      warning: aborted
        ? "Amazon-Produktliste antwortet zu langsam. Bitte erneut laden oder Cache auf der Amazon-Produktseite aufwärmen."
        : "Amazon Produkte werden im Hintergrund aktualisiert.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Gleicher Cent-Bucket wie bei Mehrheitszählung. */
function priceBucketKey(price: number): string {
  return (Math.round(price * 100) / 100).toFixed(2);
}

type MutableCell = { price: number | null; state: MarketplaceCellState };

/**
 * Unter allen Kanälen mit gültigem Preis (Zustand ok): Mehrheitspreis bestimmen.
 * Liegt genau ein Preis-Bucket klar vor allen anderen (höchste Häufigkeit, kein Gleichstand an der Spitze),
 * weichen alle anderen Buckets ab → dort `mismatch`. Sonst kein mismatch unter den Preisen.
 */
function applyMajorityDeviation(states: Record<string, MutableCell>): Record<string, MutableCell> {
  const priced: Array<{ id: string; price: number; key: string }> = [];
  for (const [id, c] of Object.entries(states)) {
    if (c.state === "ok" && c.price != null && Number.isFinite(c.price)) {
      const key = priceBucketKey(c.price);
      priced.push({ id, price: c.price, key });
    }
  }
  if (priced.length < 2) {
    return states;
  }

  const counts = new Map<string, number>();
  for (const p of priced) {
    counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];
  if (!top || (second && second[1] === top[1])) {
    return states;
  }

  const consensusKey = top[0];
  const out: Record<string, MutableCell> = { ...states };
  for (const p of priced) {
    if (p.key !== consensusKey) {
      out[p.id] = { price: p.price, state: "mismatch" };
    }
  }
  return out;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function resolveBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "https://api.otto.market";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

async function fetchOttoLatestSkuPrices(): Promise<{
  bySku: Map<string, number | null>;
  warning: string | null;
}> {
  const clientId = await getIntegrationSecretValue("OTTO_API_CLIENT_ID");
  const clientSecret = await getIntegrationSecretValue("OTTO_API_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { bySku: new Map(), warning: null };
  }

  const baseUrl = resolveBaseUrl(await getIntegrationSecretValue("OTTO_API_BASE_URL"));
  const scopes = (await getIntegrationSecretValue("OTTO_API_SCOPES")) || "orders";

  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes,
  });
  const tokenRes = await fetch(`${baseUrl}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
    cache: "no-store",
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  const token = tokenJson.access_token;
  if (!tokenRes.ok || !token) {
    return { bySku: new Map(), warning: `Otto Token (${tokenRes.status})` };
  }

  const endMs = Date.now();
  const startMs = endMs - 60 * 24 * 60 * 60 * 1000;
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();

  const bySku = new Map<string, { price: number | null; date: string }>();
  let nextHref: string | undefined;

  for (let guard = 0; guard < 30; guard += 1) {
    const url = nextHref ? new URL(nextHref, baseUrl) : new URL("/v4/orders", baseUrl);
    if (!nextHref) {
      url.searchParams.set("fromOrderDate", fromIso);
      url.searchParams.set("toOrderDate", toIso);
      url.searchParams.set("orderColumnType", "ORDER_DATE");
      url.searchParams.set("limit", "128");
    }
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Request-Timestamp": new Date().toISOString(),
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as OttoOrdersPayload;
    if (!res.ok) {
      return { bySku: new Map(), warning: `Otto Orders (${res.status})` };
    }

    for (const order of json.resources ?? []) {
      const orderDate = (order.order_date ?? order.orderDate ?? "").slice(0, 10);
      const items = Array.isArray(order.position_items)
        ? order.position_items
        : Array.isArray(order.positionItems)
          ? order.positionItems
          : [];
      for (const item of items) {
        const sku = item.product?.sku?.trim();
        if (!sku) continue;
        const k = normSku(sku);
        const reduced = item.item_value_reduced_gross_price ?? item.itemValueReducedGrossPrice;
        const gross = item.item_value_gross_price ?? item.itemValueGrossPrice;
        const amount = toNumber((reduced ?? gross)?.amount ?? NaN);
        const price = Number.isFinite(amount) && amount > 0 ? amount : null;
        const prev = bySku.get(k);
        if (!prev || orderDate >= prev.date) {
          bySku.set(k, { price, date: orderDate });
        }
      }
    }

    nextHref = (json.links ?? []).find((l) => l?.rel === "next")?.href;
    if (!nextHref) break;
  }

  return {
    bySku: new Map(Array.from(bySku.entries()).map(([k, v]) => [k, v.price])),
    warning: null,
  };
}

/**
 * Rüstet Zeilen mit `missing`-Zellen nach: EAN/ASIN/Titel-Match gegen Marktplatz-Kandidaten.
 * Preis/Bestand werden aus dem Snapshot des Matches übernommen; `matchInfo` dokumentiert
 * die Übereinstimmung für UI/Debug.
 */
function applyMultiIdentifierMatching(
  rows: PriceParityRow[],
  articles: XentralArticle[],
  productCandidates: Partial<Record<AnalyticsMarketplaceSlug, MatchCandidate[]>>,
  amazonCandidates: MatchCandidate[]
): void {
  const matcherArticles: MatcherArticle[] = articles.map((a) => ({
    sku: a.sku,
    title: a.name,
    ean: a.ean ?? null,
  }));

  const upgradeCell = (
    cell: PriceParityCell,
    entry: BatchMatchEntry,
    candidates: MatchCandidate[],
    items: Array<Record<string, unknown>> | null
  ): void => {
    if (!entry.result.matched || !entry.result.candidate) return;
    if (cell.state !== "missing" && cell.stockState !== "missing") return;
    const c = entry.result.candidate;
    const matchedSku = typeof c.marketplaceSku === "string" ? c.marketplaceSku : null;

    // Preis/Bestand aus Rohdaten des Matches ziehen, falls vorhanden.
    let matchedPrice: number | null = null;
    let matchedStock: number | null = null;
    if (items && matchedSku) {
      const row = items.find((it) => (typeof it.sku === "string" ? it.sku : "") === matchedSku);
      if (row) {
        matchedPrice =
          parseNumber(row.priceEur) ?? parseNumber(row.price) ?? null;
        matchedStock =
          parseNumber(row.stockQty) ?? parseNumber(row.stock) ?? parseNumber(row.quantity) ?? null;
      }
    }

    const confidence = entry.result.confidence;
    const shouldTrust = confidence >= 0.8;
    if (cell.state === "missing") {
      cell.state = shouldTrust ? (matchedPrice != null ? "ok" : "no_price") : "missing";
      if (shouldTrust && matchedPrice != null) cell.price = matchedPrice;
    }
    if (cell.stockState === "missing") {
      cell.stockState = shouldTrust ? (matchedStock != null ? "ok" : "no_price") : "missing";
      if (shouldTrust && matchedStock != null) cell.stock = matchedStock;
    }
    cell.matchInfo = {
      type: entry.result.matchType ?? "manual",
      confidence,
      marketplaceSku: matchedSku,
      reason: entry.result.reason,
    };
    void candidates;
  };

  // Amazon
  const amazonMissingIdx: number[] = [];
  rows.forEach((r, i) => {
    if (r.amazon.state === "missing" || r.amazon.stockState === "missing") amazonMissingIdx.push(i);
  });
  if (amazonMissingIdx.length && amazonCandidates.length) {
    const entries = batchMatchArticles(
      amazonMissingIdx.map((i) => matcherArticles[i]),
      amazonCandidates
    );
    entries.forEach((entry, j) => {
      const row = rows[amazonMissingIdx[j]];
      upgradeCell(row.amazon, entry, amazonCandidates, null);
    });
  }

  // Andere Marktplätze
  for (const m of ANALYTICS_MARKETPLACES) {
    const candidates = productCandidates[m.slug] ?? [];
    if (!candidates.length) continue;
    const missingIdx: number[] = [];
    rows.forEach((r, i) => {
      const cell = r.otherMarketplaces[m.slug];
      if (cell && (cell.state === "missing" || cell.stockState === "missing")) missingIdx.push(i);
    });
    if (!missingIdx.length) continue;
    const entries = batchMatchArticles(
      missingIdx.map((i) => matcherArticles[i]),
      candidates
    );
    entries.forEach((entry, j) => {
      const cell = rows[missingIdx[j]].otherMarketplaces[m.slug];
      if (cell) upgradeCell(cell, entry, candidates, null);
    });
  }
}

async function computePriceParityPayload(request: Request): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "300") || 300, 50), 500);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const origin = url.origin;
  const authHeaders = forwardAuthHeadersFrom(request);

  const xrRes = await fetch(`${origin}/api/xentral/articles?all=1&limit=${limit}`, {
    cache: "no-store",
    headers: authHeaders,
  });
  let xrJson: { items?: XentralArticle[]; error?: string };
  try {
    xrJson = (await xrRes.json()) as { items?: XentralArticle[]; error?: string };
  } catch {
    throw new PriceParityHttpError(502, {
      error:
        "Preisvergleich: interne API lieferte kein JSON (oft fehlende Session beim Server-Aufruf). Bitte Seite neu laden.",
      rows: [],
    });
  }
  if (!xrRes.ok) {
    throw new PriceParityHttpError(502, {
      error: xrJson.error ?? "Xentral-Artikel konnten nicht geladen werden.",
      rows: [],
    });
  }

  const articles = xrJson.items ?? [];

  const amazonProductsConfig = await loadAmazonSpApiProductsConfig();
  const amazonMarketplaceId = amazonProductsConfig.marketplaceIds[0];
  const amazonPromise = fetchAmazonProductsPriceMap(
    origin,
    authHeaders,
    amazonMarketplaceId,
    forceRefresh
  );
  const ottoPromise = fetchOttoLatestSkuPrices();
  const productMapEntriesPromise = Promise.all(
    ANALYTICS_MARKETPLACES.map(async (m): Promise<readonly [AnalyticsMarketplaceSlug, MarketplaceCatalog | null]> => {
      const path = ANALYTICS_PRODUCTS_API[m.slug];
      if (!path) return [m.slug, null] as const;
      if (MP_PRODUCTS_INTEGRATION_CACHE_SLUGS.has(m.slug)) {
        const rows = await loadMarketplaceProductRowsForPriceParity(m.slug, forceRefresh);
        if (rows === null) return [m.slug, null] as const;
        const items = rows as Array<Record<string, unknown>>;
        return [
          m.slug,
          {
            map: skuSnapshotMapFromProductItems(items, "priceEur"),
            candidates: candidatesFromProductItems(items),
          },
        ] as const;
      }
      const catalog = await fetchSkuPriceMapFromProductsApi(origin, path, authHeaders, forceRefresh);
      return [m.slug, catalog] as const;
    })
  );

  const [amazonFetch, otto, productMapEntries] = await Promise.all([
    amazonPromise,
    ottoPromise,
    productMapEntriesPromise,
  ]);

  const amazonWarning = amazonFetch.warning;
  const amazonBySku = new Map<string, SkuSnapshot>();
  if (amazonFetch.map) {
    for (const [k, snapshot] of amazonFetch.map) {
      amazonBySku.set(k, snapshot);
    }
  }

  const ottoBySku = otto.bySku;
  const productMaps: Partial<Record<AnalyticsMarketplaceSlug, Map<string, SkuSnapshot> | null>> = {};
  const productCandidates: Partial<Record<AnalyticsMarketplaceSlug, MatchCandidate[]>> = {};
  for (const [slug, catalog] of productMapEntries) {
    productMaps[slug] = catalog?.map ?? null;
    productCandidates[slug] = catalog?.candidates ?? [];
  }
  const ottoProductsConnected = productMaps.otto != null;
  const ottoHasAnyStock =
    productMaps.otto != null &&
    Array.from(productMaps.otto.values()).some((snap) => snap.stock != null && Number.isFinite(snap.stock));
  const ottoWarning =
    otto.warning ??
    (!ottoProductsConnected
      ? "Otto Availability nicht verbunden oder Scope „availability“ fehlt."
      : !ottoHasAnyStock
        ? "Otto Availability verbunden, liefert aber derzeit keine SKU-Mengen."
      : null);

  const rows: PriceParityRow[] = articles.map((a) => {
    const key = normSku(a.sku);
    const amz = key ? amazonBySku.get(key) : undefined;
    const amazonPrice = amz?.price ?? null;
    /** `null` = unbekannt (nicht als 0 ausgeben — vorher `?? 0` maskierte fehlende Bestände). */
    const amazonStock: number | null = amz ? amz.stock : null;
    const ottoPrice = key ? (ottoBySku.get(key) ?? null) : null;
    const ottoProductsMap = productMaps.otto;
    const ottoHasSkuInProducts = Boolean(key && ottoProductsMap?.has(key));
    const ottoProductSnap = ottoHasSkuInProducts
      ? (ottoProductsMap?.get(key) ?? { price: null, stock: null })
      : { price: null, stock: null };
    const ottoProductPrice = ottoProductSnap.price;
    const ottoStock = ottoProductSnap.stock;
    const effectiveOttoPrice = ottoPrice ?? ottoProductPrice ?? null;

    const flat: Record<string, MutableCell> = {};
    const stockFlat: Record<string, { stock: number | null; state: MarketplaceCellState }> = {};

    let amazonProv: MarketplaceCellState = "ok";
    if (!amz) amazonProv = "missing";
    else if (amazonPrice == null) amazonProv = "no_price";
    let amazonStockState: MarketplaceCellState = "ok";
    if (!amz) amazonStockState = "missing";
    else if (amazonStock == null) amazonStockState = "no_price";
    flat.amazon = { price: amazonPrice, state: amazonProv };
    stockFlat.amazon = { stock: amazonStock, state: amazonStockState };

    for (const m of ANALYTICS_MARKETPLACES) {
      if (m.slug === "otto") continue;
      const pmap = productMaps[m.slug];
      if (pmap == null) {
        flat[m.slug] = { price: null, state: "not_connected" };
        stockFlat[m.slug] = { stock: null, state: "not_connected" };
        continue;
      }
      const hasSku = Boolean(key && pmap.has(key));
      const snap = hasSku ? (pmap.get(key) ?? { price: null, stock: null }) : { price: null, stock: null };
      const price = snap.price;
      const stock = snap.stock;
      let ms: MarketplaceCellState = "ok";
      if (!key || !hasSku) ms = "missing";
      else if (price == null) ms = "no_price";
      let mStockState: MarketplaceCellState = "ok";
      if (!key || !hasSku) mStockState = "missing";
      else if (stock == null) mStockState = "no_price";
      flat[m.slug] = { price, state: ms };
      stockFlat[m.slug] = { stock, state: mStockState };
    }

    if (ottoBySku.size > 0) {
      let ottoState: MarketplaceCellState = "ok";
      if (!key || (!ottoBySku.has(key) && !ottoHasSkuInProducts)) ottoState = "missing";
      else if (effectiveOttoPrice == null) ottoState = "no_price";
      flat.otto = { price: effectiveOttoPrice, state: ottoState };
    } else if (ottoHasSkuInProducts) {
      const ottoState: MarketplaceCellState = effectiveOttoPrice == null ? "no_price" : "ok";
      flat.otto = { price: effectiveOttoPrice, state: ottoState };
    } else {
      flat.otto = { price: null, state: "not_connected" };
    }
    if (ottoProductsMap == null) {
      stockFlat.otto = { stock: null, state: "not_connected" };
    } else {
      let ottoStockState: MarketplaceCellState = "ok";
      if (!key || !ottoHasSkuInProducts) ottoStockState = "missing";
      else if (ottoStock == null) ottoStockState = "no_price";
      stockFlat.otto = { stock: ottoStock, state: ottoStockState };
    }

    const afterDeviation = applyMajorityDeviation(flat);
    const amazon = {
      price: (afterDeviation.amazon ?? { price: amazonPrice, state: amazonProv }).price,
      state: (afterDeviation.amazon ?? { price: amazonPrice, state: amazonProv }).state,
      stock: stockFlat.amazon?.stock ?? null,
      stockState: stockFlat.amazon?.state ?? "not_connected",
    };
    const otherMarketplaces: Record<string, PriceParityCell> =
      {};
    for (const m of ANALYTICS_MARKETPLACES) {
      const p = afterDeviation[m.slug] ?? flat[m.slug] ?? { price: null, state: "not_connected" };
      const s = stockFlat[m.slug] ?? { stock: null, state: "not_connected" };
      otherMarketplaces[m.slug] = {
        price: p.price,
        state: p.state,
        stock: s.stock,
        stockState: s.state,
      };
    }

    const needsReview =
      amazon.state !== "ok" ||
      amazon.stockState !== "ok" ||
      Object.values(otherMarketplaces).some(
        (c) =>
          (c.state !== "ok" && c.state !== "not_connected") ||
          (c.stockState !== "ok" && c.stockState !== "not_connected")
      );

    return {
      sku: a.sku,
      name: a.name,
      stock: a.stock,
      amazon,
      otherMarketplaces,
      needsReview,
    };
  });

  // Multi-Identifier-Matching: für Zellen mit "missing" Zustand versuchen
  // wir EAN/ASIN/Titel-Match gegen die Marktplatz-Kandidaten.
  applyMultiIdentifierMatching(rows, articles, productCandidates, amazonFetch.candidates);

  // Gespeicherte Listing-Mappings laden (z. B. nach Upload via Cross-Listing).
  // Damit wird eine Zelle nicht mehr als "missing" angezeigt, sobald wir den Artikel
  // auf dem Marktplatz hochgeladen haben — auch wenn der Produkt-Cache noch nachhinkt.
  try {
    const adminForMappings = createAdminClient();
    const { data: mappings } = await adminForMappings
      .from("marketplace_article_mappings")
      .select("xentral_sku, marketplace_slug, match_type, confidence");
    if (Array.isArray(mappings) && mappings.length) {
      const bySkuSlug = new Map<string, { matchType: MatchType; confidence: number }>();
      for (const m of mappings) {
        const sku =
          typeof m.xentral_sku === "string" ? m.xentral_sku.trim().toLowerCase() : "";
        const slug =
          typeof m.marketplace_slug === "string" ? m.marketplace_slug.trim() : "";
        const type = typeof m.match_type === "string" ? (m.match_type as MatchType) : "manual";
        const conf = typeof m.confidence === "number" ? m.confidence : 1;
        if (!sku || !slug) continue;
        bySkuSlug.set(`${sku}::${slug}`, { matchType: type, confidence: conf });
      }
      for (const row of rows) {
        const sku = row.sku.trim().toLowerCase();
        if (!sku) continue;
        const amazonMapping = bySkuSlug.get(`${sku}::amazon`);
        if (amazonMapping && row.amazon.state === "missing") {
          row.amazon.matchInfo = row.amazon.matchInfo ?? {
            type: amazonMapping.matchType,
            confidence: amazonMapping.confidence,
            marketplaceSku: row.sku,
            reason: "Listing wurde via Cross-Listing hochgeladen.",
          };
        }
        for (const m of ANALYTICS_MARKETPLACES) {
          const mapping = bySkuSlug.get(`${sku}::${m.slug}`);
          if (!mapping) continue;
          const cell = row.otherMarketplaces[m.slug];
          if (!cell) continue;
          if (cell.state === "missing" || cell.state === "not_connected") {
            cell.matchInfo = cell.matchInfo ?? {
              type: mapping.matchType,
              confidence: mapping.confidence,
              marketplaceSku: row.sku,
              reason: "Listing wurde via Cross-Listing hochgeladen.",
            };
          }
        }
      }
    }
  } catch {
    // Tabelle fehlt ggf. in alten Envs.
  }

  try {
    const admin = createAdminClient();
    const { data: overrides } = await admin
      .from("marketplace_price_stock_overrides")
      .select("sku, marketplace_slug, price_eur, stock_qty");
    const byKey = new Map<
      string,
      { price_eur: number | null; stock_qty: number | null }
    >();
    for (const o of overrides ?? []) {
      const sku = typeof o.sku === "string" ? o.sku.trim().toLowerCase() : "";
      const slug = typeof o.marketplace_slug === "string" ? o.marketplace_slug.trim() : "";
      if (!sku || !slug) continue;
      byKey.set(`${sku}::${slug}`, {
        price_eur: o.price_eur == null ? null : Number(o.price_eur),
        stock_qty: o.stock_qty == null ? null : Number(o.stock_qty),
      });
    }

    for (const row of rows) {
      const sku = row.sku.trim().toLowerCase();
      if (!sku) continue;
      const amazonOverride = byKey.get(`${sku}::amazon`);
      if (amazonOverride) {
        if (amazonOverride.price_eur != null) {
          row.amazon.price = amazonOverride.price_eur;
          row.amazon.state = "ok";
        }
        if (amazonOverride.stock_qty != null) {
          row.amazon.stock = amazonOverride.stock_qty;
          row.amazon.stockState = "ok";
        }
      }
      for (const m of ANALYTICS_MARKETPLACES) {
        const ov = byKey.get(`${sku}::${m.slug}`);
        if (!ov) continue;
        const c = row.otherMarketplaces[m.slug];
        if (!c) continue;
        if (ov.price_eur != null) {
          c.price = ov.price_eur;
          c.state = "ok";
        }
        if (ov.stock_qty != null) {
          c.stock = ov.stock_qty;
          c.stockState = "ok";
        }
      }
    }
  } catch {
    // Overrides optional: table might be missing in older environments.
  }

  for (const r of rows) {
    r.needsReview =
      r.amazon.state !== "ok" ||
      r.amazon.stockState !== "ok" ||
      Object.values(r.otherMarketplaces).some(
        (c) =>
          (c.state !== "ok" && c.state !== "not_connected") ||
          (c.stockState !== "ok" && c.stockState !== "not_connected")
      );
  }

  const issueCount = rows.filter((r) => r.needsReview).length;

  return {
    meta: {
      articleCount: rows.length,
      amazonMatchedSkus: amazonBySku.size,
      amazonWarning,
      ottoWarning,
      channels: {
        connected: [
          "amazon",
          ...(ottoBySku.size > 0 || productMaps.otto != null ? ["otto"] : []),
          ...ANALYTICS_MARKETPLACES.filter((m) => {
            if (m.slug === "otto") return false;
            return productMaps[m.slug] != null;
          }).map((m) => m.slug),
        ],
        planned: [],
      },
    },
    rows,
    issueCount,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "300") || 300, 50), 500);
  const bypassCache =
    url.searchParams.get("refresh") === "1" || process.env.PRICE_PARITY_CACHE_DISABLE === "1";

  try {
    const payload = bypassCache
      ? await computePriceParityPayload(request)
      : await getIntegrationCachedOrLoad({
          cacheKey: `marketplaces:price-parity:limit=${limit}`,
          source: "marketplaces:price-parity",
          freshMs: PRICE_PARITY_CACHE_FRESH_MS,
          staleMs: PRICE_PARITY_CACHE_STALE_MS,
          loader: () => computePriceParityPayload(request),
        });
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof PriceParityHttpError) {
      return NextResponse.json(e.body, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
