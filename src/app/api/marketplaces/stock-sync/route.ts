import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";
import { parseRequestBody } from "@/shared/lib/apiValidation";
import {
  FLEX_MARKETPLACE_EBAY_SPEC,
  FLEX_MARKETPLACE_MMS_SPEC,
  FLEX_MARKETPLACE_ZOOPLUS_SPEC,
  getFlexIntegrationConfig,
} from "@/shared/lib/flexMarketplaceApiClient";
import { getFressnapfIntegrationConfig } from "@/shared/lib/fressnapfApiClient";
import {
  getKauflandIntegrationConfig,
  signKauflandRequest,
} from "@/shared/lib/kauflandApiClient";
import { syncAmazonMfnStockQuantities } from "@/shared/lib/amazonListingsMfnStock";
import {
  getOttoAccessToken,
  getOttoIntegrationConfig,
  syncOttoStockAndPrice,
} from "@/shared/lib/ottoApiClient";

type MarketplaceSlug =
  | "amazon"
  | "otto"
  | "ebay"
  | "kaufland"
  | "fressnapf"
  | "mediamarkt-saturn"
  | "zooplus"
  | "shopify"
  | "tiktok";

const KNOWN_MARKETPLACE_SLUGS = new Set<string>([
  "amazon",
  "otto",
  "ebay",
  "kaufland",
  "fressnapf",
  "mediamarkt-saturn",
  "zooplus",
  "shopify",
  "tiktok",
]);

function isKnownMarketplaceSlug(s: string): s is MarketplaceSlug {
  return KNOWN_MARKETPLACE_SLUGS.has(s);
}

type UpdateItem = {
  sku: string;
  marketplaceSlug: MarketplaceSlug;
  stockQty?: number;
  priceEur?: number;
};

type Failure = {
  marketplaceSlug: string;
  sku: string;
  reason: string;
};

type Success = {
  marketplaceSlug: string;
  sku: string;
};

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeUpdates(raw: unknown): { items: UpdateItem[]; unknownSlugFailures: Failure[] } {
  if (!Array.isArray(raw)) return { items: [], unknownSlugFailures: [] };
  const out: UpdateItem[] = [];
  const unknownSlugFailures: Failure[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const sku = String(r.sku ?? "").trim();
    const slugRaw = String(r.marketplaceSlug ?? "").trim();
    const stockQtyRaw = asFiniteNumber(r.stockQty);
    const priceEurRaw = asFiniteNumber(r.priceEur);
    if (!sku || !slugRaw || (stockQtyRaw == null && priceEurRaw == null)) continue;
    if (!isKnownMarketplaceSlug(slugRaw)) {
      unknownSlugFailures.push({
        marketplaceSlug: slugRaw,
        sku,
        reason: `Unbekannter oder nicht unterstützter Marktplatz-Slug "${slugRaw}".`,
      });
      continue;
    }
    out.push({
      sku,
      marketplaceSlug: slugRaw,
      stockQty: stockQtyRaw == null ? undefined : Math.max(0, Math.trunc(stockQtyRaw)),
      priceEur: priceEurRaw == null ? undefined : Number(priceEurRaw.toFixed(2)),
    });
  }
  return { items: out, unknownSlugFailures };
}

