import { createHash } from "node:crypto";
import { readIntegrationSecret } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad } from "@/shared/lib/integrationDataCache";

export type OttoAmount = { amount?: number | string; currency?: string };

export type OttoPositionItem = {
  item_value_reduced_gross_price?: OttoAmount;
  itemValueReducedGrossPrice?: OttoAmount;
  item_value_gross_price?: OttoAmount;
  itemValueGrossPrice?: OttoAmount;
};

/** Rohes Order-Objekt der Otto API v4 (teilweise snake_case / camelCase). */
export type OttoOrder = {
  sales_order_id?: string;
  salesOrderId?: string;
  order_number?: string;
  orderNumber?: string;
  order_date?: string;
  orderDate?: string;
  position_items?: OttoPositionItem[];
  positionItems?: OttoPositionItem[];
  order_lifecycle_status?: string;
  orderLifecycleStatus?: string;
  fulfillment_status?: string;
  fulfillmentStatus?: string;
  [key: string]: unknown;
};

type OttoOrdersPayload = {
  resources?: OttoOrder[];
  links?: Array<{ href?: string; rel?: string }>;
};

export const OTTO_DAY_MS = 24 * 60 * 60 * 1000;

function hashCacheInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex").slice(0, 24);
}

export function resolveOttoBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "https://api.otto.market";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

export async function getOttoIntegrationConfig(): Promise<{
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  /** Nur gesetzt, wenn DB-Zugriff fehlgeschlagen ist (nicht bei „Zeile fehlt“). */
  integrationSecretsLoadErrors?: string[];
}> {
  const loadErrors: string[] = [];
  const rBase = await readIntegrationSecret("OTTO_API_BASE_URL");
  const rId = await readIntegrationSecret("OTTO_API_CLIENT_ID");
  const rSecret = await readIntegrationSecret("OTTO_API_CLIENT_SECRET");
  const rScopes = await readIntegrationSecret("OTTO_API_SCOPES");

  for (const [label, r] of [
    ["OTTO_API_BASE_URL", rBase],
    ["OTTO_API_CLIENT_ID", rId],
    ["OTTO_API_CLIENT_SECRET", rSecret],
    ["OTTO_API_SCOPES", rScopes],
  ] as const) {
    if (r.databaseError) loadErrors.push(`${label}: ${r.databaseError}`);
  }

  const baseUrl = resolveOttoBaseUrl(rBase.value || "https://api.otto.market");
  const clientId = rId.value;
  const clientSecret = rSecret.value;
  const scopesRaw = rScopes.value || "orders";
  const scopes = scopesRaw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  return {
    baseUrl,
    clientId,
    clientSecret,
    scopes,
    integrationSecretsLoadErrors: loadErrors.length ? loadErrors : undefined,
  };
}

export async function getOttoAccessToken(args: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    scope: args.scopes,
  });
  const res = await fetch(`${args.baseUrl}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
  const token = (json as { access_token?: string } | null)?.access_token;
  if (!res.ok || !token) {
    throw new Error(`OTTO token request failed (${res.status}).`);
  }
  return token;
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

async function fetchOrdersSlice(args: {
  baseUrl: string;
  token: string;
  fromIso: string;
  toIso: string;
  nextHref?: string;
}): Promise<{ resources: OttoOrder[]; nextHref?: string }> {
  const url = args.nextHref
    ? new URL(args.nextHref, args.baseUrl)
    : new URL("/v4/orders", args.baseUrl);
  if (!args.nextHref) {
    url.searchParams.set("fromOrderDate", args.fromIso);
    url.searchParams.set("toOrderDate", args.toIso);
    url.searchParams.set("orderColumnType", "ORDER_DATE");
    url.searchParams.set("limit", "128");
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${args.token}`,
      "X-Request-Timestamp": new Date().toISOString(),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: OttoOrdersPayload | null = null;
  try {
    json = text ? (JSON.parse(text) as OttoOrdersPayload) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    throw new Error(`OTTO orders request failed (${res.status}).`);
  }
  const links = Array.isArray(json.links) ? json.links : [];
  const nextHref = links.find((l) => l?.rel === "next")?.href;
  return { resources: Array.isArray(json.resources) ? json.resources : [], nextHref };
}

async function fetchOttoOrdersRangeLive(args: {
  baseUrl: string;
  token: string;
  startMs: number;
  endMs: number;
}): Promise<OttoOrder[]> {
  const fromIso = new Date(args.startMs).toISOString();
  const toIso = new Date(args.endMs).toISOString();
  const out: OttoOrder[] = [];
  let nextHref: string | undefined;
  for (let guard = 0; guard < 60; guard += 1) {
    const slice = await fetchOrdersSlice({
      baseUrl: args.baseUrl,
      token: args.token,
      fromIso,
      toIso,
      nextHref,
    });
    out.push(...slice.resources);
    if (!slice.nextHref) break;
    nextHref = slice.nextHref;
  }
  return out;
}

