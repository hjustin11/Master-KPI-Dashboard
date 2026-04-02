import { NextResponse } from "next/server";
import {
  ANALYTICS_MARKETPLACES,
  type AnalyticsMarketplaceSlug,
} from "@/shared/lib/analytics-marketplaces";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad, readIntegrationCache } from "@/shared/lib/integrationDataCache";

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

type AmazonProductsCachedPayload = {
  sellerId: string;
  rows: Array<Record<string, unknown>>;
};

export type MarketplaceCellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

export type PriceParityCell = {
  price: number | null;
  state: MarketplaceCellState;
  stock: number | null;
  stockState: MarketplaceCellState;
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

/** Produkte-API je Marktplatz (ohne Amazon-Spalte; Otto bleibt über Auftragspreise). */
const ANALYTICS_PRODUCTS_API: Partial<Record<AnalyticsMarketplaceSlug, string>> = {
  ebay: "/api/ebay/products",
  kaufland: "/api/kaufland/products",
  fressnapf: "/api/fressnapf/products",
  "mediamarkt-saturn": "/api/mediamarkt-saturn/products",
  zooplus: "/api/zooplus/products",
  tiktok: "/api/tiktok/products",
  shopify: "/api/shopify/products",
};

type SkuSnapshot = { price: number | null; stock: number | null };

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
    map.set(k, { price: p, stock });
  }
  return map;
}

async function fetchSkuPriceMapFromProductsApi(
  origin: string,
  path: string,
  initHeaders: HeadersInit
): Promise<Map<string, SkuSnapshot> | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: "no-store", headers: initHeaders });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    return skuSnapshotMapFromProductItems(json.items ?? [], "priceEur");
  } catch {
    return null;
  }
}

/**
 * Amazon: gleiche Produktquelle wie die Amazon-Produktseite (`/api/amazon/products`),
 * inkl. 202 „Report wird erstellt“ und Fehlertext aus der API.
 */
