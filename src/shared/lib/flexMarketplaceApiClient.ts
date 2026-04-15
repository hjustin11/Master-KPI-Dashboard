import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { getIntegrationSecretValue, readIntegrationSecretsBatch } from "@/shared/lib/integrationSecrets";
import {
  readIntegrationCache,
  readIntegrationCacheForDashboard,
  writeIntegrationCache,
  type IntegrationDashboardCacheRead,
} from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";
import { parseYmdParam, ymdToUtcRangeExclusiveEnd } from "@/shared/lib/orderDateParams";
import { classifyOrderStatus } from "@/shared/lib/marketplace-profitability";

export { parseYmdParam, ymdToUtcRangeExclusiveEnd };

export const FLEX_DAY_MS = 24 * 60 * 60 * 1000;

async function readEnv(prefix: string, suffix: string): Promise<string> {
  return getIntegrationSecretValue(`${prefix}_${suffix}`);
}

export function resolveFlexBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed.replace(/\/+$/, "")
    : `https://${trimmed.replace(/\/+$/, "")}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname || u.hostname.length < 1) return "";
    if (!u.host) return "";
    return candidate;
  } catch {
    return "";
  }
}

/** Shopify Admin REST: nur `https://{shop}.myshopify.com` — Pfade würden zu doppelten `/admin/api/...` führen. */
function shopifyAdminApiOriginOnly(resolvedBaseUrl: string): string {
  const trimmed = resolvedBaseUrl.replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`;
  } catch {
    return trimmed;
  }
}

export type FlexAuthKind = "single_key" | "client_secret";

/** `mirakl` = Authorization nur API-Key; `basic` = Basic client:secret (TikTok u. Ä.). */
/** `shopify` = `X-Shopify-Access-Token` (Admin API). */
export type FlexAuthMode = "bearer" | "x-api-key" | "mirakl" | "basic" | "shopify";

export type FlexMarketplaceSpec = {
  id: string;
  marketplaceLabel: string;
  envPrefix: string;
  authKind: FlexAuthKind;
  defaultOrdersPath: string;
  defaultAuthMode: string;
  baseUrlHintKey: string;
};

export const FLEX_MARKETPLACE_MMS_SPEC: FlexMarketplaceSpec = {
  id: "mms",
  marketplaceLabel: "MediaMarkt & Saturn",
  envPrefix: "MMS",
  authKind: "single_key",
  defaultOrdersPath: "/api/orders",
  defaultAuthMode: "mirakl",
  baseUrlHintKey: "MMS_API_BASE_URL",
};

export const FLEX_MARKETPLACE_ZOOPLUS_SPEC: FlexMarketplaceSpec = {
  id: "zooplus",
  marketplaceLabel: "ZooPlus",
  envPrefix: "ZOOPLUS",
  authKind: "single_key",
  defaultOrdersPath: "/api/orders",
  defaultAuthMode: "mirakl",
  baseUrlHintKey: "ZOOPLUS_API_BASE_URL",
};

export const FLEX_MARKETPLACE_TIKTOK_SPEC: FlexMarketplaceSpec = {
  id: "tiktok",
  marketplaceLabel: "TikTok Shop",
  envPrefix: "TIKTOK",
  authKind: "client_secret",
  defaultOrdersPath: "/orders",
  defaultAuthMode: "basic",
  baseUrlHintKey: "TIKTOK_API_BASE_URL",
};

/** Shopify Admin API: Basis = Shop-URL (`https://ihr-shop.myshopify.com`), Token = Admin API access token. */
export const FLEX_MARKETPLACE_SHOPIFY_SPEC: FlexMarketplaceSpec = {
  id: "shopify",
  marketplaceLabel: "Shopify",
  envPrefix: "SHOPIFY",
  authKind: "single_key",
  defaultOrdersPath: "/admin/api/2024-10/orders.json",
  defaultAuthMode: "shopify",
  baseUrlHintKey: "SHOPIFY_API_BASE_URL",
};

/**
 * eBay (Basis-Integration): Client/Secret-Schema wie angefordert.
 * Die konkrete API-Variante kann über ENV gesteuert werden:
 * - EBAY_API_BASE_URL
 * - EBAY_AUTH_MODE (basic|bearer|x-api-key)
 * - EBAY_ORDERS_PATH
 */
export const FLEX_MARKETPLACE_EBAY_SPEC: FlexMarketplaceSpec = {
  id: "ebay",
  marketplaceLabel: "eBay",
  envPrefix: "EBAY",
  authKind: "client_secret",
  defaultOrdersPath: "/sell/fulfillment/v1/order",
  defaultAuthMode: "bearer",
  baseUrlHintKey: "EBAY_API_BASE_URL",
};

type EbayTokenCacheEntry = {
  token: string;
  expiresAtMs: number;
};
const ebayTokenCache = new Map<string, EbayTokenCacheEntry>();

export type FlexIntegrationConfig = {
  spec: FlexMarketplaceSpec;
  marketplaceLabel: string;
  envPrefix: string;
  authKind: FlexAuthKind;
  baseUrl: string;
  apiKey: string;
  clientKey: string;
  secretKey: string;
  authMode: FlexAuthMode;
  ordersPath: string;
  amountScale: number;
  pageSizeParam: "max" | "limit";
  paginationDelayMs: number;
  max429Retries: number;
  useOrderDateFilter: boolean;
};

export async function getFlexIntegrationConfig(spec: FlexMarketplaceSpec): Promise<FlexIntegrationConfig> {
  const p = spec.envPrefix;

  // Batch: Alle 12 Secrets in 1 DB-Query statt 12 einzelne SELECTs.
  const suffixes = [
    "API_BASE_URL", "ACCESS_TOKEN", "API_KEY", "CLIENT_KEY", "SECRET_KEY",
    "ORDERS_PATH", "AUTH_MODE", "AMOUNT_SCALE", "PAGE_SIZE_PARAM",
    "PAGINATION_DELAY_MS", "MAX_429_RETRIES", "USE_ORDER_DATE_FILTER",
  ] as const;
  const secrets = await readIntegrationSecretsBatch(suffixes.map((s) => `${p}_${s}`));
  const get = (suffix: string) => (secrets.get(`${p}_${suffix}`) ?? "").trim();

  let baseUrl = resolveFlexBaseUrl(get("API_BASE_URL"));
  if (spec.id === "shopify" && baseUrl) {
    baseUrl = shopifyAdminApiOriginOnly(baseUrl);
  }
  const accessToken = get("ACCESS_TOKEN");
  const apiKeyRaw = get("API_KEY");
  const clientKeyRaw = get("CLIENT_KEY");
  const secretKeyRaw = get("SECRET_KEY");

  // Für single_key-Marktplätze akzeptieren wir zusätzlich CLIENT_KEY als Alias
  // (z. B. wenn Integrationen ein client/secret-Schema liefern, aber faktisch nur 1 Token nutzen).
  const apiKey =
    spec.authKind === "single_key"
      ? (apiKeyRaw || accessToken || clientKeyRaw || "")
      : accessToken;
  const clientKey = spec.authKind === "client_secret" ? clientKeyRaw : "";
  const secretKey = spec.authKind === "client_secret" ? secretKeyRaw : "";

  const ordersPathRaw = get("ORDERS_PATH") || spec.defaultOrdersPath || "/orders";
  const ordersPath = ordersPathRaw.startsWith("/") ? ordersPathRaw : `/${ordersPathRaw}`;

  const authRaw = (get("AUTH_MODE") || spec.defaultAuthMode).toLowerCase();
  let authMode: FlexAuthMode = "bearer";
  if (authRaw === "x-api-key") authMode = "x-api-key";
  else if (authRaw === "mirakl" || authRaw === "authorization") authMode = "mirakl";
  else if (authRaw === "basic") authMode = "basic";
  else if (authRaw === "shopify") authMode = "shopify";
  else authMode = "bearer";
  // Admin REST erwartet X-Shopify-Access-Token — Bearer führt zu HTTP 401.
  if (spec.id === "shopify") {
    authMode = "shopify";
  }

  const amountScale = Math.max(1, Number(get("AMOUNT_SCALE")) || 1);

  const pageSizeRaw = get("PAGE_SIZE_PARAM").toLowerCase();
  const pageSizeParam: "max" | "limit" =
    pageSizeRaw === "limit"
      ? "limit"
      : pageSizeRaw === "max"
        ? "max"
        : ordersPath.includes("/api/orders")
          ? "max"
          : "limit";

  const paginationDelayMs = Math.max(0, Number(get("PAGINATION_DELAY_MS")) || 450);
  const max429Retries = Math.min(30, Math.max(1, Number(get("MAX_429_RETRIES")) || 8));

  const dateFilterRaw = get("USE_ORDER_DATE_FILTER").toLowerCase();
  const useOrderDateFilter =
    dateFilterRaw === "false" || dateFilterRaw === "0" || dateFilterRaw === "no"
      ? false
      : dateFilterRaw === "true" || dateFilterRaw === "1" || dateFilterRaw === "yes"
        ? true
        : ordersPath.includes("/api/orders") || spec.id === "shopify";

  return {
    spec,
    marketplaceLabel: spec.marketplaceLabel,
    envPrefix: p,
    authKind: spec.authKind,
    baseUrl,
    apiKey,
    clientKey,
    secretKey,
    authMode,
    ordersPath,
    amountScale,
    pageSizeParam,
    paginationDelayMs,
    max429Retries,
    useOrderDateFilter,
  };
}

function flexAuthHeaders(config: FlexIntegrationConfig): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "MasterDashboard/1.0",
  };
  if (config.authKind === "client_secret" && config.clientKey && config.secretKey) {
    if (config.authMode === "basic") {
      h.Authorization = `Basic ${Buffer.from(`${config.clientKey}:${config.secretKey}`, "utf8").toString("base64")}`;
      return h;
    }
    if (config.authMode === "bearer" && config.apiKey) {
      h.Authorization = `Bearer ${config.apiKey}`;
      return h;
    }
    h["X-Client-Key"] = config.clientKey;
    h["X-Secret-Key"] = config.secretKey;
    return h;
  }
  if (config.authMode === "x-api-key") {
    h["X-API-Key"] = config.apiKey;
  } else if (config.authMode === "mirakl") {
    h.Authorization = config.apiKey;
  } else if (config.authMode === "shopify") {
    h["X-Shopify-Access-Token"] = config.apiKey;
  } else {
    h.Authorization = `Bearer ${config.apiKey}`;
  }
  return h;
}