export async function fetchOttoOrdersRange(args: {
  baseUrl: string;
  token: string;
  startMs: number;
  endMs: number;
}): Promise<OttoOrder[]> {
  const cacheKey = `otto:orders:${hashCacheInput({
    baseUrl: args.baseUrl,
    startMs: args.startMs,
    endMs: args.endMs,
  })}`;
  return getIntegrationCachedOrLoad({
    cacheKey,
    source: "otto:orders",
    freshMs: 2 * 60 * 1000,
    staleMs: 12 * 60 * 1000,
    loader: () => fetchOttoOrdersRangeLive(args),
  });
}

/** Scope `products` für GET /v4/products — wird ergänzt, falls nur `orders` gesetzt ist. */
export function ensureOttoProductsScope(scopes: string): string {
  const parts = scopes
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.includes("products")) parts.push("products");
  return parts.join(" ");
}

type OttoProductsPayload = {
  resources?: unknown[];
  productVariations?: unknown[];
  variations?: unknown[];
  links?: Array<{ href?: string; rel?: string }>;
};

async function fetchProductsSlice(args: {
  baseUrl: string;
  token: string;
  productsPath: string;
  page: number;
  limit: number;
  nextHref?: string;
}): Promise<{ resources: unknown[]; nextHref?: string }> {
  const url = args.nextHref
    ? new URL(args.nextHref, args.baseUrl)
    : new URL(args.productsPath, args.baseUrl);
  if (!args.nextHref) {
    url.searchParams.set("page", String(args.page));
    url.searchParams.set("limit", String(args.limit));
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${args.token}`,
      "X-Request-Timestamp": new Date().toISOString(),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: OttoProductsPayload | null = null;
  try {
    json = text ? (JSON.parse(text) as OttoProductsPayload) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 400);
    throw new Error(`OTTO products request failed (${res.status}). ${preview}`);
  }
  const links = Array.isArray(json.links) ? json.links : [];
  const nextHref = links.find((l) => l?.rel === "next")?.href;
  const resources = Array.isArray(json.resources)
    ? json.resources
    : Array.isArray(json.productVariations)
      ? json.productVariations
      : Array.isArray(json.variations)
        ? json.variations
        : [];
  return { resources, nextHref };
}

export type OttoProductListRow = {
  sku: string;
  secondaryId: string;
  title: string;
  statusLabel: string;
  isActive: boolean;
};

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function firstLine(text: string, maxLen = 240): string {
  const t = text.trim();
  if (!t) return "";
  const line = (t.split(/\r?\n/)[0] ?? t).trim();
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

function stripHtmlToPlain(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Offizielles Partner-Schema: `productDescription` ist ein Objekt (brand, productLine, category, …), kein String.
 * @see https://github.com/otto-de/marketplace-php-sdk/blob/main/openapi-doc/products-interface.yml — ProductDescription
 */
function titleFromOttoProductDescriptionBlock(pd: Record<string, unknown>): string {
  const brand = str(pd.brand);
  const productLine = str(pd.productLine ?? pd.product_line);
  const category = str(pd.category);
  const descHtml = str(pd.description);
  if (brand && productLine) return `${brand} ${productLine}`.trim();
  if (productLine) return productLine;
  if (brand && category) return `${brand} ${category}`.trim();
  if (category) return category;
  if (descHtml) return firstLine(stripHtmlToPlain(descHtml));
  if (brand) return brand;
  return "";
}

/**
 * Otto Market API: je nach Version / Endpoint andere Schlüssel für den Anzeigenamen.
 */
function ottoTitleFromRecord(r: Record<string, unknown>): string {
  const pdRaw = r.productDescription ?? r.product_description;
  if (typeof pdRaw === "string" && pdRaw.trim()) {
    return firstLine(stripHtmlToPlain(pdRaw));
  }
  if (pdRaw && typeof pdRaw === "object" && !Array.isArray(pdRaw)) {
    const fromBlock = titleFromOttoProductDescriptionBlock(pdRaw as Record<string, unknown>);
    if (fromBlock) return fromBlock;
  }

  const direct = str(
    r.productTitle ??
      r.title ??
      r.name ??
      r.productName ??
      r.articleName ??
      r.article_name ??
      r.marketingName ??
      r.displayName ??
      r.productLabel ??
      r.shortTitle ??
      r.label
  );
  if (direct) return direct;

  const shortDesc = str(r.shortDescription ?? r.short_description);
  if (shortDesc) return firstLine(shortDesc);

  const topHtmlDesc = str(r.description);
  if (topHtmlDesc) return firstLine(stripHtmlToPlain(topHtmlDesc));

  const nested = r.product;
  if (nested && typeof nested === "object") {
    const nt = ottoTitleFromRecord(nested as Record<string, unknown>);
    if (nt) return nt;
  }

  const brand = str(r.brand ?? r.brandName ?? r.manufacturer);
  const line = str(r.productLine ?? r.product_line ?? r.line);
  if (brand && line) return `${brand} ${line}`.trim();
  if (brand) return brand;
  if (line) return line;

  return "";
}

function mapOttoProductResourceToRows(resource: Record<string, unknown>): OttoProductListRow[] {
  const variations = resource.variations;
  const productTitle = ottoTitleFromRecord(resource);
  const productRef = str(resource.productReference ?? resource.id ?? resource.productId);

  if (Array.isArray(variations) && variations.length > 0) {
    const rows: OttoProductListRow[] = [];
    for (const v of variations) {
      if (!v || typeof v !== "object") continue;
      const vr = v as Record<string, unknown>;
      const sku = str(vr.sku ?? vr.articleNumber ?? vr.skuSupplier ?? vr.supplierSku);
      const vid = str(vr.id ?? vr.sku ?? sku);
      const title =
        ottoTitleFromRecord(vr) ||
        str(
          vr.title ??
            vr.productTitle ??
            vr.productName ??
            vr.name ??
            vr.articleName ??
            vr.article_name
        ) ||
        productTitle;
      const statusRaw = str(
        vr.activeStatus ?? vr.status ?? vr.marketplaceStatus ?? vr.lifecycleStatus ?? ""
      );
      const active =
        vr.active !== false &&
        !/inactive|deactivated|deleted/i.test(statusRaw) &&
        String(vr.activeStatus ?? "").toUpperCase() !== "INACTIVE";
      rows.push({
        sku: sku || vid || "—",
        secondaryId: productRef || vid || sku || "—",
        title: title || productTitle || "—",
        statusLabel: statusRaw || (active ? "ACTIVE" : "INACTIVE"),
        isActive: active,
      });
    }
    return rows;
  }

  const sku = str(resource.sku ?? resource.articleNumber ?? resource.supplierSku);
  const statusRaw = str(resource.activeStatus ?? resource.status ?? "");
  const active =
    resource.active !== false &&
    !/inactive|deactivated/i.test(statusRaw) &&
    String(resource.activeStatus ?? "").toUpperCase() !== "INACTIVE";

  return [
    {
      sku: sku || productRef || "—",
      secondaryId: productRef || sku || "—",
      title: productTitle || "—",
      statusLabel: statusRaw || (active ? "ACTIVE" : "INACTIVE"),
      isActive: active,
    },
  ];
}

export function mapOttoProductResourcesToRows(resources: unknown[]): OttoProductListRow[] {
  const out: OttoProductListRow[] = [];
  for (const r of resources) {
    if (!r || typeof r !== "object") continue;
    out.push(...mapOttoProductResourceToRows(r as Record<string, unknown>));
  }
  return out;
}

/**
 * Lädt alle Produktseiten (präferiert /v5/products, Fallback auf ältere Pfade).
 * Erfordert OAuth-Scope `products` (Token mit ensureOttoProductsScope).
 */
async function fetchOttoProductsAllLive(args: {
  baseUrl: string;
  token: string;
  limit?: number;
  productsPath?: string;
}): Promise<OttoProductListRow[]> {
  const limit = Math.min(200, Math.max(10, args.limit ?? 100));
  const preferredPath = (args.productsPath || "").trim();
  const pathCandidates = [
    preferredPath.startsWith("/") ? preferredPath : preferredPath ? `/${preferredPath}` : "/v4/products",
    "/v5/products",
    "/v4/products",
    "/v3/products",
  ].filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i);
  const rows: OttoProductListRow[] = [];
  let nextHref: string | undefined;
  let page = 0;
  let pathIndex = 0;
  for (let guard = 0; guard < 80; guard += 1) {
    let slice: { resources: unknown[]; nextHref?: string };
    try {
      slice = await fetchProductsSlice({
        baseUrl: args.baseUrl,
        token: args.token,
        productsPath: pathCandidates[pathIndex] ?? "/v4/products",
        page,
        limit,
        nextHref,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      const isRoute404 = /failed\s*\(404\)/i.test(msg) || /no route matched/i.test(msg);
      const canFallback = rows.length === 0 && !nextHref && page === 0 && pathIndex < pathCandidates.length - 1;
      if (isRoute404 && canFallback) {
        pathIndex += 1;
        continue;
      }
      throw err;
    }
    rows.push(...mapOttoProductResourcesToRows(slice.resources));
    if (slice.nextHref) {
      nextHref = slice.nextHref;
      continue;
    }
    nextHref = undefined;
    if (slice.resources.length === 0) break;
    if (slice.resources.length < limit) break;
    page += 1;
  }
  return rows;
}

export async function fetchOttoProductsAll(args: {
  baseUrl: string;
  token: string;
  limit?: number;
  productsPath?: string;
}): Promise<OttoProductListRow[]> {
  const cacheKey = `otto:products:${hashCacheInput({
    baseUrl: args.baseUrl,
    limit: args.limit ?? 100,
    productsPath: args.productsPath ?? "",
  })}`;
  return getIntegrationCachedOrLoad({
    cacheKey,
    source: "otto:products",
    freshMs: 5 * 60 * 1000,
    staleMs: 20 * 60 * 1000,
    loader: () => fetchOttoProductsAllLive(args),
  });
}