async function syncViaInternalShopifyRoute(
  request: Request,
  updates: UpdateItem[]
): Promise<{ success: Success[]; failures: Failure[] }> {
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/shopify/products/stock-sync`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      updates: updates.map((u) => ({
        sku: u.sku,
        stockQty: u.stockQty,
        priceEur: u.priceEur,
      })),
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    failed?: Array<{ sku?: string; reason?: string }>;
    updatedCount?: number;
  };
  const failedMap = new Map<string, string>();
  for (const f of json.failed ?? []) {
    const sku = String(f.sku ?? "").trim();
    if (!sku) continue;
    failedMap.set(sku.toLowerCase(), String(f.reason ?? "Shopify update fehlgeschlagen."));
  }
  if (!res.ok && failedMap.size === 0) {
    const reason = json.error ?? `Shopify sync HTTP ${res.status}`;
    return {
      success: [],
      failures: updates.map((u) => ({ marketplaceSlug: "shopify", sku: u.sku, reason })),
    };
  }
  const success: Success[] = [];
  const failures: Failure[] = [];
  for (const u of updates) {
    const key = u.sku.toLowerCase();
    const err = failedMap.get(key);
    if (err) failures.push({ marketplaceSlug: "shopify", sku: u.sku, reason: err });
    else success.push({ marketplaceSlug: "shopify", sku: u.sku });
  }
  return { success, failures };
}

async function resolveEbayBearerToken(config: {
  baseUrl: string;
  clientKey: string;
  secretKey: string;
}): Promise<string> {
  const tokenUrl = `${config.baseUrl.replace(/\/+$/, "")}/identity/v1/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
  });
  const basic = Buffer.from(`${config.clientKey}:${config.secretKey}`, "utf8").toString("base64");
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || `eBay OAuth HTTP ${res.status}`);
  }
  return json.access_token;
}

async function syncEbay(updates: UpdateItem[]): Promise<{ success: Success[]; failures: Failure[] }> {
  const config = await getFlexIntegrationConfig(FLEX_MARKETPLACE_EBAY_SPEC);
  if (!config.baseUrl) {
    return {
      success: [],
      failures: updates.map((u) => ({
        marketplaceSlug: "ebay",
        sku: u.sku,
        reason: "EBAY_API_BASE_URL fehlt.",
      })),
    };
  }

  let bearer = config.apiKey || "";
  if (!bearer && config.clientKey && config.secretKey) {
    bearer = await resolveEbayBearerToken({
      baseUrl: config.baseUrl,
      clientKey: config.clientKey,
      secretKey: config.secretKey,
    });
  }
  if (!bearer) {
    return {
      success: [],
      failures: updates.map((u) => ({
        marketplaceSlug: "ebay",
        sku: u.sku,
        reason: "eBay Credentials fehlen (Token/Client+Secret).",
      })),
    };
  }

  const success: Success[] = [];
  const failures: Failure[] = [];
  const base = config.baseUrl.replace(/\/+$/, "");
  for (const u of updates) {
    try {
      const encodedSku = encodeURIComponent(u.sku);
      const getRes = await fetch(`${base}/sell/inventory/v1/inventory_item/${encodedSku}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${bearer}` },
        cache: "no-store",
      });
      const current = (await getRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (!getRes.ok) {
        failures.push({
          marketplaceSlug: "ebay",
          sku: u.sku,
          reason: `Inventory read HTTP ${getRes.status}`,
        });
        continue;
      }
      const availability =
        (current.availability as Record<string, unknown> | undefined) ?? {};
      const shipToLoc =
        (availability.shipToLocationAvailability as Record<string, unknown> | undefined) ?? {};
      const body = {
        ...current,
        product:
          u.priceEur != null
            ? {
                ...((current.product as Record<string, unknown> | undefined) ?? {}),
                price: {
                  value: u.priceEur.toFixed(2),
                  currency: "EUR",
                },
              }
            : (current.product as Record<string, unknown> | undefined),
        availability: {
          ...availability,
          shipToLocationAvailability: {
            ...shipToLoc,
            ...(u.stockQty != null ? { quantity: u.stockQty } : {}),
          },
        },
      };
      const putRes = await fetch(`${base}/sell/inventory/v1/inventory_item/${encodedSku}`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!putRes.ok) {
        failures.push({
          marketplaceSlug: "ebay",
          sku: u.sku,
          reason: `Inventory update HTTP ${putRes.status}`,
        });
        continue;
      }
      success.push({ marketplaceSlug: "ebay", sku: u.sku });
    } catch (e) {
      failures.push({
        marketplaceSlug: "ebay",
        sku: u.sku,
        reason: e instanceof Error ? e.message : "eBay stock update fehlgeschlagen.",
      });
    }
  }
  return { success, failures };
}

