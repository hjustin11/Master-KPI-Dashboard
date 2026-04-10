import { createHash } from "node:crypto";
import { getIntegrationSecretValue } from "@/shared/lib/integrationSecrets";
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

export { parseYmdParam, ymdToUtcRangeExclusiveEnd };

export const FRESSNAPF_DAY_MS = 24 * 60 * 60 * 1000;

function hashCacheInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex").slice(0, 24);
}

export function resolveFressnapfBaseUrl(raw: string): string {
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

/** `mirakl` = Authorization-Header nur API-Key (Mirakl Seller API). */
export type FressnapfAuthMode = "bearer" | "x-api-key" | "mirakl";

export type FressnapfIntegrationConfig = {
  baseUrl: string;
  apiKey: string;
  ordersPath: string;
  authMode: FressnapfAuthMode;
  /** 1 = EUR, 100 wenn Beträge in Cent */
  amountScale: number;
  /** Query-Parameter für Seitengröße: Mirakl OR11 nutzt `max`, viele APIs `limit`. */
  pageSizeParam: "max" | "limit";
  /** Pause zwischen Seitenabrufen (Rate Limits). */
  paginationDelayMs: number;
  /** Wiederholungen bei HTTP 429 vor Abbruch. */
  max429Retries: number;
  /** OR11: `start_date`/`end_date` anhängen (nur wenn Zeitraum übergeben). */
  useOrderDateFilter: boolean;
};

export async function getFressnapfIntegrationConfig(): Promise<FressnapfIntegrationConfig> {
  const baseUrl = resolveFressnapfBaseUrl(await getIntegrationSecretValue("FRESSNAPF_API_BASE_URL"));
  const apiKey = await getIntegrationSecretValue("FRESSNAPF_API_KEY");
  const ordersPathRaw =
    (await getIntegrationSecretValue("FRESSNAPF_ORDERS_PATH")) || "/api/orders";
  const ordersPath = ordersPathRaw.startsWith("/") ? ordersPathRaw : `/${ordersPathRaw}`;
  const authRaw = ((await getIntegrationSecretValue("FRESSNAPF_AUTH_MODE")) || "mirakl").toLowerCase();
  const authMode: FressnapfAuthMode =
    authRaw === "x-api-key"
      ? "x-api-key"
      : authRaw === "mirakl" || authRaw === "authorization"
        ? "mirakl"
        : "bearer";
  const scaleRaw = await getIntegrationSecretValue("FRESSNAPF_AMOUNT_SCALE");
  const amountScale = Math.max(1, Number(scaleRaw) || 1);
  const pageSizeRaw = ((await getIntegrationSecretValue("FRESSNAPF_PAGE_SIZE_PARAM")) || "").toLowerCase();
  const pageSizeParam: "max" | "limit" =
    pageSizeRaw === "limit"
      ? "limit"
      : pageSizeRaw === "max"
        ? "max"
        : ordersPath.includes("/api/orders")
          ? "max"
          : "limit";

  const delayRaw = await getIntegrationSecretValue("FRESSNAPF_PAGINATION_DELAY_MS");
  const paginationDelayMs = Math.max(0, Number(delayRaw) || 450);

  const retriesRaw = await getIntegrationSecretValue("FRESSNAPF_MAX_429_RETRIES");
  const max429Retries = Math.min(30, Math.max(1, Number(retriesRaw) || 8));

  const dateFilterRaw = ((await getIntegrationSecretValue("FRESSNAPF_USE_ORDER_DATE_FILTER")) || "")
    .trim()
    .toLowerCase();
  const useOrderDateFilter =
    dateFilterRaw === "false" || dateFilterRaw === "0" || dateFilterRaw === "no"
      ? false
      : dateFilterRaw === "true" || dateFilterRaw === "1" || dateFilterRaw === "yes"
        ? true
        : ordersPath.includes("/api/orders");

  return {
    baseUrl,
    apiKey,
    ordersPath,
    authMode,
    amountScale,
    pageSizeParam,
    paginationDelayMs,
    max429Retries,
    useOrderDateFilter,
  };
}

function authHeaders(config: FressnapfIntegrationConfig): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "MasterDashboard/1.0",
  };
  if (config.authMode === "x-api-key") {
    h["X-API-Key"] = config.apiKey;
  } else if (config.authMode === "mirakl") {
    h.Authorization = config.apiKey;
  } else {
    h.Authorization = `Bearer ${config.apiKey}`;
  }
  return h;
}

