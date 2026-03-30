import { NextResponse } from "next/server";
import {
  ANALYTICS_MARKETPLACES,
  type AnalyticsMarketplaceSlug,
} from "@/shared/lib/analytics-marketplaces";
import { createAdminClient } from "@/shared/lib/supabase/admin";

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

export type MarketplaceCellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

export type PriceParityRow = {
  sku: string;
  name: string;
  stock: number;
  amazon: { price: number | null; state: MarketplaceCellState };
  otherMarketplaces: Record<string, { price: number | null; state: MarketplaceCellState }>;
  needsReview: boolean;
};

function normSku(value: string) {
  return value.trim().toLowerCase();
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

/**
 * SKU → Preis aus der jeweiligen `/api/.../products`-Antwort.
 * `priceEur` (Mirakl & Co.) bzw. `price` (Amazon-Listings/Reports).
 */
function skuPriceMapFromProductItems(
  items: Array<Record<string, unknown>>,
  priceKey: "priceEur" | "price"
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const it of items) {
    const sku = typeof it.sku === "string" ? it.sku : "";
    const k = normSku(sku);
    if (!k) continue;
    const raw = it[priceKey];
    const p =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : typeof raw === "string" && Number.isFinite(Number(raw))
          ? Number(raw)
          : null;
    map.set(k, p);
  }
  return map;
}

async function fetchSkuPriceMapFromProductsApi(
  origin: string,
  path: string
): Promise<Map<string, number | null> | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    return skuPriceMapFromProductItems(json.items ?? [], "priceEur");
  } catch {
    return null;
  }
}

/**
 * Amazon: gleiche Produktquelle wie die Amazon-Produktseite (`/api/amazon/products`),
 * inkl. 202 „Report wird erstellt“ und Fehlertext aus der API.
 */
async function fetchAmazonProductsPriceMap(origin: string): Promise<{
  map: Map<string, number | null> | null;
  warning: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${origin}/api/amazon/products?status=all`, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 202) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        map: null,
        warning:
          body.error ??
          "Amazon-Produktreport wird noch erstellt. Preisabgleich für Amazon ggf. unvollständig.",
      };
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { map: null, warning: err.error ?? `Amazon Produkte (${res.status})` };
    }
    const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
    // Amazon liefert je nach Quelle `price` (Listings/Report) oder `priceEur`.
    const primary = skuPriceMapFromProductItems(json.items ?? [], "price");
    if (primary.size > 0) {
      return { map: primary, warning: null };
    }
    const fallback = skuPriceMapFromProductItems(json.items ?? [], "priceEur");
    return { map: fallback, warning: null };
  } catch {
    return {
      map: null,
      warning: "Amazon Produkte konnten nicht rechtzeitig geladen werden.",
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

async function getSupabaseSecret(key: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("integration_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) return "";
    return typeof data?.value === "string" ? data.value.trim() : "";
  } catch {
    return "";
  }
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
  const clientId = env("OTTO_API_CLIENT_ID") || (await getSupabaseSecret("OTTO_API_CLIENT_ID"));
  const clientSecret =
    env("OTTO_API_CLIENT_SECRET") || (await getSupabaseSecret("OTTO_API_CLIENT_SECRET"));
  if (!clientId || !clientSecret) {
    return { bySku: new Map(), warning: null };
  }

  const baseUrl = resolveBaseUrl(env("OTTO_API_BASE_URL") || (await getSupabaseSecret("OTTO_API_BASE_URL")));
  const scopes =
    env("OTTO_API_SCOPES") || (await getSupabaseSecret("OTTO_API_SCOPES")) || "orders";

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "300") || 300, 50), 500);
    const origin = url.origin;

    const xrRes = await fetch(`${origin}/api/xentral/articles?all=1&limit=${limit}`, {
      cache: "no-store",
    });
    const xrJson = (await xrRes.json()) as { items?: XentralArticle[]; error?: string };
    if (!xrRes.ok) {
      return NextResponse.json(
        { error: xrJson.error ?? "Xentral-Artikel konnten nicht geladen werden.", rows: [] },
        { status: 502 }
      );
    }

    const articles = xrJson.items ?? [];

    const amazonPromise = fetchAmazonProductsPriceMap(origin);
    const ottoPromise = fetchOttoLatestSkuPrices();
    const productMapEntriesPromise = Promise.all(
      ANALYTICS_MARKETPLACES.map(async (m) => {
        if (m.slug === "otto") return [m.slug, null] as const;
        const path = ANALYTICS_PRODUCTS_API[m.slug];
        if (!path) return [m.slug, null] as const;
        const map = await fetchSkuPriceMapFromProductsApi(origin, path);
        return [m.slug, map] as const;
      })
    );

    const [amazonFetch, otto, productMapEntries] = await Promise.all([
      amazonPromise,
      ottoPromise,
      productMapEntriesPromise,
    ]);

    const amazonWarning = amazonFetch.warning;
    const amazonBySku = new Map<string, { price: number | null }>();
    if (amazonFetch.map) {
      for (const [k, price] of amazonFetch.map) {
        amazonBySku.set(k, { price });
      }
    }

    const ottoBySku = otto.bySku;

    const productMaps: Partial<Record<AnalyticsMarketplaceSlug, Map<string, number | null> | null>> =
      {};
    for (const [slug, map] of productMapEntries) {
      if (slug === "otto") continue;
      productMaps[slug] = map;
    }

    const rows: PriceParityRow[] = articles.map((a) => {
      const key = normSku(a.sku);
      const amz = key ? amazonBySku.get(key) : undefined;
      const amazonPrice = amz?.price ?? null;
      const ottoPrice = key ? (ottoBySku.get(key) ?? null) : null;

      const flat: Record<string, MutableCell> = {};

      let amazonProv: MarketplaceCellState = "ok";
      if (!amz) amazonProv = "missing";
      else if (amazonPrice == null) amazonProv = "no_price";
      flat.amazon = { price: amazonPrice, state: amazonProv };

      for (const m of ANALYTICS_MARKETPLACES) {
        if (m.slug === "otto") continue;
        const pmap = productMaps[m.slug];
        if (pmap == null) {
          flat[m.slug] = { price: null, state: "not_connected" };
          continue;
        }
        const hasSku = Boolean(key && pmap.has(key));
        const price = hasSku ? (pmap.get(key) ?? null) : null;
        let ms: MarketplaceCellState = "ok";
        if (!key || !hasSku) ms = "missing";
        else if (price == null) ms = "no_price";
        flat[m.slug] = { price, state: ms };
      }

      if (ottoBySku.size > 0) {
        let ottoState: MarketplaceCellState = "ok";
        if (!key || !ottoBySku.has(key)) ottoState = "missing";
        else if (ottoPrice == null) ottoState = "no_price";
        flat.otto = { price: ottoPrice, state: ottoState };
      } else {
        flat.otto = { price: null, state: "not_connected" };
      }

      const afterDeviation = applyMajorityDeviation(flat);
      const amazon = afterDeviation.amazon ?? { price: amazonPrice, state: amazonProv };
      const otherMarketplaces: Record<string, { price: number | null; state: MarketplaceCellState }> =
        {};
      for (const m of ANALYTICS_MARKETPLACES) {
        otherMarketplaces[m.slug] =
          afterDeviation[m.slug] ?? flat[m.slug] ?? { price: null, state: "not_connected" };
      }

      const needsReview =
        amazon.state !== "ok" ||
        Object.values(otherMarketplaces).some(
          (c) => c.state !== "ok" && c.state !== "not_connected"
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

    const issueCount = rows.filter((r) => r.needsReview).length;

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