type MiraklLikeConfig = {
  baseUrl: string;
  authMode: "bearer" | "x-api-key" | "mirakl";
  apiKey: string;
};

function miraklLikeHeaders(config: MiraklLikeConfig): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (config.authMode === "x-api-key") h["X-API-Key"] = config.apiKey;
  else if (config.authMode === "mirakl") h.Authorization = config.apiKey;
  else h.Authorization = `Bearer ${config.apiKey}`;
  return h;
}

async function syncMiraklLike(
  marketplaceSlug: "fressnapf" | "mediamarkt-saturn" | "zooplus",
  updates: UpdateItem[],
  config: MiraklLikeConfig
): Promise<{ success: Success[]; failures: Failure[] }> {
  if (!config.baseUrl || !config.apiKey) {
    return {
      success: [],
      failures: updates.map((u) => ({
        marketplaceSlug,
        sku: u.sku,
        reason: "API-Konfiguration unvollständig.",
      })),
    };
  }
  const base = config.baseUrl.replace(/\/+$/, "");
  const headers = miraklLikeHeaders(config);
  const success: Success[] = [];
  const failures: Failure[] = [];

  for (const u of updates) {
    try {
      const qRes = await fetch(`${base}/api/offers?shop_sku=${encodeURIComponent(u.sku)}&max=1`, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      const qJson = (await qRes.json().catch(() => ({}))) as { offers?: Array<Record<string, unknown>> };
      if (!qRes.ok) {
        failures.push({
          marketplaceSlug,
          sku: u.sku,
          reason: `Offer lookup HTTP ${qRes.status}`,
        });
        continue;
      }
      const offer = Array.isArray(qJson.offers) ? qJson.offers[0] : undefined;
      const offerId = String(offer?.offer_id ?? offer?.id ?? "").trim();
      if (!offerId) {
        failures.push({
          marketplaceSlug,
          sku: u.sku,
          reason: "Offer nicht gefunden.",
        });
        continue;
      }
      const payload: Record<string, unknown> = {};
      if (u.stockQty != null) payload.quantity = u.stockQty;
      if (u.priceEur != null) payload.price = Number(u.priceEur.toFixed(2));
      if (!Object.keys(payload).length) {
        failures.push({
          marketplaceSlug,
          sku: u.sku,
          reason: "Kein schreibbares Feld (price/quantity) vorhanden.",
        });
        continue;
      }
      const putRes = await fetch(`${base}/api/offers/${encodeURIComponent(offerId)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!putRes.ok) {
        failures.push({
          marketplaceSlug,
          sku: u.sku,
          reason: `Offer update HTTP ${putRes.status}`,
        });
        continue;
      }
      success.push({ marketplaceSlug, sku: u.sku });
    } catch (e) {
      failures.push({
        marketplaceSlug,
        sku: u.sku,
        reason: e instanceof Error ? e.message : "Offer update fehlgeschlagen.",
      });
    }
  }
  return { success, failures };
}

async function syncKaufland(updates: UpdateItem[]): Promise<{ success: Success[]; failures: Failure[] }> {
  const config = await getKauflandIntegrationConfig();
  if (!config.baseUrl || !config.clientKey || !config.secretKey) {
    return {
      success: [],
      failures: updates.map((u) => ({
        marketplaceSlug: "kaufland",
        sku: u.sku,
        reason: "Kaufland-API Konfiguration unvollständig.",
      })),
    };
  }
  const wanted = new Set(updates.map((u) => u.sku.trim().toLowerCase()));
  const skuToUnit = new Map<string, string>();
  const base = config.baseUrl.replace(/\/+$/, "");

  const signedRequest = async (
    method: "GET" | "PUT",
    pathWithQuery: string,
    body: string
  ): Promise<Response> => {
    const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
    const uri = `${base}${path}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signKauflandRequest({
      method,
      uri,
      body,
      timestamp,
      secretKey: config.secretKey,
    });
    return fetch(uri, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Shop-Client-Key": config.clientKey,
        "Shop-Timestamp": String(timestamp),
        "Shop-Signature": signature,
        "User-Agent": config.userAgent,
      },
      body: method === "PUT" ? body : undefined,
    });
  };

  for (let offset = 0; offset < 4000 && skuToUnit.size < wanted.size; offset += 100) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("offset", String(offset));
    params.set("storefront", config.storefront || "de");
    const res = await signedRequest("GET", `/v2/units?${params.toString()}`, "");
    const json = (await res.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>> };
    if (!res.ok) break;
    const data = Array.isArray(json.data) ? json.data : [];
    if (data.length === 0) break;
    for (const row of data) {
      const sku = String(row.sku ?? row.id_sku ?? row.supplier_sku ?? "").trim().toLowerCase();
      const idUnit = String(row.id_unit ?? row.idUnit ?? "").trim();
      if (!sku || !idUnit) continue;
      if (wanted.has(sku) && !skuToUnit.has(sku)) {
        skuToUnit.set(sku, idUnit);
      }
    }
  }

  const success: Success[] = [];
  const failures: Failure[] = [];
  for (const u of updates) {
    const skuKey = u.sku.trim().toLowerCase();
    const unitId = skuToUnit.get(skuKey);
    if (!unitId) {
      failures.push({ marketplaceSlug: "kaufland", sku: u.sku, reason: "Unit für SKU nicht gefunden." });
      continue;
    }
    const body = JSON.stringify({
      ...(u.stockQty != null ? { amount: u.stockQty } : {}),
      ...(u.priceEur != null ? { fixed_price: Math.round(u.priceEur * 100) } : {}),
    });
    const putRes = await signedRequest("PUT", `/v2/units/${encodeURIComponent(unitId)}`, body);
    if (!putRes.ok) {
      failures.push({
        marketplaceSlug: "kaufland",
        sku: u.sku,
        reason: `Unit update HTTP ${putRes.status}`,
      });
      continue;
    }
    success.push({ marketplaceSlug: "kaufland", sku: u.sku });
  }
  return { success, failures };
}

