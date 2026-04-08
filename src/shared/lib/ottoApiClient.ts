import { createHash } from "node:crypto";
import { readIntegrationSecret } from "@/shared/lib/integrationSecrets";
import { getIntegrationCachedOrLoad, writeIntegrationCache } from "@/shared/lib/integrationDataCache";
import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";
import { parseYmdParam, ymdToUtcRangeExclusiveEnd } from "@/shared/lib/orderDateParams";

export { parseYmdParam, ymdToUtcRangeExclusiveEnd };

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
  /** Live-Fetch und Cache neu schreiben (z. B. `refresh=1` in der Route). */
  forceRefresh?: boolean;
}): Promise<OttoOrder[]> {
  const cacheKey = `otto:orders:${hashCacheInput({
    baseUrl: args.baseUrl,
    startMs: args.startMs,
    endMs: args.endMs,
  })}`;
  const freshMs = marketplaceIntegrationFreshMs();
  const staleMs = marketplaceIntegrationStaleMs();
  if (args.forceRefresh) {
    const live = await fetchOttoOrdersRangeLive(args);
    await writeIntegrationCache({
      cacheKey,
      source: "otto:orders",
      value: live,
      freshMs,
      staleMs,
    });
    return live;
  }
  return getIntegrationCachedOrLoad({
    cacheKey,
    source: "otto:orders",
    freshMs,
    staleMs,
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

/** Scope `availability` für GET /v1/availability/quantities ergänzen. */
export function ensureOttoAvailabilityScope(scopes: string): string {
  const parts = scopes
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.includes("availability")) parts.push("availability");
  return parts.join(" ");
}

type OttoAvailabilityPayload = {
  resources?: unknown[] | Record<string, unknown>;
  links?: Array<{ href?: string; rel?: string }>;
};

function normSku(v: string): string {
  return v.trim().toLowerCase();
}

function readAvailabilityQuantityFromRecord(r: Record<string, unknown>): number | null {
  const candidates = [
    r.quantity,
    r.availableQuantity,
    r.available_quantity,
    r.stockQty,
    r.stock_qty,
    r.value,
    r.amount,
  ];
  for (const c of candidates) {
    const n = parseNumberish(c);
    if (n != null && n >= 0) return Math.trunc(n);
  }
  const nested = r.quantityInfo ?? r.quantity_info ?? r.availability ?? r.stock;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return readAvailabilityQuantityFromRecord(nested as Record<string, unknown>);
  }
  return null;
}

function readAvailabilitySkuFromRecord(r: Record<string, unknown>): string {
  const direct = str(r.sku ?? r.articleNumber ?? r.supplierSku ?? r.productSku ?? r.partnerSku);
  if (direct) return direct;
  const product = r.product;
  if (product && typeof product === "object" && !Array.isArray(product)) {
    return str(
      (product as Record<string, unknown>).sku ??
        (product as Record<string, unknown>).articleNumber ??
        (product as Record<string, unknown>).supplierSku
    );
  }
  return "";
}

async function fetchAvailabilitySlice(args: {
  baseUrl: string;
  token: string;
  limit: number;
  endpointPath: string;
  nextHref?: string;
}): Promise<{ resources: unknown[]; nextHref?: string }> {
  const url = args.nextHref
    ? new URL(args.nextHref, args.baseUrl)
    : new URL(args.endpointPath, args.baseUrl);
  if (!args.nextHref) {
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
  let json: OttoAvailabilityPayload | null = null;
  try {
    json = text ? (JSON.parse(text) as OttoAvailabilityPayload) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 400);
    throw new Error(`OTTO availability request failed (${res.status}). ${preview}`);
  }
  const links = Array.isArray(json.links) ? json.links : [];
  const nextHref = links.find((l) => l?.rel === "next")?.href;
  let resources: unknown[] = [];
  if (Array.isArray(json.resources)) {
    resources = json.resources;
  } else if (json.resources && typeof json.resources === "object") {
    const rec = json.resources as Record<string, unknown>;
    // Official list shape:
    // { resources: { variations: [{ sku, quantity, ...}] }, links: [...] }
    const variations = rec.variations;
    if (Array.isArray(variations)) {
      resources = variations;
    } else {
      // Fallback for map-like payloads.
      resources = Object.entries(rec).map(([skuKey, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const row = value as Record<string, unknown>;
          return { sku: row.sku ?? skuKey, ...row };
        }
        return { sku: skuKey, quantity: value };
      });
    }
  }
  return { resources, nextHref };
}

async function fetchOttoAvailabilityQuantitiesAllLive(args: {
  baseUrl: string;
  token: string;
  limit?: number;
}): Promise<Map<string, number>> {
  const limit = Math.min(200, Math.max(10, args.limit ?? 200));
  const out = new Map<string, number>();
  const pathCandidates = ["/v1/availability/quantities", "/v2/quantities", "/v1/quantities"];
  let nextHref: string | undefined;
  let pathIndex = 0;
  for (let guard = 0; guard < 500; guard += 1) {
    let slice: { resources: unknown[]; nextHref?: string };
    try {
      slice = await fetchAvailabilitySlice({
        baseUrl: args.baseUrl,
        token: args.token,
        limit,
        endpointPath: pathCandidates[pathIndex] ?? "/v1/availability/quantities",
        nextHref,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      const isRoute404 = /failed\s*\(404\)/i.test(msg) || /no route matched/i.test(msg);
      const canFallback = out.size === 0 && !nextHref && pathIndex < pathCandidates.length - 1;
      if (isRoute404 && canFallback) {
        pathIndex += 1;
        continue;
      }
      throw err;
    }
    for (const row of slice.resources) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const sku = readAvailabilitySkuFromRecord(rec);
      const key = normSku(sku);
      if (!key) continue;
      const qty = readAvailabilityQuantityFromRecord(rec);
      if (qty == null) continue;
      out.set(key, qty);
    }
    if (!slice.nextHref) break;
    nextHref = slice.nextHref;
  }
  return out;
}

export async function fetchOttoAvailabilityQuantitiesAll(args: {
  baseUrl: string;
  token: string;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<Map<string, number>> {
  if (args.forceRefresh) {
    return fetchOttoAvailabilityQuantitiesAllLive(args);
  }
  const cacheKey = `otto:availability:${hashCacheInput({
    baseUrl: args.baseUrl,
    limit: args.limit ?? 200,
  })}`;
  const cached = await getIntegrationCachedOrLoad<{
    entries?: Array<[string, number]>;
  }>({
    cacheKey,
    source: "otto:availability",
    freshMs: marketplaceIntegrationFreshMs(),
    staleMs: marketplaceIntegrationStaleMs(),
    loader: async () => {
      const live = await fetchOttoAvailabilityQuantitiesAllLive(args);
      return { entries: Array.from(live.entries()) };
    },
  });
  return new Map(cached.entries ?? []);
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
  priceEur?: number | null;
  stockQty?: number | null;
  extras?: Record<string, unknown>;
};

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function parseNumberish(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractOttoPriceEurFromRecord(input: unknown): number | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const pricing = r.pricing;
  if (pricing && typeof pricing === "object" && !Array.isArray(pricing)) {
    const p = pricing as Record<string, unknown>;
    const directCandidates = [
      p.standardPrice,
      p.salePrice,
      p.offerPrice,
      p.price,
      p.grossPrice,
      p.netPrice,
      p.amount,
      p.value,
    ];
    for (const c of directCandidates) {
      if (c && typeof c === "object" && !Array.isArray(c)) {
        const n = parseNumberish((c as Record<string, unknown>).amount ?? (c as Record<string, unknown>).value);
        if (n != null && Number.isFinite(n)) return Number(n.toFixed(2));
      }
      const n = parseNumberish(c);
      if (n != null && Number.isFinite(n)) return Number(n.toFixed(2));
    }
  }
  const topCandidates = [
    r.price,
    r.salePrice,
    r.offerPrice,
    r.grossPrice,
    r.standardPrice,
    r.amount,
    r.value,
  ];
  for (const c of topCandidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const n = parseNumberish((c as Record<string, unknown>).amount ?? (c as Record<string, unknown>).value);
      if (n != null && Number.isFinite(n)) return Number(n.toFixed(2));
    }
    const n = parseNumberish(c);
    if (n != null && Number.isFinite(n)) return Number(n.toFixed(2));
  }
  return null;
}

function extractStockQtyFromRecord(input: unknown): number | null {
  if (!input || typeof input !== "object") return null;
  const deniedHints = /(price|weight|length|width|height|volume|pack|unit|size|ean|gtin|upc)/i;
  const exactKeyHints = new Set(
    [
      "quantity",
      "availableQuantity",
      "available_quantity",
      "stockQty",
      "stock_qty",
      "stockQuantity",
      "stock_quantity",
      "inventoryQuantity",
      "inventory_quantity",
      "old_inventory_quantity",
      "offer_quantity",
      "fulfillable_quantity",
      "sellableQuantity",
      "sellable_quantity",
      "availableStock",
      "available_stock",
      "availableStockQuantity",
      "available_stock_quantity",
      "stockLevel",
      "stock_level",
      "inventoryLevel",
      "inventory_level",
      "quantityAvailable",
      "quantity_available",
      "onStock",
      "on_stock",
      "remainingQuantity",
      "remaining_quantity",
    ].map((k) => k.replace(/[^a-z0-9]/gi, "").toLowerCase())
  );
  const nestedHints = /(stock|inventory|availability|quantit|qty|fulfillable|sellable|available)/i;
  const seen = new Set<object>();

  const numberFromUnknown = (value: unknown): number | null => {
    const direct = parseNumberish(value);
    if (direct != null && direct >= 0) return Math.trunc(direct);
    if (!value || typeof value !== "object") return null;
    const rec = value as Record<string, unknown>;
    const candidates = [
      rec.value,
      rec.amount,
      rec.quantity,
      rec.qty,
      rec.stock,
      rec.available,
      rec.availableQuantity,
      rec.available_quantity,
      rec.sellableQuantity,
      rec.sellable_quantity,
      rec.inventoryQuantity,
      rec.inventory_quantity,
    ];
    for (const c of candidates) {
      const n = parseNumberish(c);
      if (n != null && n >= 0) return Math.trunc(n);
    }
    return null;
  };

  const walk = (node: unknown, depth: number): number | null => {
    if (depth > 6 || !node || typeof node !== "object") return null;
    if (seen.has(node as object)) return null;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (const item of node) {
        const n = walk(item, depth + 1);
        if (n != null) return n;
      }
      return null;
    }

    const rec = node as Record<string, unknown>;
    for (const [rawKey, value] of Object.entries(rec)) {
      const keyNorm = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (!keyNorm) continue;
      const hasStockHint = exactKeyHints.has(keyNorm) || nestedHints.test(rawKey);
      if (hasStockHint && !deniedHints.test(rawKey)) {
        const n = numberFromUnknown(value);
        if (n != null) return n;
      }
    }
    for (const value of Object.values(rec)) {
      const n = walk(value, depth + 1);
      if (n != null) return n;
    }
    return null;
  };

  return walk(input, 0);
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

function ottoExtrasForRow(resource: Record<string, unknown>, vr?: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && !v.trim()) return;
    out[k] = v;
  };
  put(
    "product_reference",
    resource.productReference ?? resource.product_reference ?? resource.id ?? resource.productId
  );
  if (vr) {
    put("variation_id", vr.id ?? vr.sku ?? vr.articleNumber);
    put("active_status", vr.activeStatus ?? vr.status ?? vr.marketplaceStatus);
  } else {
    put("active_status", resource.activeStatus ?? resource.status);
  }
  const pdRaw = resource.productDescription ?? resource.product_description;
  if (pdRaw && typeof pdRaw === "object" && !Array.isArray(pdRaw)) {
    const pd = pdRaw as Record<string, unknown>;
    put("brand_hint", pd.brand);
    put("product_line_hint", pd.productLine ?? pd.product_line);
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
      const extras = ottoExtrasForRow(resource, vr);
      const stockQty = extractStockQtyFromRecord(vr) ?? extractStockQtyFromRecord(resource);
      const priceEur = extractOttoPriceEurFromRecord(vr) ?? extractOttoPriceEurFromRecord(resource);
      rows.push({
        sku: sku || vid || "—",
        secondaryId: productRef || vid || sku || "—",
        title: title || productTitle || "—",
        statusLabel: statusRaw || (active ? "ACTIVE" : "INACTIVE"),
        isActive: active,
        ...(priceEur != null ? { priceEur } : {}),
        ...(stockQty != null ? { stockQty } : {}),
        ...(extras ? { extras } : {}),
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

  const extras = ottoExtrasForRow(resource);
  const priceEur = extractOttoPriceEurFromRecord(resource);
  const stockQty = extractStockQtyFromRecord(resource);
  return [
    {
      sku: sku || productRef || "—",
      secondaryId: productRef || sku || "—",
      title: productTitle || "—",
      statusLabel: statusRaw || (active ? "ACTIVE" : "INACTIVE"),
      isActive: active,
      ...(priceEur != null ? { priceEur } : {}),
      ...(stockQty != null ? { stockQty } : {}),
      ...(extras ? { extras } : {}),
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
  forceRefresh?: boolean;
}): Promise<OttoProductListRow[]> {
  if (args.forceRefresh) {
    return fetchOttoProductsAllLive({
      baseUrl: args.baseUrl,
      token: args.token,
      limit: args.limit,
      productsPath: args.productsPath,
    });
  }
  const cacheKey = `otto:products:${hashCacheInput({
    baseUrl: args.baseUrl,
    limit: args.limit ?? 100,
    productsPath: args.productsPath ?? "",
  })}`;
  return getIntegrationCachedOrLoad({
    cacheKey,
    source: "otto:products",
    freshMs: marketplaceIntegrationFreshMs(),
    staleMs: marketplaceIntegrationStaleMs(),
    loader: () => fetchOttoProductsAllLive(args),
  });
}
