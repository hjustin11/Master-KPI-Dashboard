import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { getDefaultAmazonMarketplaceId } from "@/shared/config/amazonMarketplaces";
import { readIntegrationCache, writeIntegrationCache } from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";
import { extractListingsItemPriceAndStock } from "@/shared/lib/amazonListingsCommerceExtract";
import { dedupeMarketplaceRowsBySkuAndSecondary } from "@/shared/lib/marketplaceProductClientMerge";

type ListingSummary = {
  asin?: string;
  itemName?: string;
  status?: string[];
  fnSku?: string;
};

type ListingItem = {
  sku?: string;
  summaries?: ListingSummary[];
};

/** Amazon ASIN als secondaryId; price aus Listings-Report/TSV, sonst null. */
export type ProductRow = {
  sku: string;
  secondaryId: string;
  title: string;
  statusLabel: string;
  isActive: boolean;
  price: number | null;
  /** Menge aus Merchant-Listings-Report (Spalten wie quantity / fulfillable), sonst null. */
  stockQty?: number | null;
};

type ReportFallbackState = {
  reportId?: string;
  reportType?: string;
  startedAt?: number;
  rows?: ProductRow[];
  updatedAt?: number;
  lastError?: string;
  switchCount?: number;
};

const fallbackByMarketplace: Record<string, ReportFallbackState> = {};

export type AmazonProductsCachedPayload = {
  sellerId: string;
  rows: ProductRow[];
};