async function resolveEbayBearerToken(config: FlexIntegrationConfig): Promise<string> {
  const cacheKey = `${config.baseUrl}::${config.clientKey}`;
  const cached = ebayTokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAtMs - 20_000 > now) {
    return cached.token;
  }

  const tokenUrl = `${config.baseUrl.replace(/\/+$/, "")}/identity/v1/oauth2/token`;
  const basic = Buffer.from(`${config.clientKey}:${config.secretKey}`, "utf8").toString("base64");
  const scopeRaw = ((await readEnv("EBAY", "OAUTH_SCOPE")) || "").trim();
  const scope = scopeRaw || "https://api.ebay.com/oauth/api_scope";

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope,
  });

  let res: Response;
  let text = "";
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
        "User-Agent": "MasterDashboard/1.0",
      },
      body: body.toString(),
      cache: "no-store",
    });
    text = await res.text();
  } catch (err) {
    throw new Error(formatFetchError(err, "EBAY_API_BASE_URL"));
  }

  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || typeof json !== "object") {
    const preview = text.replace(/\s+/g, " ").slice(0, 260);
    throw new Error(`eBay OAuth fehlgeschlagen (HTTP ${res.status}). ${preview}`);
  }

  const token = String((json as Record<string, unknown>).access_token ?? "").trim();
  const expiresIn = Number((json as Record<string, unknown>).expires_in ?? 7200);
  if (!token) {
    throw new Error("eBay OAuth lieferte kein access_token.");
  }

  ebayTokenCache.set(cacheKey, {
    token,
    expiresAtMs: now + Math.max(60_000, (Number.isFinite(expiresIn) ? expiresIn : 7200) * 1000),
  });
  return token;
}