/** Node/undici: bei DNS/TLS/Timeout oft nur „fetch failed“ — Ursache anhängen. */
function formatFetchError(err: unknown): string {
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
      "Prüfen: FRESSNAPF_API_BASE_URL (vollständige HTTPS-Origin, z. B. Mirakl-Front-URL), DNS/Firewall vom Server aus, Zertifikat.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return detail || err.message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry-After: Sekunden oder HTTP-Datum. */
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

export type FetchFressnapfOrdersOptions = {
  fromYmd?: string;
  toYmd?: string;
  /** Nur Bestellungen ab (Mirakl `start_date` wenn aktiv). */
  createdFromMs?: number;
  /** Exklusives Ende (Mirakl `end_date` = letzter inkl. Zeitpunkt). */
  createdToMsExclusive?: number;
  maxPages?: number;
  /** Live-Fetch und Cache neu schreiben (z. B. `refresh=1` in der Route). */
  forceRefresh?: boolean;
};

export function normalizeFressnapfOrdersOptions(
  options: FetchFressnapfOrdersOptions
): FetchFressnapfOrdersOptions {
  if (options.fromYmd && options.toYmd) {
    const { startMs, endMs } = ymdToUtcRangeExclusiveEnd(options.fromYmd, options.toYmd);
    return { ...options, createdFromMs: startMs, createdToMsExclusive: endMs };
  }
  return { ...options };
}

function fressnapfOrdersCacheRangePart(options: FetchFressnapfOrdersOptions): unknown {
  if (options.fromYmd && options.toYmd) {
    return { fromYmd: options.fromYmd, toYmd: options.toYmd };
  }
  return {
    createdFromMs: options.createdFromMs ?? null,
    createdToMsExclusive: options.createdToMsExclusive ?? null,
  };
}

function buildOrdersListQuery(
  config: FressnapfIntegrationConfig,
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

async function fressnapfGetWith429Retry(
  config: FressnapfIntegrationConfig,
  pathAndQuery: string
): Promise<{ res: Response; text: string }> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fressnapfGet(config, pathAndQuery);
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

export async function fressnapfGet(
  config: FressnapfIntegrationConfig,
  pathAndQuery: string
): Promise<Response> {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: authHeaders(config), cache: "no-store" });
  } catch (err) {
    throw new Error(formatFetchError(err));
  }
  return res;
}

/** JSON-Antworten typischer Marktplatz-APIs: data | orders | items | results | Array */
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

export type FressnapfNormalizedOrder = {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  units: number;
  status: string;
};

export async function readFressnapfOrdersNormalizedFromDashboard(
  config: FressnapfIntegrationConfig,
  fromYmd: string,
  toYmd: string
): Promise<IntegrationDashboardCacheRead<FressnapfNormalizedOrder[]>> {
  const cacheKey = `fressnapf:orders:normalized:${hashCacheInput({
    range: { fromYmd, toYmd },
    maxPages: null,
    ordersPath: config.ordersPath,
    amountScale: config.amountScale,
  })}`;
  return readIntegrationCacheForDashboard<FressnapfNormalizedOrder[]>(cacheKey);
}

export function normalizeFressnapfOrder(
  raw: unknown,
  amountScale: number
): FressnapfNormalizedOrder | null {
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

  const status = String(o.status ?? o.state ?? o.order_state ?? o.order_status ?? "");

  return {
    id,
    createdAt: created || new Date(0).toISOString(),
    amount: Number(amount.toFixed(2)),
    currency,
    units,
    status,
  };
}

async function fetchFressnapfOrdersPaginatedLive(
  config: FressnapfIntegrationConfig,
  options: FetchFressnapfOrdersOptions = {}
): Promise<FressnapfNormalizedOrder[]> {
  const opts = normalizeFressnapfOrdersOptions(options);
  const maxPages = opts.maxPages ?? 40;
  const limit = 100;
  const dateFilter =
    opts.createdFromMs != null && opts.createdToMsExclusive != null
      ? { fromMs: opts.createdFromMs, toMsExclusive: opts.createdToMsExclusive }
      : undefined;

  const out: FressnapfNormalizedOrder[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    if (page > 0 && config.paginationDelayMs > 0) {
      await sleep(config.paginationDelayMs);
    }
    const path = buildOrdersListQuery(config, limit, page * limit, dateFilter);
    const { res, text } = await fressnapfGetWith429Retry(config, path);
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json == null) {
      const hint = text.replace(/\s+/g, " ").trim().slice(0, 400);
      if (page === 0) {
        const rateHint =
          res.status === 429
            ? " Zu viele Anfragen (Rate Limit). Bitte später erneut versuchen; optional FRESSNAPF_PAGINATION_DELAY_MS erhöhen (z. B. 800) oder Zeitraum verkleinern."
            : "";
        throw new Error(
          `Fressnapf orders request failed (HTTP ${res.status}).${rateHint}${hint ? ` ${hint}` : ""}`
        );
      }
      break;
    }
    const chunk = extractOrdersArray(json);
    for (const raw of chunk) {
      const n = normalizeFressnapfOrder(raw, config.amountScale);
      if (n) out.push(n);
    }
    if (chunk.length < limit) break;
  }

  return out;
}