export function parsePaginationParam(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function filterRowsByStatus(rows: ProductRow[], statusFilter: string): ProductRow[] {
  return statusFilter === "inactive"
    ? rows.filter((row) => !row.isActive)
    : statusFilter === "all"
      ? rows
      : rows.filter((row) => row.isActive);
}

export function paginateRows(rows: ProductRow[], offset: number, limit: number): ProductRow[] {
  if (offset >= rows.length) return [];
  return rows.slice(offset, offset + limit);
}

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function hashHex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function percentEncodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function asciiCompare(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalQuery(query: Record<string, string>) {
  const pairs = Object.entries(query).filter(([, v]) => v !== "");
  pairs.sort(([a], [b]) => asciiCompare(a, b));
  return pairs
    .map(([k, v]) => `${percentEncodeRfc3986(k)}=${percentEncodeRfc3986(v)}`)
    .join("&");
}

async function loadSupabaseSecrets(keys: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return {};
  const admin = createAdminClient();
  const { data, error } = await admin.from("integration_secrets").select("key, value").in("key", unique);
  if (error || !data?.length) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    const k = row.key as string;
    const v = row.value;
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function collectMissingAmazonSecretKeys(): string[] {
  const m: string[] = [];
  if (!env("AMAZON_SP_API_REFRESH_TOKEN")) m.push("AMAZON_SP_API_REFRESH_TOKEN");
  if (!env("AMAZON_SP_API_CLIENT_ID")) m.push("AMAZON_SP_API_CLIENT_ID");
  if (!env("AMAZON_SP_API_CLIENT_SECRET")) m.push("AMAZON_SP_API_CLIENT_SECRET");
  if (!env("AMAZON_AWS_ACCESS_KEY_ID")) m.push("AMAZON_AWS_ACCESS_KEY_ID");
  if (!env("AMAZON_AWS_SECRET_ACCESS_KEY")) m.push("AMAZON_AWS_SECRET_ACCESS_KEY");
  if (!env("AMAZON_AWS_SESSION_TOKEN")) m.push("AMAZON_AWS_SESSION_TOKEN");
  if (!env("AMAZON_SP_API_REGION")) m.push("AMAZON_SP_API_REGION");
  if (!env("AMAZON_SP_API_ENDPOINT")) m.push("AMAZON_SP_API_ENDPOINT");
  if (!env("AMAZON_SP_API_MARKETPLACE_IDS") && !env("AMAZON_SP_API_MARKETPLACE_ID")) {
    m.push("AMAZON_SP_API_MARKETPLACE_IDS", "AMAZON_SP_API_MARKETPLACE_ID");
  }
  if (!env("AMAZON_SP_API_SELLER_ID")) m.push("AMAZON_SP_API_SELLER_ID");
  return [...new Set(m)];
}

export async function loadAmazonSpApiProductsConfig() {
  const missingKeys = collectMissingAmazonSecretKeys();
  const secrets = missingKeys.length > 0 ? await loadSupabaseSecrets(missingKeys) : {};
  const s = (key: string) => secrets[key] ?? "";

  const refreshToken = env("AMAZON_SP_API_REFRESH_TOKEN") || s("AMAZON_SP_API_REFRESH_TOKEN");
  const lwaClientId = env("AMAZON_SP_API_CLIENT_ID") || s("AMAZON_SP_API_CLIENT_ID");
  const lwaClientSecret = env("AMAZON_SP_API_CLIENT_SECRET") || s("AMAZON_SP_API_CLIENT_SECRET");
  const awsAccessKeyId = env("AMAZON_AWS_ACCESS_KEY_ID") || s("AMAZON_AWS_ACCESS_KEY_ID");
  const awsSecretAccessKey = env("AMAZON_AWS_SECRET_ACCESS_KEY") || s("AMAZON_AWS_SECRET_ACCESS_KEY");
  const awsSessionToken = env("AMAZON_AWS_SESSION_TOKEN") || s("AMAZON_AWS_SESSION_TOKEN");
  const region = env("AMAZON_SP_API_REGION") || s("AMAZON_SP_API_REGION") || "eu-west-1";
  const endpoint = normalizeHost(
    env("AMAZON_SP_API_ENDPOINT") || s("AMAZON_SP_API_ENDPOINT") || "sellingpartnerapi-eu.amazon.com"
  );
  const marketplaceIdsRaw =
    env("AMAZON_SP_API_MARKETPLACE_IDS") ||
    env("AMAZON_SP_API_MARKETPLACE_ID") ||
    s("AMAZON_SP_API_MARKETPLACE_IDS") ||
    s("AMAZON_SP_API_MARKETPLACE_ID");
  const marketplaceIds = marketplaceIdsRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const sellerId = env("AMAZON_SP_API_SELLER_ID") || s("AMAZON_SP_API_SELLER_ID");

  return {
    refreshToken,
    lwaClientId,
    lwaClientSecret,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    region,
    endpoint,
    marketplaceIds,
    sellerId,
  };
}

export type AmazonSpApiProductsConfig = Awaited<ReturnType<typeof loadAmazonSpApiProductsConfig>>;

/** Prozess-lokal: weniger LWA-Roundtrips bei parallelen Dashboard-Requests. */
let lwaAccessTokenCache: { token: string; expiresAtMs: number } | null = null;

async function obtainAmazonLwaAccessToken(args: {
  refreshToken: string;
  lwaClientId: string;
  lwaClientSecret: string;
}) {
  const now = Date.now();
  if (
    lwaAccessTokenCache &&
    lwaAccessTokenCache.expiresAtMs - 90_000 > now
  ) {
    return lwaAccessTokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.lwaClientId,
    client_secret: args.lwaClientSecret,
  });
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  const parsed = json as { access_token?: string; expires_in?: number } | null;
  const token = parsed?.access_token;
  if (!res.ok || !token) throw new Error(`LWA Token konnte nicht geladen werden (${res.status}).`);
  const expiresInSec =
    typeof parsed?.expires_in === "number" && Number.isFinite(parsed.expires_in) && parsed.expires_in > 60
      ? parsed.expires_in
      : 3600;
  lwaAccessTokenCache = {
    token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return token;
}

/** Expliziter Re-Export für Turbopack / ältere Importzeilen (`import { getLwaAccessToken } …`). */
export { obtainAmazonLwaAccessToken as getLwaAccessToken };

export async function getAmazonProductsLwaToken(config: AmazonSpApiProductsConfig): Promise<string> {
  return obtainAmazonLwaAccessToken({
    refreshToken: config.refreshToken,
    lwaClientId: config.lwaClientId,
    lwaClientSecret: config.lwaClientSecret,
  });
}

async function spApiGet(args: {
  endpoint: string;
  region: string;
  path: string;
  query: Record<string, string>;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
}) {
  const method = "GET";
  const service = "execute-api";
  const host = args.endpoint;
  const canonicalUri = args.path;
  const queryString = canonicalQuery(args.query);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeadersList: Array<[string, string]> = [
    ["host", host],
    ["x-amz-access-token", args.lwaAccessToken],
    ["x-amz-date", amzDate],
  ];
  if (args.awsSessionToken) canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  canonicalHeadersList.sort(([a], [b]) => asciiCompare(a, b));

  const canonicalHeaders = canonicalHeadersList.map(([k, v]) => `${k}:${v.trim()}\n`).join("");
  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(";");
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, hashHex("")].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${args.awsSecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${args.awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const url = new URL(`https://${host}${canonicalUri}`);
  for (const [k, v] of Object.entries(args.query)) {
    if (v !== "") url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    "x-amz-access-token": args.lwaAccessToken,
    Authorization: authorization,
    Accept: "application/json",
  };
  if (args.awsSessionToken) headers["x-amz-security-token"] = args.awsSessionToken;

  const res = await fetch(url.toString(), { method, headers, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

export async function spApiRequest(args: {
  endpoint: string;
  region: string;
  method: "GET" | "POST";
  path: string;
  query: Record<string, string>;
  body?: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
  contentType?: string;
}) {
  const method = args.method;
  const service = "execute-api";
  const host = args.endpoint;
  const canonicalUri = args.path;
  const queryString = canonicalQuery(args.query);
  const body = args.body ?? "";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeadersList: Array<[string, string]> = [
    ["host", host],
    ["x-amz-access-token", args.lwaAccessToken],
    ["x-amz-date", amzDate],
  ];
  if (args.contentType) canonicalHeadersList.push(["content-type", args.contentType]);
  if (args.awsSessionToken) canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  canonicalHeadersList.sort(([a], [b]) => asciiCompare(a, b));

  const payloadHash = hashHex(body);
  const canonicalHeaders = canonicalHeadersList.map(([k, v]) => `${k}:${v.trim()}\n`).join("");
  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(";");
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${args.awsSecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${args.awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const url = new URL(`https://${host}${canonicalUri}`);
  for (const [k, v] of Object.entries(args.query)) {
    if (v !== "") url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    "x-amz-access-token": args.lwaAccessToken,
    Authorization: authorization,
    Accept: "application/json",
  };
  if (args.contentType) headers["content-type"] = args.contentType;
  if (args.awsSessionToken) headers["x-amz-security-token"] = args.awsSessionToken;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function parseListingsTsv(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;

  const skuIdx = idx(["seller-sku", "sku", "item_sku"]);
  const asinIdx = idx(["asin1", "asin"]);
  const titleIdx = idx(["item-name", "item_name", "title", "product-name"]);
  const statusIdx = idx(["status", "item-status"]);
  const priceIdx = idx([
    "price",
    "standard-price",
    "standard price",
    "your-price",
    "your price",
    "list-price",
    "list price",
  ]);
  const qtyIdx = idx([
    "quantity",
    "quantity-available",
    "fulfillable quantity",
    "fulfillable-quantity",
    "fulfillable_quantity",
    "afn-fulfillable-quantity",
    "afn_fulfillable_quantity",
    "afn-warehouse-quantity",
    "afn_warehouse_quantity",
    "mfn-fulfillable-quantity",
    "mfn_fulfillable_quantity",
  ]);

  const rows: ProductRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split("\t");
    const value = (index: number) => (index >= 0 ? (cols[index] ?? "").trim() : "");
    const statusLabel = value(statusIdx) || "Unbekannt";
    const normalized = statusLabel.toLowerCase();
    // Viele Reports liefern keinen verlässlichen Status. Damit aktive Ansicht nicht leer läuft,
    // behandeln wir fehlenden/unklaren Status als aktiv.
    const isActive =
      normalized === "unbekannt" ||
      normalized.includes("active") ||
      normalized.includes("buyable") ||
      normalized.includes("discoverable");
    const sku = value(skuIdx);
    const secondaryId = value(asinIdx);
    const title = value(titleIdx);
    let price: number | null = null;
    const rawPrice = value(priceIdx);
    if (rawPrice) {
      const norm = rawPrice.replace(/\s/g, "").replace(",", ".");
      const n = Number(norm);
      if (Number.isFinite(n) && n >= 0) price = n;
    }
    let stockQty: number | null = null;
    const rawQty = value(qtyIdx);
    if (rawQty) {
      const normQ = rawQty.replace(/\s/g, "").replace(",", ".");
      const nq = Number(normQ);
      if (Number.isFinite(nq) && nq >= 0) stockQty = Math.trunc(nq);
    }
    if (!sku && !secondaryId && !title) continue;
    rows.push({ sku, secondaryId, title, statusLabel, isActive, price, stockQty });
  }
  return rows;
}

async function fetchProductsFromReports(args: {
  endpoint: string;
  region: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
  marketplaceId: string;
}) {
  const state = (fallbackByMarketplace[args.marketplaceId] ??= {});
  const now = Date.now();
  const reportTypes = ["GET_MERCHANT_LISTINGS_ALL_DATA", "GET_MERCHANT_LISTINGS_DATA"] as const;
  const maxPendingMsPerReport = 75 * 1000;

  const createReportForType = async (reportType: (typeof reportTypes)[number]) => {
    const createBody = JSON.stringify({ reportType, marketplaceIds: [args.marketplaceId] });
    const createRes = await spApiRequest({
      endpoint: args.endpoint,
      region: args.region,
      method: "POST",
      path: "/reports/2021-06-30/reports",
      query: {},
      body: createBody,
      contentType: "application/json",
      awsAccessKeyId: args.awsAccessKeyId,
      awsSecretAccessKey: args.awsSecretAccessKey,
      awsSessionToken: args.awsSessionToken,
      lwaAccessToken: args.lwaAccessToken,
    });
    const reportId = (createRes.json as { reportId?: string } | null)?.reportId;
    if (!createRes.res.ok || !reportId) {
      return {
        ok: false as const,
        error: `createReport ${reportType} failed (${createRes.res.status})`,
      };
    }
    state.reportId = reportId;
    state.reportType = reportType;
    state.startedAt = now;
    state.lastError = undefined;
    state.switchCount = (state.switchCount ?? 0) + 1;
    return { ok: true as const };
  };

  if (state.rows?.length && state.updatedAt && now - state.updatedAt < 6 * 60 * 60 * 1000) {
    return { rows: state.rows, source: `reports-cache:${state.reportType ?? "unknown"}` };
  }

  if (!state.reportId || !state.startedAt || now - state.startedAt > 30 * 60 * 1000) {
    let created = false;
    for (const reportType of reportTypes) {
      const createdReport = await createReportForType(reportType);
      if (createdReport.ok) {
        created = true;
        break;
      }
      state.lastError = createdReport.error;
    }
    if (!created) {
      return {
        rows: [],
        source: "reports:none",
        error: state.lastError ?? "createReport failed",
      };
    }
    return { rows: [], source: `reports:${state.reportType}`, pending: true };
  }

  if (state.startedAt && now - state.startedAt > maxPendingMsPerReport) {
    const currentType = state.reportType;
    const nextType =
      currentType === "GET_MERCHANT_LISTINGS_ALL_DATA"
        ? "GET_MERCHANT_LISTINGS_DATA"
        : "GET_MERCHANT_LISTINGS_ALL_DATA";
    const switched = await createReportForType(nextType);
    if (!switched.ok) {
      state.lastError = switched.error;
      return { rows: [], source: `reports:${currentType}`, error: switched.error };
    }
    return { rows: [], source: `reports:${state.reportType}`, pending: true };
  }

  const statusRes = await spApiGet({
    endpoint: args.endpoint,
    region: args.region,
    path: `/reports/2021-06-30/reports/${encodeURIComponent(state.reportId)}`,
    query: {},
    awsAccessKeyId: args.awsAccessKeyId,
    awsSecretAccessKey: args.awsSecretAccessKey,
    awsSessionToken: args.awsSessionToken,
    lwaAccessToken: args.lwaAccessToken,
  });
  if (!statusRes.res.ok || !statusRes.json) {
    state.lastError = `getReport failed (${statusRes.res.status})`;
    return { rows: [], source: `reports:${state.reportType}`, error: state.lastError };
  }

  const payload = statusRes.json as { processingStatus?: string; reportDocumentId?: string };
  if (payload.processingStatus !== "DONE" || !payload.reportDocumentId) {
    if (payload.processingStatus === "CANCELLED" || payload.processingStatus === "FATAL") {
      state.lastError = `report status ${payload.processingStatus}`;
      return { rows: [], source: `reports:${state.reportType}`, error: state.lastError };
    }
    return { rows: [], source: `reports:${state.reportType}`, pending: true };
  }

  const docRes = await spApiGet({
    endpoint: args.endpoint,
    region: args.region,
    path: `/reports/2021-06-30/documents/${encodeURIComponent(payload.reportDocumentId)}`,
    query: {},
    awsAccessKeyId: args.awsAccessKeyId,
    awsSecretAccessKey: args.awsSecretAccessKey,
    awsSessionToken: args.awsSessionToken,
    lwaAccessToken: args.lwaAccessToken,
  });
  if (!docRes.res.ok || !docRes.json) {
    state.lastError = `getDocument failed (${docRes.res.status})`;
    return { rows: [], source: `reports:${state.reportType}`, error: state.lastError };
  }

  const doc = docRes.json as { url?: string; compressionAlgorithm?: string };
  if (!doc.url) {
    state.lastError = "document without url";
    return { rows: [], source: `reports:${state.reportType}`, error: state.lastError };
  }
  const fileRes = await fetch(doc.url, { cache: "no-store" });
  if (!fileRes.ok) {
    state.lastError = `download failed (${fileRes.status})`;
    return { rows: [], source: `reports:${state.reportType}`, error: state.lastError };
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const decoded =
    doc.compressionAlgorithm === "GZIP" ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  const parsed = parseListingsTsv(decoded);
  state.rows = parsed;
  state.updatedAt = now;
  state.reportId = undefined;
  state.startedAt = undefined;
  return { rows: parsed, source: `reports:${state.reportType}` };
}

function isActiveStatus(statuses: string[]) {
  const normalized = statuses.map((s) => s.toUpperCase());
  return normalized.includes("BUYABLE") || normalized.includes("DISCOVERABLE");
}

function normalizedSkuKey(value: string): string {
  return value.trim().toLowerCase();
}

function mergeMissingCommerceFieldsBySku(target: ProductRow[], source: ProductRow[]): ProductRow[] {
  const sourceBySku = new Map<string, { price: number | null; stockQty: number | null }>();
  for (const row of source) {
    const key = normalizedSkuKey(row.sku);
    if (!key) continue;
    const prev = sourceBySku.get(key) ?? { price: null, stockQty: null };
    sourceBySku.set(key, {
      price: prev.price ?? row.price ?? null,
      stockQty: prev.stockQty ?? row.stockQty ?? null,
    });
  }

  return target.map((row) => {
    const key = normalizedSkuKey(row.sku);
    if (!key) return row;
    const fallback = sourceBySku.get(key);
    if (!fallback) return row;
    if (row.price != null && row.stockQty != null) return row;
    return {
      ...row,
      price: row.price ?? fallback.price,
      stockQty: row.stockQty ?? fallback.stockQty,
    };
  });
}

export async function resolveEffectiveAmazonSellerId(
  config: AmazonSpApiProductsConfig,
  lwaAccessToken: string
): Promise<string> {
  let effectiveSellerId = (config.sellerId ?? "").trim();
  if (!effectiveSellerId) {
    const sellerProbe = await spApiGet({
      endpoint: config.endpoint,
      region: config.region,
      path: "/sellers/v1/marketplaceParticipations",
      query: {},
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
      awsSessionToken: config.awsSessionToken,
      lwaAccessToken,
    });
    if (sellerProbe.res.ok && sellerProbe.json) {
      const sellerPayload = sellerProbe.json as {
        payload?: {
          marketplaceParticipations?: Array<{
            marketplace?: { id?: string };
            participation?: { sellerId?: string };
          }>;
        };
      };
      const participations = sellerPayload.payload?.marketplaceParticipations ?? [];
      const match = participations.find((entry) => entry.marketplace?.id === getDefaultAmazonMarketplaceId(config.marketplaceIds));
      const resolved = match?.participation?.sellerId ?? "";
      if (resolved) effectiveSellerId = resolved;
    }
  }
  return effectiveSellerId;
}

export type AmazonProductsCatalogSyncResult =
  | { outcome: "success"; sellerId: string; rows: ProductRow[]; source?: string }
  | { outcome: "pending"; source: string }
  | { outcome: "error"; status: number; body: Record<string, unknown> };

export async function syncAmazonProductsToIntegrationCache(args: {
  config: AmazonSpApiProductsConfig;
  lwaAccessToken: string;
  effectiveSellerId: string;
  marketplaceId: string;
  cacheKey: string;
}): Promise<AmazonProductsCatalogSyncResult> {
  const { config, lwaAccessToken, effectiveSellerId, marketplaceId: _marketplaceId, cacheKey } = args;
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  /** SP-API searchListingsItems: Default pageSize 10, Maximum 20. Ohne korrektes Paging nur erste Seite → nach Dedupe wirkt die Liste „kaputt“. */
  const listingsPageSize = "20";
  let pageTokenForRequest = "";
  let guard = 0;
  const rows: ProductRow[] = [];

  /** Nächste Seite: `pagination.nextToken` muss als Query `pageToken` gesendet werden (nicht `nextToken`). */
  while (guard < 55) {
    const basePath = `/listings/2021-08-01/items/${encodeURIComponent(effectiveSellerId)}`;
    const marketplace = getDefaultAmazonMarketplaceId(config.marketplaceIds);
    const withListingsDefaults = (extra: Record<string, string>): Record<string, string> => ({
      marketplaceIds: marketplace,
      includedData: "summaries,offers,fulfillmentAvailability",
      pageSize: listingsPageSize,
      ...extra,
    });

    const candidates: Array<Record<string, string>> = pageTokenForRequest
      ? [withListingsDefaults({ pageToken: pageTokenForRequest })]
      : [
          withListingsDefaults({}),
          withListingsDefaults({ issueLocale: "en_US" }),
          { marketplaceIds: marketplace },
        ];

    let result:
      | {
          res: Response;
          text: string;
          json: unknown;
          query: Record<string, string>;
        }
      | null = null;
    const attempts: Array<{ status: number; query: Record<string, string>; preview: string }> = [];

    for (const query of candidates) {
      const probe = await spApiGet({
        endpoint: config.endpoint,
        region: config.region,
        path: basePath,
        query,
        awsAccessKeyId: config.awsAccessKeyId,
        awsSecretAccessKey: config.awsSecretAccessKey,
        awsSessionToken: config.awsSessionToken,
        lwaAccessToken,
      });
      if (probe.res.ok && probe.json) {
        result = { ...probe, query };
        break;
      }
      attempts.push({
        status: probe.res.status,
        query,
        preview: (probe.text ?? "").slice(0, 180),
      });
      if (probe.res.status !== 400) {
        result = { ...probe, query };
        break;
      }
    }

    if (!result || !result.res.ok || !result.json) {
      const fallback = await fetchProductsFromReports({
        endpoint: config.endpoint,
        region: config.region,
        awsAccessKeyId: config.awsAccessKeyId,
        awsSecretAccessKey: config.awsSecretAccessKey,
        awsSessionToken: config.awsSessionToken,
        lwaAccessToken,
        marketplaceId: getDefaultAmazonMarketplaceId(config.marketplaceIds),
      });
      if (fallback.pending) {
        return { outcome: "pending", source: fallback.source };
      }
      if (fallback.rows.length) {
        const dedupedFallback = dedupeMarketplaceRowsBySkuAndSecondary(fallback.rows);
        await writeIntegrationCache({
          cacheKey,
          source: "amazon:products",
          value: {
            sellerId: effectiveSellerId,
            rows: dedupedFallback,
          } satisfies AmazonProductsCachedPayload,
          freshMs,
          staleMs,
        });
        return {
          outcome: "success",
          sellerId: effectiveSellerId,
          rows: dedupedFallback,
          source: fallback.source,
        };
      }

      const status = result?.res.status ?? 500;
      const isLikelyPermissionsIssue = status === 401 || status === 403 || status === 500;
      return {
        outcome: "error",
        status: 502,
        body: {
          error: isLikelyPermissionsIssue
            ? "Amazon Produkte konnten nicht geladen werden. Wahrscheinlich fehlen Listings-Rechte (SP-API Role) oder die App muss nach Rollenänderung neu autorisiert werden."
            : "Amazon Produkte konnten nicht geladen werden.",
          hint: isLikelyPermissionsIssue
            ? "Prüfe in Seller Central/Developer Console die Listings Items Berechtigung und autorisiere die App erneut. Orders können funktionieren, obwohl Listings blockiert sind."
            : undefined,
          status,
          triedWithPageToken: Boolean(pageTokenForRequest),
          preview: (result?.text ?? "").slice(0, 320),
          attempts,
          sellerId: effectiveSellerId,
          marketplaceId: getDefaultAmazonMarketplaceId(config.marketplaceIds),
          fallbackError: fallback.error,
        },
      };
    }

    const payload = result.json as {
      items?: ListingItem[];
      pagination?: { nextToken?: string };
    };
    const items = payload.items ?? [];
    for (const item of items) {
      const summary = item.summaries?.[0];
      const statuses = Array.isArray(summary?.status) ? summary.status : [];
      const active = statuses.length > 0 ? isActiveStatus(statuses) : true;
      const commerce = extractListingsItemPriceAndStock(item, { marketplaceId: marketplace });
      rows.push({
        sku: item.sku ?? "",
        secondaryId: summary?.asin ?? "",
        title: summary?.itemName ?? "",
        statusLabel: statuses.length ? statuses.join(", ") : "Unbekannt",
        isActive: active,
        price: commerce.price,
        stockQty: commerce.stockQty,
      });
    }

    const nextPage = payload.pagination?.nextToken ?? "";
    if (!nextPage) break;
    pageTokenForRequest = nextPage;
    guard += 1;
  }

  let dedupedRows = dedupeMarketplaceRowsBySkuAndSecondary(rows);
  let source: string | undefined;
  const hasMissingCommerce = dedupedRows.some((row) => row.price == null || row.stockQty == null);
  if (hasMissingCommerce) {
    const cached = await readIntegrationCache<AmazonProductsCachedPayload>(cacheKey);
    if (cached.state !== "miss" && Array.isArray(cached.value?.rows)) {
      dedupedRows = mergeMissingCommerceFieldsBySku(dedupedRows, cached.value.rows);
    }
  }
  const stillMissingCommerce = dedupedRows.some((row) => row.price == null || row.stockQty == null);
  if (stillMissingCommerce) {
    const reportFallback = await fetchProductsFromReports({
      endpoint: config.endpoint,
      region: config.region,
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
      awsSessionToken: config.awsSessionToken,
      lwaAccessToken,
      marketplaceId: getDefaultAmazonMarketplaceId(config.marketplaceIds),
    });
    if (reportFallback.rows.length > 0) {
      dedupedRows = mergeMissingCommerceFieldsBySku(dedupedRows, reportFallback.rows);
      source = `listings+${reportFallback.source}`;
    }
  }

  await writeIntegrationCache({
    cacheKey,
    source: "amazon:products",
    value: {
      sellerId: effectiveSellerId,
      rows: dedupedRows,
    } satisfies AmazonProductsCachedPayload,
    freshMs,
    staleMs,
  });

  return {
    outcome: "success",
    sellerId: effectiveSellerId,
    rows: dedupedRows,
    ...(source ? { source } : {}),
  };
}

export async function primeAmazonProductsIntegrationCache(): Promise<{
  ok: boolean;
  skipped?: string;
  pending?: boolean;
  source?: string;
  error?: string;
  rowCount?: number;
  sellerId?: string;
}> {
  try {
    const config = await loadAmazonSpApiProductsConfig();
    const missing = {
      AMAZON_SP_API_REFRESH_TOKEN: !config.refreshToken,
      AMAZON_SP_API_CLIENT_ID: !config.lwaClientId,
      AMAZON_SP_API_CLIENT_SECRET: !config.lwaClientSecret,
      AMAZON_AWS_ACCESS_KEY_ID: !config.awsAccessKeyId,
      AMAZON_AWS_SECRET_ACCESS_KEY: !config.awsSecretAccessKey,
      AMAZON_SP_API_MARKETPLACE_ID: config.marketplaceIds.length === 0,
      AMAZON_SP_API_SELLER_ID: false,
    };
    if (Object.values(missing).some(Boolean)) {
      return { ok: false, skipped: "missing_amazon_sp_api_config" };
    }

    const marketplaceId = getDefaultAmazonMarketplaceId(config.marketplaceIds);
    const cacheKey = `amazon:products:${marketplaceId}`;
    const lwaAccessToken = await obtainAmazonLwaAccessToken({
      refreshToken: config.refreshToken,
      lwaClientId: config.lwaClientId,
      lwaClientSecret: config.lwaClientSecret,
    });
    const effectiveSellerId = await resolveEffectiveAmazonSellerId(config, lwaAccessToken);
    if (!effectiveSellerId) {
      return { ok: false, error: "seller_id_unresolved" };
    }

    const syncResult = await syncAmazonProductsToIntegrationCache({
      config,
      lwaAccessToken,
      effectiveSellerId,
      marketplaceId,
      cacheKey,
    });

    if (syncResult.outcome === "pending") {
      return { ok: true, pending: true, source: syncResult.source };
    }
    if (syncResult.outcome === "error") {
      const err =
        typeof syncResult.body.error === "string" ? syncResult.body.error : "amazon_products_sync_failed";
      return { ok: false, error: err };
    }
    return {
      ok: true,
      rowCount: syncResult.rows.length,
      sellerId: syncResult.sellerId,
      ...(syncResult.source ? { source: syncResult.source } : {}),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