function formatFetchError(err: unknown, baseUrlHintKey: string): string {
  if (!(err instanceof Error)) return "Netzwerkfehler (unbekannt).";
  const parts: string[] = [];
  const walk = (e: unknown) => {
    if (e instanceof Error) {
      if (e.message) parts.push(e.message);
      walk((e as Error & { cause?: unknown }).cause);
    } else if (e && typeof e === "object" && "code" in e) {
      parts.push(String((e as { code?: string }).code));
    }
  };
  walk(err);
  const uniq = [...new Set(parts.filter(Boolean))];
  const detail = uniq.join(" · ");
  if (/fetch failed/i.test(err.message) || uniq.some((p) => /fetch failed/i.test(p))) {
    return [
      "Netzwerk-/TLS-Fehler (fetch).",
      detail ? `Technisch: ${detail}.` : "",
      `Prüfen: ${baseUrlHintKey} (HTTPS-Origin), DNS/Firewall vom Server aus.`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return detail || err.message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeHtmlResponse(text: string): boolean {
  const head = text.trimStart().slice(0, 800);
  return /^<!DOCTYPE\s+html/i.test(head) || /<html[\s>]/i.test(head);
}

/** Kurzhinweis wenn der Server HTML statt JSON liefert (falsche URL/Pfad oder Web-UI). */
function nonJsonBodyHint(text: string, envPrefix: string): string {
  if (!looksLikeHtmlResponse(text)) return "";
  return [
    " Antwort ist HTML, kein JSON — die konfigurierte URL liefert keine Orders-API.",
    ` Prüfen: ${envPrefix}_API_BASE_URL (nur HTTPS-API-Host, keine Seller-Web-UI) und ${envPrefix}_ORDERS_PATH.`,
    " TikTok Shop Open API (Partner Center) nutzt andere Endpoints, signierte Requests und meist POST — nicht GET /orders mit Basic-Auth;",
    " ohne eigenes Backend/Proxy passt diese Integration nicht „out of the box“.",
  ].join("");
}

function retryAfterToMs(header: string | null): number | null {
  if (!header) return null;
  const sec = parseInt(header.trim(), 10);
  if (!Number.isNaN(sec) && sec >= 0) {
    return Math.min(120_000, Math.max(500, sec * 1000));
  }
  const t = Date.parse(header);
  if (!Number.isNaN(t)) {
    return Math.min(120_000, Math.max(500, t - Date.now()));
  }
  return null;
}

export type FetchFlexOrdersOptions = {
  /** Kalenderfenster — gleiche Keys wie Dashboard-Zeitraum (Cron/Warm). */
  fromYmd?: string;
  toYmd?: string;
  createdFromMs?: number;
  createdToMsExclusive?: number;
  maxPages?: number;
};

export function normalizeFlexOrdersOptions(options: FetchFlexOrdersOptions): FetchFlexOrdersOptions {
  if (options.fromYmd && options.toYmd) {
    const { startMs, endMs } = ymdToUtcRangeExclusiveEnd(options.fromYmd, options.toYmd);
    return {
      ...options,
      createdFromMs: startMs,
      createdToMsExclusive: endMs,
    };
  }
  return { ...options };
}

function hashCacheInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex").slice(0, 24);
}

function flexOrdersCacheKey(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions,
  variant: "raw" | "normalized"
): string {
  const rangeKey =
    options.fromYmd && options.toYmd
      ? { fromYmd: options.fromYmd, toYmd: options.toYmd }
      : {
          createdFromMs: options.createdFromMs ?? null,
          createdToMsExclusive: options.createdToMsExclusive ?? null,
        };
  return [
    "flex-orders",
    variant,
    config.spec.id,
    hashCacheInput({
      range: rangeKey,
      maxPages: options.maxPages ?? null,
      ordersPath: config.ordersPath,
      pageSizeParam: config.pageSizeParam,
      amountScale: config.amountScale,
      authMode: config.authMode,
    }),
  ].join(":");
}

/** Nur Supabase — für Marktplatz-Orders-APIs (kein Live-Fetch). */
export async function readFlexOrdersNormalizedFromDashboard(
  config: FlexIntegrationConfig,
  fromYmd: string,
  toYmd: string
): Promise<IntegrationDashboardCacheRead<FlexNormalizedOrder[]>> {
  const key = flexOrdersCacheKey(config, { fromYmd, toYmd }, "normalized");
  return readIntegrationCacheForDashboard<FlexNormalizedOrder[]>(key);
}

export async function flexGet(
  config: FlexIntegrationConfig,
  pathAndQuery: string
): Promise<Response> {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;
  try {
    const headers = flexAuthHeaders(config);
    if (
      config.spec.id === "ebay" &&
      config.authMode === "bearer" &&
      !config.apiKey &&
      config.clientKey &&
      config.secretKey
    ) {
      delete headers["X-Client-Key"];
      delete headers["X-Secret-Key"];
      headers.Authorization = `Bearer ${await resolveEbayBearerToken(config)}`;
    }
    return await fetch(url, { method: "GET", headers, cache: "no-store" });
  } catch (err) {
    throw new Error(formatFetchError(err, `${config.envPrefix}_API_BASE_URL`));
  }
}

/** GET mit Retry bei HTTP 429 (Shopify u. a.). Response-Body ist bereits als `text` gelesen. */
export async function flexGetWith429Retry(
  config: FlexIntegrationConfig,
  pathAndQuery: string
): Promise<{ res: Response; text: string }> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await flexGet(config, pathAndQuery);
    const text = await res.text();
    if (res.status !== 429) {
      return { res, text };
    }
    if (attempt >= config.max429Retries) {
      return { res, text };
    }
    const fromHeader = retryAfterToMs(res.headers.get("Retry-After"));
    const backoff = Math.min(60_000, 1500 * 2 ** attempt);
    await sleep(fromHeader ?? backoff);
  }
}