async function fetchAmazonProductsPriceMap(
  origin: string,
  initHeaders: HeadersInit
): Promise<{
  map: Map<string, SkuSnapshot> | null;
  warning: string | null;
}> {
  const marketplaceIdsRaw =
    process.env.AMAZON_SP_API_MARKETPLACE_IDS ??
    process.env.AMAZON_SP_API_MARKETPLACE_ID ??
    (await getIntegrationSecretValue("AMAZON_SP_API_MARKETPLACE_IDS")) ??
    (await getIntegrationSecretValue("AMAZON_SP_API_MARKETPLACE_ID")) ??
    "";
  const marketplaceId = marketplaceIdsRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)[0];

  if (marketplaceId) {
    const cached = await readIntegrationCache<AmazonProductsCachedPayload>(
      `amazon:products:${marketplaceId}`
    );
    if (cached.state !== "miss" && Array.isArray(cached.value?.rows)) {
      const primary = skuSnapshotMapFromProductItems(cached.value.rows, "price");
      if (primary.size > 0) return { map: primary, warning: null };
      const fallback = skuSnapshotMapFromProductItems(cached.value.rows, "priceEur");
      if (fallback.size > 0) return { map: fallback, warning: null };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch(`${origin}/api/amazon/products?status=all&all=1`, {
      cache: "no-store",
      signal: controller.signal,
      headers: initHeaders,
    });

    if (res.status === 202) {
      await res.json().catch(() => ({}));
      return {
        map: null,
        warning: "Amazon Produkte werden im Hintergrund aktualisiert. Preisabgleich folgt automatisch.",
      };
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { map: null, warning: err.error ?? `Amazon Produkte (${res.status})` };
    }
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    // Amazon liefert je nach Quelle `price` (Listings/Report) oder `priceEur`.
    const primary = skuSnapshotMapFromProductItems(json.items ?? [], "price");
    if (primary.size > 0) {
      return { map: primary, warning: null };
    }
    const fallback = skuSnapshotMapFromProductItems(json.items ?? [], "priceEur");
    return { map: fallback, warning: null };
  } catch {
    return {
      map: null,
      warning: "Amazon Produkte werden im Hintergrund aktualisiert.",
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

function env(name: string) {
  return (process.env[name] ?? "").trim();
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

async function computePriceParityPayload(request: Request): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "300") || 300, 50), 500);
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

  const amazonPromise = fetchAmazonProductsPriceMap(origin, authHeaders);
  const ottoPromise = fetchOttoLatestSkuPrices();
  const productMapEntriesPromise = Promise.all(
    ANALYTICS_MARKETPLACES.map(async (m) => {
      if (m.slug === "otto") return [m.slug, null] as const;
      const path = ANALYTICS_PRODUCTS_API[m.slug];
      if (!path) return [m.slug, null] as const;
      const map = await fetchSkuPriceMapFromProductsApi(origin, path, authHeaders);
      return [m.slug, map] as const;
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

  const productMaps: Partial<Record<AnalyticsMarketplaceSlug, Map<string, SkuSnapshot> | null>> =
    {};
  for (const [slug, map] of productMapEntries) {
    if (slug === "otto") continue;
    productMaps[slug] = map;
  }

  const rows: PriceParityRow[] = articles.map((a) => {
    const key = normSku(a.sku);
    const amz = key ? amazonBySku.get(key) : undefined;
    const amazonPrice = amz?.price ?? null;
    const amazonStock = amz?.stock ?? 0;
    const ottoPrice = key ? (ottoBySku.get(key) ?? null) : null;

    const flat: Record<string, MutableCell> = {};
    const stockFlat: Record<string, { stock: number | null; state: MarketplaceCellState }> = {};

    let amazonProv: MarketplaceCellState = "ok";
    if (!amz) amazonProv = "missing";
    else if (amazonPrice == null) amazonProv = "no_price";
    let amazonStockState: MarketplaceCellState = "ok";
    if (!amz) amazonStockState = "missing";
    else if (amazonStock == null) amazonStockState = "not_connected";
    flat.amazon = { price: amazonPrice, state: amazonProv };
    stockFlat.amazon = { stock: amazonStock, state: amazonStockState };

    for (const m of ANALYTICS_MARKETPLACES) {
      if (m.slug === "otto") continue;
      const pmap = productMaps[m.slug];
      if (pmap == null) {
        flat[m.slug] = { price: null, state: "not_connected" };
        stockFlat[m.slug] = { stock: 0, state: "not_connected" };
        continue;
      }
      const hasSku = Boolean(key && pmap.has(key));
      const snap = hasSku ? (pmap.get(key) ?? { price: null, stock: null }) : { price: null, stock: null };
      const price = snap.price;
      const stock = snap.stock ?? 0;
      let ms: MarketplaceCellState = "ok";
      if (!key || !hasSku) ms = "missing";
      else if (price == null) ms = "no_price";
      let mStockState: MarketplaceCellState = "ok";
      if (!key || !hasSku) mStockState = "missing";
      else if (stock == null) mStockState = "not_connected";
      flat[m.slug] = { price, state: ms };
      stockFlat[m.slug] = { stock, state: mStockState };
    }

    if (ottoBySku.size > 0) {
      let ottoState: MarketplaceCellState = "ok";
      if (!key || !ottoBySku.has(key)) ottoState = "missing";
      else if (ottoPrice == null) ottoState = "no_price";
      flat.otto = { price: ottoPrice, state: ottoState };
      stockFlat.otto = { stock: 0, state: "not_connected" };
    } else {
      flat.otto = { price: null, state: "not_connected" };
      stockFlat.otto = { stock: 0, state: "not_connected" };
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
      ottoWarning: otto.warning,
      channels: {
        connected: [
          "amazon",
          ...(ottoBySku.size > 0 ? ["otto"] : []),
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