const stockSyncBodySchema = z.object({
  // Max 500 Updates pro Request — schützt vor exzessiven Payloads
  updates: z.array(z.unknown()).max(500),
});

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const parsed = await parseRequestBody(request, stockSyncBodySchema);
  if (!parsed.ok) return parsed.response;
  const { items: updates, unknownSlugFailures } = normalizeUpdates(parsed.data.updates);
  if (updates.length === 0) {
    const failuresOnly = unknownSlugFailures;
    return NextResponse.json({
      ok: failuresOnly.length === 0,
      updatedCount: 0,
      successes: [],
      failures: failuresOnly,
    });
  }

  const bySlug = new Map<MarketplaceSlug, UpdateItem[]>();
  for (const u of updates) {
    const arr = bySlug.get(u.marketplaceSlug) ?? [];
    arr.push(u);
    bySlug.set(u.marketplaceSlug, arr);
  }

  const successes: Success[] = [];
  const failures: Failure[] = [...unknownSlugFailures];
  const handled = new Set<MarketplaceSlug>();

  const pushResult = (res: { success: Success[]; failures: Failure[] }) => {
    successes.push(...res.success);
    failures.push(...res.failures);
  };

  if (bySlug.has("shopify")) {
    pushResult(await syncViaInternalShopifyRoute(request, bySlug.get("shopify")!));
    handled.add("shopify");
  }
  if (bySlug.has("ebay")) {
    pushResult(await syncEbay(bySlug.get("ebay")!));
    handled.add("ebay");
  }
  if (bySlug.has("fressnapf")) {
    const cfg = await getFressnapfIntegrationConfig();
    pushResult(
      await syncMiraklLike("fressnapf", bySlug.get("fressnapf")!, {
        baseUrl: cfg.baseUrl,
        authMode: cfg.authMode,
        apiKey: cfg.apiKey,
      })
    );
    handled.add("fressnapf");
  }
  if (bySlug.has("mediamarkt-saturn")) {
    const cfg = await getFlexIntegrationConfig(FLEX_MARKETPLACE_MMS_SPEC);
    pushResult(
      await syncMiraklLike("mediamarkt-saturn", bySlug.get("mediamarkt-saturn")!, {
        baseUrl: cfg.baseUrl,
        authMode: cfg.authMode as "bearer" | "x-api-key" | "mirakl",
        apiKey: cfg.apiKey,
      })
    );
    handled.add("mediamarkt-saturn");
  }
  if (bySlug.has("zooplus")) {
    const cfg = await getFlexIntegrationConfig(FLEX_MARKETPLACE_ZOOPLUS_SPEC);
    pushResult(
      await syncMiraklLike("zooplus", bySlug.get("zooplus")!, {
        baseUrl: cfg.baseUrl,
        authMode: cfg.authMode as "bearer" | "x-api-key" | "mirakl",
        apiKey: cfg.apiKey,
      })
    );
    handled.add("zooplus");
  }
  if (bySlug.has("kaufland")) {
    pushResult(await syncKaufland(bySlug.get("kaufland")!));
    handled.add("kaufland");
  }

  if (bySlug.has("amazon")) {
    const list = bySlug.get("amazon")!;
    const writable = list.filter((u) => u.stockQty != null || u.priceEur != null);
    if (writable.length > 0) {
      const r = await syncAmazonMfnStockQuantities(
        writable.map((u) => ({
          sku: u.sku,
          ...(u.stockQty != null ? { stockQty: u.stockQty } : {}),
          ...(u.priceEur != null ? { priceEur: u.priceEur } : {}),
        }))
      );
      for (const s of r.success) successes.push({ marketplaceSlug: "amazon", sku: s.sku });
      for (const f of r.failures) failures.push({ marketplaceSlug: "amazon", sku: f.sku, reason: f.reason });
    }
    handled.add("amazon");
  }

  if (bySlug.has("otto")) {
    const list = bySlug.get("otto")!;
    try {
      const cfg = await getOttoIntegrationConfig();
      if (!cfg.clientId || !cfg.clientSecret) {
        for (const u of list) {
          failures.push({ marketplaceSlug: "otto", sku: u.sku, reason: "Otto nicht konfiguriert." });
        }
      } else {
        const token = await getOttoAccessToken({
          baseUrl: cfg.baseUrl,
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          scopes: cfg.scopes,
        });
        const r = await syncOttoStockAndPrice({
          baseUrl: cfg.baseUrl,
          token,
          updates: list.map((u) => ({
            sku: u.sku,
            ...(u.stockQty != null ? { stockQty: u.stockQty } : {}),
            ...(u.priceEur != null ? { priceEur: u.priceEur } : {}),
          })),
        });
        for (const s of r.success) successes.push({ marketplaceSlug: "otto", sku: s.sku });
        for (const f of r.failures) failures.push({ marketplaceSlug: "otto", sku: f.sku, reason: f.reason });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Otto sync fehlgeschlagen.";
      for (const u of list) failures.push({ marketplaceSlug: "otto", sku: u.sku, reason: msg });
    }
    handled.add("otto");
  }

  if (bySlug.has("tiktok")) {
    for (const u of bySlug.get("tiktok")!) {
      failures.push({
        marketplaceSlug: "tiktok",
        sku: u.sku,
        reason: "TikTok: Bestand-/Preis-Write ist in dieser App noch nicht angebunden.",
      });
    }
    handled.add("tiktok");
  }

  for (const [slug, list] of bySlug.entries()) {
    if (handled.has(slug)) continue;
    for (const u of list) {
      failures.push({
        marketplaceSlug: slug,
        sku: u.sku,
        reason: `Marktplatz "${slug}" wird für Bestand-/Preis-Schreibzugriffe nicht unterstützt.`,
      });
    }
  }

  const updatedCount = successes.length;
  return NextResponse.json({
    ok: failures.length === 0,
    updatedCount,
    successes,
    failures,
  });
}