function buildOrdersListQuery(
  config: FlexIntegrationConfig,
  limit: number,
  offset: number,
  dateFilter?: { fromMs: number; toMsExclusive: number }
): string {
  const sizeName = config.pageSizeParam === "max" ? "max" : "limit";
  const params = new URLSearchParams();
  params.set(sizeName, String(limit));
  params.set("offset", String(offset));
  if (
    config.useOrderDateFilter &&
    dateFilter &&
    Number.isFinite(dateFilter.fromMs) &&
    Number.isFinite(dateFilter.toMsExclusive) &&
    dateFilter.toMsExclusive > dateFilter.fromMs
  ) {
    params.set("start_date", new Date(dateFilter.fromMs).toISOString());
    params.set("end_date", new Date(dateFilter.toMsExclusive - 1).toISOString());
  }
  return `${config.ordersPath}?${params.toString()}`;
}

export function extractOrdersArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.orders)) return o.orders;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.results)) return o.results;
  }
  return [];
}

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type FlexNormalizedOrder = {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  units: number;
  status: string;
};

export function normalizeFlexOrder(raw: unknown, amountScale: number): FlexNormalizedOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(
    o.id ??
      o.commercial_id ??
      o.number ??
      o.order_id ??
      o.orderId ??
      o.external_id ??
      ""
  ).trim();
  if (!id) return null;
  const created = String(
    o.created_at ??
      o.created_date ??
      o.createdAt ??
      o.order_date ??
      o.orderDate ??
      o.date ??
      o.placed_at ??
      ""
  );
  const currency = String(
    o.currency ?? o.currency_iso_code ?? o.currency_code ?? o.currencyCode ?? "EUR"
  );

  let amount = 0;
  const total = o.total ?? o.total_price ?? o.grand_total ?? o.amount ?? o.order_total;
  if (typeof total === "number") amount = total;
  else if (typeof total === "string") amount = toNumber(total);
  else if (total && typeof total === "object") {
    const t = total as Record<string, unknown>;
    amount = toNumber(t.amount ?? t.value);
  }
  amount = amountScale > 1 ? amount / amountScale : amount;

  const lines = o.line_items ?? o.lineItems ?? o.order_lines ?? o.items ?? o.positions;
  let units = 1;
  if (Array.isArray(lines) && lines.length > 0) {
    units = lines.reduce((sum, line) => {
      if (!line || typeof line !== "object") return sum + 1;
      const q = (line as Record<string, unknown>).quantity ?? (line as Record<string, unknown>).qty;
      const n = toNumber(q);
      return sum + (n > 0 ? n : 1);
    }, 0);
  }

  const statusParts = [
    o.status,
    o.financial_status,
    o.state,
    o.order_state,
    o.order_status,
    o.fulfillment_status,
    o.payment_status,
    o.cancel_reason,
    o.cancellation_reason,
    o.cancelled_at ? "cancelled" : "",
    o.refunded_at ? "refunded" : "",
    o.returned_at ? "returned" : "",
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  const status = statusParts.join(" ");

  return {
    id,
    createdAt: created || new Date(0).toISOString(),
    amount: Number(amount.toFixed(2)),
    currency,
    units,
    status,
  };
}

