import { Buffer } from "node:buffer";
import { createAdminClient } from "@/shared/lib/supabase/admin";

export const FLEX_DAY_MS = 24 * 60 * 60 * 1000;

function env(name: string) {
  return (process.env[name] ?? "").trim();
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
    return ((data?.value as string | undefined) ?? "").trim();
  } catch {
    return "";
  }
}

async function readEnv(prefix: string, suffix: string): Promise<string> {
  const k = `${prefix}_${suffix}`;
  return (env(k) || (await getSupabaseSecret(k))).trim();
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
  const baseUrl = resolveFlexBaseUrl(await readEnv(p, "API_BASE_URL"));
  const apiKey =
    spec.authKind === "single_key"
      ? await readEnv(p, "API_KEY")
      : (await readEnv(p, "ACCESS_TOKEN")) || "";
  const clientKey = spec.authKind === "client_secret" ? await readEnv(p, "CLIENT_KEY") : "";
  const secretKey = spec.authKind === "client_secret" ? await readEnv(p, "SECRET_KEY") : "";

  const ordersPathRaw =
    (await readEnv(p, "ORDERS_PATH")) || spec.defaultOrdersPath || "/orders";
  const ordersPath = ordersPathRaw.startsWith("/") ? ordersPathRaw : `/${ordersPathRaw}`;

  const authRaw = ((await readEnv(p, "AUTH_MODE")) || spec.defaultAuthMode).toLowerCase();
  let authMode: FlexAuthMode = "bearer";
  if (authRaw === "x-api-key") authMode = "x-api-key";
  else if (authRaw === "mirakl" || authRaw === "authorization") authMode = "mirakl";
  else if (authRaw === "basic") authMode = "basic";
  else if (authRaw === "shopify") authMode = "shopify";
  else authMode = "bearer";

  const scaleRaw = await readEnv(p, "AMOUNT_SCALE");
  const amountScale = Math.max(1, Number(scaleRaw) || 1);

  const pageSizeRaw = ((await readEnv(p, "PAGE_SIZE_PARAM")) || "").toLowerCase();
  const pageSizeParam: "max" | "limit" =
    pageSizeRaw === "limit"
      ? "limit"
      : pageSizeRaw === "max"
        ? "max"
        : ordersPath.includes("/api/orders")
          ? "max"
          : "limit";

  const delayRaw = await readEnv(p, "PAGINATION_DELAY_MS");
  const paginationDelayMs = Math.max(0, Number(delayRaw) || 450);

  const retriesRaw = await readEnv(p, "MAX_429_RETRIES");
  const max429Retries = Math.min(30, Math.max(1, Number(retriesRaw) || 8));

  const dateFilterRaw = ((await readEnv(p, "USE_ORDER_DATE_FILTER")) || "").trim().toLowerCase();
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
  createdFromMs?: number;
  createdToMsExclusive?: number;
  maxPages?: number;
};

export async function flexGet(
  config: FlexIntegrationConfig,
  pathAndQuery: string
): Promise<Response> {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;
  try {
    return await fetch(url, { method: "GET", headers: flexAuthHeaders(config), cache: "no-store" });
  } catch (err) {
    throw new Error(formatFetchError(err, `${config.envPrefix}_API_BASE_URL`));
  }
}

async function flexGetWith429Retry(
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

  const status = String(
    o.status ?? o.financial_status ?? o.state ?? o.order_state ?? o.order_status ?? ""
  );

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

export async function fetchFlexOrdersPaginated(
  config: FlexIntegrationConfig,
  options: FetchFlexOrdersOptions = {}
): Promise<FlexNormalizedOrder[]> {
  if (config.spec.id === "shopify") {
    return fetchShopifyOrdersPaginatedImpl(config, options);
  }
  const maxPages = options.maxPages ?? 40;
  const limit = 100;
  const dateFilter =
    options.createdFromMs != null && options.createdToMsExclusive != null
      ? { fromMs: options.createdFromMs, toMsExclusive: options.createdToMsExclusive }
      : undefined;

  const out: FlexNormalizedOrder[] = [];
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
      const n = normalizeFlexOrder(raw, config.amountScale);
      if (n) out.push(n);
    }
    if (chunk.length < limit) break;
  }

  return out;
}

export function parseYmdParam(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
}

export function ymdToUtcRangeExclusiveEnd(fromYmd: string, toYmd: string): { startMs: number; endMs: number } {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const startMs = Date.UTC(fy, fm - 1, fd);
  const endDay = new Date(Date.UTC(ty, tm - 1, td));
  endDay.setUTCDate(endDay.getUTCDate() + 1);
  return { startMs, endMs: endDay.getTime() };
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
    units: number;
    currency: string;
  };
  points: Array<{ date: string; orders: number; amount: number; units: number }>;
} {
  const pointsMap = new Map<string, { date: string; orderIds: Set<string>; amount: number; units: number }>();
  let totalAmount = 0;
  let currency = "EUR";
  const orderIds = new Set<string>();

  for (const o of orders) {
    orderIds.add(o.id);
    if (o.currency) currency = o.currency;
    totalAmount += o.amount;
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

  return {
    summary: {
      orderCount: orderIds.size,
      salesAmount: Number(totalAmount.toFixed(2)),
      units: orders.reduce((s, o) => s + o.units, 0),
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