async function fetchFressnapfOrdersRawPaginatedLive(
  config: FressnapfIntegrationConfig,
  options: FetchFressnapfOrdersOptions = {}
): Promise<unknown[]> {
  const opts = normalizeFressnapfOrdersOptions(options);
  const maxPages = opts.maxPages ?? 40;
  const limit = 100;
  const dateFilter =
    opts.createdFromMs != null && opts.createdToMsExclusive != null
      ? { fromMs: opts.createdFromMs, toMsExclusive: opts.createdToMsExclusive }
      : undefined;

  const out: unknown[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    if (page > 0 && config.paginationDelayMs > 0) {
      await sleep(config.paginationDelayMs);
    }
    const path = buildOrdersListQuery(config, limit, page * limit, dateFilter);
    const { res, text } = await fressnapfGetWith429Retry(config, path);
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json == null) {
      const hint = text.replace(/\s+/g, " ").trim().slice(0, 400);
      if (page === 0) {
        const rateHint =
          res.status === 429
            ? " Zu viele Anfragen (Rate Limit). Bitte später erneut versuchen; optional FRESSNAPF_PAGINATION_DELAY_MS erhöhen (z. B. 800) oder Zeitraum verkleinern."
            : "";
        throw new Error(
          `Fressnapf orders request failed (HTTP ${res.status}).${rateHint}${hint ? ` ${hint}` : ""}`
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

export async function fetchFressnapfOrdersRawPaginated(
  config: FressnapfIntegrationConfig,
  options: FetchFressnapfOrdersOptions = {}
): Promise<unknown[]> {
  const { forceRefresh, ...rest } = options;
  const optsForKey = normalizeFressnapfOrdersOptions(rest);
  const cacheKey = `fressnapf:orders:raw:${hashCacheInput({
    range: fressnapfOrdersCacheRangePart(optsForKey),
    maxPages: optsForKey.maxPages ?? null,
    ordersPath: config.ordersPath,
    amountScale: config.amountScale,
  })}`;
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  if (forceRefresh) {
    const live = await fetchFressnapfOrdersRawPaginatedLive(config, options);
    await writeIntegrationCache({
      cacheKey,
      source: "fressnapf:orders:raw",
      value: live,
      freshMs,
      staleMs,
    });
    return live;
  }
  const hit = await readIntegrationCache<unknown[]>(cacheKey);
  if (hit.state === "fresh" || hit.state === "stale") return hit.value;
  const live = await fetchFressnapfOrdersRawPaginatedLive(config, options);
  await writeIntegrationCache({
    cacheKey,
    source: "fressnapf:orders:raw",
    value: live,
    freshMs,
    staleMs,
  });
  return live;
}

export async function fetchFressnapfOrdersPaginated(
  config: FressnapfIntegrationConfig,
  options: FetchFressnapfOrdersOptions = {}
): Promise<FressnapfNormalizedOrder[]> {
  const { forceRefresh, ...rest } = options;
  const optsForKey = normalizeFressnapfOrdersOptions(rest);
  const cacheKey = `fressnapf:orders:normalized:${hashCacheInput({
    range: fressnapfOrdersCacheRangePart(optsForKey),
    maxPages: optsForKey.maxPages ?? null,
    ordersPath: config.ordersPath,
    amountScale: config.amountScale,
  })}`;
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  if (forceRefresh) {
    const live = await fetchFressnapfOrdersPaginatedLive(config, options);
    await writeIntegrationCache({
      cacheKey,
      source: "fressnapf:orders:normalized",
      value: live,
      freshMs,
      staleMs,
    });
    return live;
  }
  const hit = await readIntegrationCache<FressnapfNormalizedOrder[]>(cacheKey);
  if (hit.state === "fresh" || hit.state === "stale") return hit.value;
  const live = await fetchFressnapfOrdersPaginatedLive(config, options);
  await writeIntegrationCache({
    cacheKey,
    source: "fressnapf:orders:normalized",
    value: live,
    freshMs,
    staleMs,
  });
  return live;
}

export function filterOrdersByCreatedRange(
  orders: FressnapfNormalizedOrder[],
  startMs: number,
  endMs: number
): FressnapfNormalizedOrder[] {
  return orders.filter((o) => {
    const t = Date.parse(o.createdAt);
    if (Number.isNaN(t)) return false;
    return t >= startMs && t < endMs;
  });
}

function isoDate(value: string) {
  return value.slice(0, 10);
}

export function summarizeFressnapfOrders(orders: FressnapfNormalizedOrder[]): {
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