function parseShopifyNextRelativePath(linkHeader: string | null, baseUrlRaw: string): string | null {
  if (!linkHeader?.trim()) return null;
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrlRaw.replace(/\/+$/, "")).origin;
  } catch {
    return null;
  }
  for (const segment of linkHeader.split(",")) {
    const m = segment.trim().match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (!m?.[1]) continue;
    try {
      const u = new URL(m[1].trim());
      if (u.origin !== baseOrigin) continue;
      return u.pathname + u.search;
    } catch {
      continue;
    }
  }
  return null;
}

function buildShopifyOrdersPath(
  config: FlexIntegrationConfig,
  pageLimit: number,
  dateFilter?: { fromMs: number; toMsExclusive: number }
): string {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(250, Math.max(1, pageLimit))));
  params.set("status", "any");
  if (
    config.useOrderDateFilter &&
    dateFilter &&
    Number.isFinite(dateFilter.fromMs) &&
    Number.isFinite(dateFilter.toMsExclusive) &&
    dateFilter.toMsExclusive > dateFilter.fromMs
  ) {
    params.set("created_at_min", new Date(dateFilter.fromMs).toISOString());
    params.set("created_at_max", new Date(dateFilter.toMsExclusive - 1).toISOString());
  }
  const path = config.ordersPath;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${params.toString()}`;
}

async function fetchShopifyOrdersPaginatedImpl(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<FlexNormalizedOrder[]> {
  const maxPages = options.maxPages ?? 40;
  const pageLimit = 100;
  const dateFilter =
    options.createdFromMs != null && options.createdToMsExclusive != null
      ? { fromMs: options.createdFromMs, toMsExclusive: options.createdToMsExclusive }
      : undefined;

  const out: FlexNormalizedOrder[] = [];
  const label = config.marketplaceLabel;
  let nextPath: string | null = buildShopifyOrdersPath(config, pageLimit, dateFilter);

  for (let page = 0; page < maxPages && nextPath; page += 1) {
    if (page > 0 && config.paginationDelayMs > 0) {
      await sleep(config.paginationDelayMs);
    }
    const path = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
    const { res, text } = await flexGetWith429Retry(config, path);
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json == null) {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 400);
      const htmlHint = json == null ? nonJsonBodyHint(text, config.envPrefix) : "";
      if (page === 0) {
        const rateHint =
          res.status === 429
            ? ` Zu viele Anfragen (Rate Limit). Optional ${config.envPrefix}_PAGINATION_DELAY_MS erhöhen.`
            : "";
        throw new Error(
          `${label}: orders request failed (HTTP ${res.status}).${rateHint}${htmlHint || (snippet ? ` ${snippet}` : "")}`
        );
      }
      break;
    }
    const chunk = extractOrdersArray(json);
    for (const raw of chunk) {
      const n = normalizeFlexOrder(raw, config.amountScale);
      if (n) out.push(n);
    }
    if (chunk.length === 0) break;
    nextPath = parseShopifyNextRelativePath(res.headers.get("Link"), config.baseUrl);
    if (!nextPath) break;
  }

  return out;
}

async function fetchShopifyOrdersRawPaginatedImpl(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<unknown[]> {
  const maxPages = options.maxPages ?? 40;
  const pageLimit = 100;
  const dateFilter =
    options.createdFromMs != null && options.createdToMsExclusive != null
      ? { fromMs: options.createdFromMs, toMsExclusive: options.createdToMsExclusive }
      : undefined;

  const out: unknown[] = [];
  const label = config.marketplaceLabel;
  let nextPath: string | null = buildShopifyOrdersPath(config, pageLimit, dateFilter);

  for (let page = 0; page < maxPages && nextPath; page += 1) {
    if (page > 0 && config.paginationDelayMs > 0) {
      await sleep(config.paginationDelayMs);
    }
    const path = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
    const { res, text } = await flexGetWith429Retry(config, path);
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json == null) {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 400);
      const htmlHint = json == null ? nonJsonBodyHint(text, config.envPrefix) : "";
      if (page === 0) {
        const rateHint =
          res.status === 429
            ? ` Zu viele Anfragen (Rate Limit). Optional ${config.envPrefix}_PAGINATION_DELAY_MS erhöhen.`
            : "";
        throw new Error(
          `${label}: orders request failed (HTTP ${res.status}).${rateHint}${htmlHint || (snippet ? ` ${snippet}` : "")}`
        );
      }
      break;
    }
    const chunk = extractOrdersArray(json);
    for (const raw of chunk) {
      out.push(raw);
    }
    if (chunk.length === 0) break;
    nextPath = parseShopifyNextRelativePath(res.headers.get("Link"), config.baseUrl);
    if (!nextPath) break;
  }

  return out;
}

/** Rohe Order-JSONs für Artikel-/Positions-Auswertung (Analytics-Dialog). */
async function fetchFlexOrdersRawPaginatedLive(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<unknown[]> {
  const opts = normalizeFlexOrdersOptions(options);
  if (config.spec.id === "shopify") {
    return fetchShopifyOrdersRawPaginatedImpl(config, opts);
  }
  const maxPages = opts.maxPages ?? 40;
  const limit = 100;
  const dateFilter =
    opts.createdFromMs != null && opts.createdToMsExclusive != null
      ? { fromMs: opts.createdFromMs, toMsExclusive: opts.createdToMsExclusive }
      : undefined;

  const out: unknown[] = [];
  const label = config.marketplaceLabel;

  for (let page = 0; page < maxPages; page += 1) {
    if (page > 0 && config.paginationDelayMs > 0) {
      await sleep(config.paginationDelayMs);
    }
    const path = buildOrdersListQuery(config, limit, page * limit, dateFilter);
    const { res, text } = await flexGetWith429Retry(config, path);
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json == null) {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 400);
      const htmlHint = json == null ? nonJsonBodyHint(text, config.envPrefix) : "";
      if (page === 0) {
        const rateHint =
          res.status === 429
            ? ` Zu viele Anfragen (Rate Limit). Optional ${config.envPrefix}_PAGINATION_DELAY_MS erhöhen.`
            : "";
        throw new Error(
          `${label}: orders request failed (HTTP ${res.status}).${rateHint}${htmlHint || (snippet ? ` ${snippet}` : "")}`
        );
      }
      break;
    }
    const chunk = extractOrdersArray(json);
    for (const raw of chunk) {
      out.push(raw);
    }
    if (chunk.length < limit) break;
  }

  return out;
}

export async function fetchFlexOrdersPaginated(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<FlexNormalizedOrder[]> {
  const opts = normalizeFlexOrdersOptions(options);
  const key = flexOrdersCacheKey(config, opts, "normalized");
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  const hit = await readIntegrationCache<FlexNormalizedOrder[]>(key);
  if (hit.state === "fresh" || hit.state === "stale") {
    return hit.value;
  }
  let live: FlexNormalizedOrder[];
  if (config.spec.id === "shopify") {
    live = await fetchShopifyOrdersPaginatedImpl(config, opts);
  } else {
    const raw = await fetchFlexOrdersRawPaginatedLive(config, opts);
    live = [];
    for (const row of raw) {
      const normalized = normalizeFlexOrder(row, config.amountScale);
      if (normalized) live.push(normalized);
    }
  }
  await writeIntegrationCache({
    cacheKey: key,
    source: `flex:${config.spec.id}:orders:normalized`,
    value: live,
    freshMs,
    staleMs,
  });
  return live;
}

export async function fetchFlexOrdersRawPaginated(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<unknown[]> {
  const opts = normalizeFlexOrdersOptions(options);
  const key = flexOrdersCacheKey(config, opts, "raw");
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  const hit = await readIntegrationCache<unknown[]>(key);
  if (hit.state === "fresh" || hit.state === "stale") {
    return hit.value;
  }
  const raw = await fetchFlexOrdersRawPaginatedLive(config, opts);
  await writeIntegrationCache({
    cacheKey: key,
    source: `flex:${config.spec.id}:orders:raw`,
    value: raw,
    freshMs,
    staleMs,
  });
  return raw;
}

/**
 * Cron/Prewarm: einmal Live-Fetch, dann raw + normalized Cache in einem Schritt füllen
 * (vermeidet doppelte Marktplatz-Requests pro Zeitraum).
 */
export async function primeFlexOrdersCaches(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<{ rawCount: number; normalizedCount: number }> {
  const opts = normalizeFlexOrdersOptions(options);
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  const raw = await fetchFlexOrdersRawPaginatedLive(config, opts);
  const keyRaw = flexOrdersCacheKey(config, opts, "raw");
  await writeIntegrationCache({
    cacheKey: keyRaw,
    source: `flex:${config.spec.id}:orders:raw`,
    value: raw,
    freshMs,
    staleMs,
  });
  const normalized: FlexNormalizedOrder[] = [];
  for (const row of raw) {
    const n = normalizeFlexOrder(row, config.amountScale);
    if (n) normalized.push(n);
  }
  const keyNorm = flexOrdersCacheKey(config, opts, "normalized");
  await writeIntegrationCache({
    cacheKey: keyNorm,
    source: `flex:${config.spec.id}:orders:normalized`,
    value: normalized,
    freshMs,
    staleMs,
  });
  return { rawCount: raw.length, normalizedCount: normalized.length };
}

export function filterOrdersByCreatedRange(
  orders: FlexNormalizedOrder[],
  startMs: number,
  endMs: number
): FlexNormalizedOrder[] {
  return orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    if (Number.isNaN(t)) return false;
    return t >= startMs && t < endMs;
  });
}

function isoDate(value: string) {
  return value.slice(0, 10);
}

export function summarizeFlexOrders(orders: FlexNormalizedOrder[]): {
  summary: {
    orderCount: number;
    salesAmount: number;
    /** Netto-Units: Brutto minus stornierte/retournierte Bestellungen. */
    units: number;
    /** Brutto-Units: Summe aller Bestellpositionen (inkl. storniert/refunded). */
    grossUnits: number;
    returnedUnits: number;
    cancelledUnits: number;
    currency: string;
  };
  points: Array<{ date: string; orders: number; amount: number; units: number }>;
} {
  const pointsMap = new Map<string, { date: string; orderIds: Set<string>; amount: number; units: number }>();
  let totalAmount = 0;
  let totalUnits = 0;
  let returnedUnits = 0;
  let cancelledUnits = 0;
  let currency = "EUR";
  const orderIds = new Set<string>();

  for (const o of orders) {
    orderIds.add(o.id);
    if (o.currency) currency = o.currency;
    totalAmount += o.amount;
    totalUnits += o.units;

    const bucket = classifyOrderStatus(o.status);
    if (bucket === "returned") returnedUnits += o.units;
    if (bucket === "cancelled") cancelledUnits += o.units;

    const ymd = isoDate(o.createdAt);
    const prev = pointsMap.get(ymd) ?? { date: ymd, orderIds: new Set<string>(), amount: 0, units: 0 };
    prev.orderIds.add(o.id);
    prev.amount = Number((prev.amount + o.amount).toFixed(2));
    prev.units += o.units;
    pointsMap.set(ymd, prev);
  }

  const points = Array.from(pointsMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date,
      orders: p.orderIds.size,
      amount: p.amount,
      units: p.units,
    }));

  const netUnits = Math.max(0, totalUnits - returnedUnits - cancelledUnits);

  return {
    summary: {
      orderCount: orderIds.size,
      salesAmount: Number(totalAmount.toFixed(2)),
      units: netUnits,
      grossUnits: totalUnits,
      returnedUnits,
      cancelledUnits,
      currency,
    },
    points,
  };
}

export function flexMissingKeysForConfig(
  config: FlexIntegrationConfig
): { key: string; missing: boolean }[] {
  if (config.authKind === "client_secret") {
    return [
      { key: `${config.envPrefix}_API_BASE_URL`, missing: !config.baseUrl },
      { key: `${config.envPrefix}_CLIENT_KEY`, missing: !config.clientKey },
      { key: `${config.envPrefix}_SECRET_KEY`, missing: !config.secretKey },
    ];
  }
  return [
    { key: `${config.envPrefix}_API_BASE_URL`, missing: !config.baseUrl },
    { key: `${config.envPrefix}_API_KEY`, missing: !config.apiKey },
  ];
}
