import { createHash } from "node:crypto";

import {
  marketplaceIntegrationFreshMs,
  marketplaceIntegrationStaleMs,
} from "@/shared/lib/integrationCacheTtl";

import {
  computeAddressValidation,
  primaryAddressContext,
  type ShippingAddressValidationStatus,
} from "@/shared/lib/shippingAddressValidation";
import {
  extractPrimaryAddressFieldsOneToOne,
  type XentralPrimaryAddressFields,
} from "@/shared/lib/xentralPrimaryAddressFields";
import { deriveXentralAppBaseFromApiBase } from "@/shared/lib/xentralSalesOrderWebLink";
import {
  extractAttributes,
  expandMarketplaceKeyName,
  fetchXentralProjectByIdLookup,
  joinUrl,
  pickFirstString,
} from "@/shared/lib/xentralProjectLookup";

type XentralOrderRow = {
  id: string;
  documentNumber: string;
  orderDate: string | null;
  customer: string;
  marketplace: string;
  total: number | null;
  currency: string | null;
  addressValidation: ShippingAddressValidationStatus;
  addressValidationIssues: string[];
  /** Orange „bearbeitet“ in der UI; echte Logik folgt später (bis dahin false). */
  addressEdited: boolean;
  /** Primäre Liefer-/Rechnungsadresse: je Key ein Xentral-Feld, kein Fallback. */
  addressPrimaryFields: XentralPrimaryAddressFields;
  /** Bestellnummer (Marktplatz/Web), falls von Xentral geliefert. */
  internetNumber: string;
};

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

/** Meta für Deep-Links ins Xentral-Web (Sales Order). */
function buildSalesOrderWebLinkMeta(apiBaseUrl: string): {
  xentralOrderWebBase: string | null;
  xentralSalesOrderWebPath: string;
} {
  const explicit = (env("XENTRAL_APP_BASE_URL") || "").trim().replace(/\/+$/, "");
  const derivedRaw = explicit || deriveXentralAppBaseFromApiBase(apiBaseUrl.trim());
  const xentralOrderWebBase = derivedRaw.length > 0 ? derivedRaw : null;
  let pathRaw = (env("XENTRAL_SALES_ORDER_WEB_PATH") || "/sales-orders").trim();
  if (!pathRaw) pathRaw = "/sales-orders";
  /** Vollständige Browser-URL als Vorlage (…&id=) — keine Basis-URL nötig. */
  if (/^https?:\/\//i.test(pathRaw)) {
    return {
      xentralOrderWebBase: null,
      xentralSalesOrderWebPath: pathRaw,
    };
  }
  const xentralSalesOrderWebPath = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;
  return { xentralOrderWebBase, xentralSalesOrderWebPath };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** ISO-Datum oder Datum-Zeit auf yyyy-mm-dd kürzen (Anzeige). */
function toDateYmd(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return null;
}

/** Kalendertag in Europe/Berlin (für Filter / Anzeige, unabhängig von UTC in ISO-Strings). */
function apiDateToBerlinYmd(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return toDateYmd(raw);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : toDateYmd(raw);
}

function formatBerlinYmdFromInstant(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : "";
}

/** Inklusive Fenster: heute Berlin und die vorherigen (recentDays - 1) Kalendertage. */
function berlinRecentWindow(recentDays: number): { fromYmd: string; toYmd: string } {
  const n = Math.max(1, Math.floor(recentDays));
  const toYmd = formatBerlinYmdFromInstant(new Date());
  if (n <= 1) return { fromYmd: toYmd, toYmd };

  const fromInstant = new Date(Date.now() - (n - 1) * 86400000);
  const fromYmd = formatBerlinYmdFromInstant(fromInstant);
  return { fromYmd, toYmd };
}

const MAX_DATE_RANGE_DAYS = 366;

function parseYmdQueryParam(value: string | null): string | null {
  if (!value) return null;
  const t = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/**
 * Optional: explizites Kalenderfenster (Europe/Berlin-Datum als yyyy-mm-dd).
 * Zu breite Spannen werden auf {@link MAX_DATE_RANGE_DAYS} Tage begrenzt (ab toYmd rückwärts).
 */
function resolveRecentFetchWindow(searchParams: URLSearchParams, recentDays: number): {
  fromYmd: string;
  toYmd: string;
  mode: "dateRange" | "recentDays";
} {
  const qFrom = parseYmdQueryParam(searchParams.get("fromYmd"));
  const qTo = parseYmdQueryParam(searchParams.get("toYmd"));
  if (qFrom && qTo) {
    let fromYmd = qFrom;
    let toYmd = qTo;
    if (fromYmd > toYmd) [fromYmd, toYmd] = [toYmd, fromYmd];
    const t0 = new Date(`${fromYmd}T12:00:00.000Z`).getTime();
    const t1 = new Date(`${toYmd}T12:00:00.000Z`).getTime();
    const spanDays = Math.floor((t1 - t0) / 86400000) + 1;
    if (spanDays > MAX_DATE_RANGE_DAYS) {
      const clampFrom = new Date(t1 - (MAX_DATE_RANGE_DAYS - 1) * 86400000);
      fromYmd = formatBerlinYmdFromInstant(clampFrom);
    }
    return { fromYmd, toYmd, mode: "dateRange" };
  }
  const { fromYmd, toYmd } = berlinRecentWindow(recentDays);
  return { fromYmd, toYmd, mode: "recentDays" };
}

function orderInBerlinWindow(row: XentralOrderRow, fromYmd: string, toYmd: string): boolean {
  const ymd = row.orderDate?.slice(0, 10) ?? "";
  if (!ymd) return false;
  return ymd >= fromYmd && ymd <= toYmd;
}

function pageEntirelyBeforeBerlinFrom(rows: XentralOrderRow[], fromYmd: string): boolean {
  const dates = rows.map((r) => r.orderDate?.slice(0, 10)).filter(Boolean) as string[];
  if (!dates.length) return false;
  return dates.every((d) => d < fromYmd);
}

/**
 * Xentral liefert u. a. status: created | released | completed | canceled | unknown (API-Doku).
 * Abgeschlossene / stornierte Aufträge sind oft schreibgeschützt — Adressvalidierung entfällt.
 */
function extractXentralSalesOrderStatus(a: Record<string, unknown>): string | null {
  const raw = a.status;
  if (typeof raw === "string") return raw.trim() || null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const nested =
      pickFirstString(o.value) ?? pickFirstString(o.name) ?? pickFirstString(o.key) ?? pickFirstString(o.status);
    if (nested?.trim()) return nested.trim();
  }
  return (
    pickFirstString(a.orderStatus) ??
    pickFirstString(a.order_status) ??
    pickFirstString(a.state) ??
    pickFirstString(a.belegstatus) ??
    null
  );
}

/** Nur offene (bearbeitbare) Aufträge: Adressprüfung. Abgeschlossen / versendet / storniert: keine Prüfung. */
function shouldRunShippingAddressValidationForXentralOrder(status: string | null): boolean {
  if (!status?.trim()) return true;
  const n = status.trim().toLowerCase().replace(/\s+/g, " ");
  const skip = new Set([
    "completed",
    "complete",
    "abgeschlossen",
    "canceled",
    "cancelled",
    "storniert",
    "shipped",
    "versendet",
    "delivered",
    "geliefert",
  ]);
  if (skip.has(n)) return false;
  return true;
}

function mapToOrders(payload: unknown, projectById: Map<string, string>): XentralOrderRow[] | null {
  const root = payload as Record<string, unknown> | null;
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? (root?.data as unknown[])
      : [];
  if (!Array.isArray(candidates) || !candidates.length) return [];

  const rows: XentralOrderRow[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const a = extractAttributes(obj);

    const id =
      pickFirstString(obj.id) ??
      pickFirstString(a.id) ??
      pickFirstString(a.salesOrderId) ??
      "";

    const documentNumber =
      pickFirstString(a.documentNumber) ??
      pickFirstString(a.document_number) ??
      pickFirstString(a.number) ??
      pickFirstString(a.belegnummer) ??
      pickFirstString(a.orderNumber) ??
      pickFirstString(a.externalNumber) ??
      (id ? `#${id}` : "");

    const internetNumberRaw =
      pickFirstString(a.internetNumber) ??
      pickFirstString(a.internet_number) ??
      pickFirstString(a.internetnr) ??
      pickFirstString(a.internetNr) ??
      pickFirstString(a.onlineOrderNumber) ??
      pickFirstString(a.online_order_number) ??
      pickFirstString(a.externalOrderNumber) ??
      pickFirstString(a.external_order_number) ??
      pickFirstString(a.shopOrderNumber) ??
      pickFirstString(a.shop_order_number) ??
      pickFirstString(a.marketplaceOrderId) ??
      pickFirstString(a.marketplace_order_id) ??
      pickFirstString(a.channelOrderId) ??
      pickFirstString(a.channel_order_id) ??
      pickFirstString(a.reference) ??
      pickFirstString(a.referenceNumber) ??
      pickFirstString(a.reference_number) ??
      pickFirstString(a.externalNumber) ??
      pickFirstString(a.external_number) ??
      "";
    const internetNumber = internetNumberRaw.trim() || "—";

    const orderDateRaw =
      pickFirstString(a.orderDate) ??
      pickFirstString(a.order_date) ??
      pickFirstString(a.date) ??
      pickFirstString(a.documentDate) ??
      pickFirstString(a.createdAt) ??
      pickFirstString(a.created_at);

    const financials = a.financials as Record<string, unknown> | undefined;
    const deliveryBlock = a.delivery as Record<string, unknown> | undefined;
    const billingFromFinancials = financials?.billingAddress as Record<string, unknown> | undefined;
    const shippingFromDelivery = deliveryBlock?.shippingAddress as Record<string, unknown> | undefined;
    const billingAddressFlat = a.billingAddress as Record<string, unknown> | undefined;
    const shippingAddressFlat = a.shippingAddress as Record<string, unknown> | undefined;

    const shippingForValidation = shippingFromDelivery ?? shippingAddressFlat;
    const billingForValidation = billingFromFinancials ?? billingAddressFlat;

    const customer =
      pickFirstString(a.customerName) ??
      pickFirstString(a.customer_name) ??
      pickFirstString((a.customer as Record<string, unknown> | undefined)?.name) ??
      pickFirstString(billingFromFinancials?.name) ??
      pickFirstString(billingFromFinancials?.company) ??
      pickFirstString(shippingFromDelivery?.name) ??
      pickFirstString(shippingFromDelivery?.company) ??
      pickFirstString(shippingFromDelivery?.contactPerson) ??
      pickFirstString((a.billingAddress as Record<string, unknown> | undefined)?.company) ??
      pickFirstString((a.billingAddress as Record<string, unknown> | undefined)?.name) ??
      pickFirstString(a.companyName) ??
      pickFirstString(a.company) ??
      "—";

    const { primaryBlock } = primaryAddressContext({
      shipping: shippingForValidation,
      billing: billingForValidation,
    });
    const addressPrimaryFields = extractPrimaryAddressFieldsOneToOne(
      primaryBlock && typeof primaryBlock === "object" ? primaryBlock : undefined
    );

    const salesOrderStatus = extractXentralSalesOrderStatus(a);
    const runAddressValidation = shouldRunShippingAddressValidationForXentralOrder(salesOrderStatus);
    const { status: addressValidation, issues: addressValidationIssues } = runAddressValidation
      ? computeAddressValidation({
          shipping: shippingForValidation,
          billing: billingForValidation,
          customerDisplay: customer,
        })
      : { status: "ok" as ShippingAddressValidationStatus, issues: [] as string[] };

    const projectRef = a.project;
    const projectIdFromRef =
      projectRef && typeof projectRef === "object"
        ? pickFirstString((projectRef as Record<string, unknown>).id)
        : null;
    const projectIdFlat = pickFirstString(a.projectId) ?? pickFirstString(a.project_id);
    const projectId = projectIdFromRef ?? projectIdFlat;

    let marketplace = "—";
    if (projectId && projectById.has(projectId)) {
      marketplace = projectById.get(projectId)!;
    }
    if (marketplace === "—") {
      marketplace =
        pickFirstString(a.project) ??
        pickFirstString(a.projectName) ??
        pickFirstString(a.project_name) ??
        pickFirstString(a.projekt) ??
        pickFirstString((a.project as Record<string, unknown> | undefined)?.name as string | undefined) ??
        pickFirstString(
          (a.project as Record<string, unknown> | undefined)?.title as string | undefined
        ) ??
        "—";
    }

    marketplace = expandMarketplaceKeyName(marketplace);

    const currency =
      pickFirstString(a.currency) ??
      pickFirstString(a.currencyCode) ??
      pickFirstString(
        (a.totals as Record<string, unknown> | undefined)?.currency as string | undefined
      );

    const total =
      asNumber(a.totalGross) ??
      asNumber(a.total_gross) ??
      asNumber(a.grandTotal) ??
      asNumber(a.total) ??
      asNumber(a.amount) ??
      asNumber(a.brutto) ??
      asNumber((a.totals as Record<string, unknown> | undefined)?.gross) ??
      asNumber((a.totals as Record<string, unknown> | undefined)?.grandTotal);

    if (!id && !documentNumber) continue;

    rows.push({
      id: id || documentNumber,
      documentNumber: documentNumber || id,
      orderDate: orderDateRaw
        ? apiDateToBerlinYmd(orderDateRaw) ?? toDateYmd(orderDateRaw) ?? orderDateRaw.slice(0, 16)
        : null,
      customer,
      marketplace,
      total,
      currency,
      addressValidation,
      addressValidationIssues,
      addressEdited: false,
      addressPrimaryFields,
      internetNumber,
    });
  }

  return rows;
}

/** Neueste zuerst (Tabellenansicht), falls API-Reihenfolge gemischt ist. */
function sortOrdersByDateDesc(items: XentralOrderRow[]): XentralOrderRow[] {
  return [...items].sort((a, b) => {
    const da = a.orderDate?.slice(0, 10) ?? "";
    const db = b.orderDate?.slice(0, 10) ?? "";
    const c = db.localeCompare(da);
    if (c !== 0) return c;
    const mp = a.marketplace.localeCompare(b.marketplace);
    if (mp !== 0) return mp;
    return b.documentNumber.localeCompare(a.documentNumber);
  });
}

function parseTotalCount(payload: unknown): number | null {
  const root = payload as Record<string, unknown> | null;
  const extra = (root?.extra as Record<string, unknown> | undefined) ?? undefined;
  const totalCount = extra?.totalCount;
  if (typeof totalCount === "number" && Number.isFinite(totalCount)) return totalCount;
  return null;
}

/** Laut Xentral-Doku max. page[size] oft 50. */
const MAX_PAGE_SIZE = 50;

/** Reine Belegnummer-Pagination: wenn N Seiten ohne Datum < Fensterbeginn, weiter hinten kaum noch Treffer. */
const RECENT_DAYS_EMPTY_PAGE_STREAK = 18;

/** Ohne Sortierung ist die Reihenfolge undefiniert → Pagination liefert Lücken/Duplikate. */
function appendNewestFirstSort(url: URL, field: string) {
  url.searchParams.set("order[0][field]", field);
  url.searchParams.set("order[0][dir]", "desc");
}

/**
 * Viele Xentral-Instanzen erlauben nur `id` und `documentNumber` (nicht `date`).
 * Höhere Belegnummern ≈ neuere Aufträge → stabile Vollimport-Pagination.
 */
const SORT_FIELD_TRIES = ["documentNumber", "id"] as const;
type SortFieldTry = (typeof SORT_FIELD_TRIES)[number] | null;

async function fetchSalesOrdersPage(args: {
  baseUrl: string;
  token: string;
  apiPath: string;
  page: number;
  pageSize: number;
  sortField: SortFieldTry;
}) {
  const url = new URL(joinUrl(args.baseUrl, args.apiPath));
  url.searchParams.set("page[number]", String(args.page));
  url.searchParams.set("page[size]", String(args.pageSize));
  if (args.sortField) {
    appendNewestFirstSort(url, args.sortField);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${args.token}`,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }

  return { res, text, json, url: url.toString() };
}

async function fetchSalesOrdersForPath(args: {
  baseUrl: string;
  token: string;
  apiPath: string;
  pageNumber: number;
  pageSize: number;
  sortField: SortFieldTry;
}) {
  return fetchSalesOrdersPage({
    baseUrl: args.baseUrl,
    token: args.token,
    apiPath: args.apiPath,
    page: args.pageNumber,
    pageSize: args.pageSize,
    sortField: args.sortField,
  });
}

async function fetchFirstSalesOrdersPage(args: {
  baseUrl: string;
  token: string;
  orderPaths: string[];
  pageNumber: number;
  pageSize: number;
}): Promise<{
  first: Awaited<ReturnType<typeof fetchSalesOrdersPage>>;
  apiPath: string;
  sortField: SortFieldTry;
}> {
  let apiPath = args.orderPaths[0]!;

  async function tryPath(path: string, sortField: SortFieldTry) {
    let r = await fetchSalesOrdersForPath({
      baseUrl: args.baseUrl,
      token: args.token,
      apiPath: path,
      pageNumber: args.pageNumber,
      pageSize: args.pageSize,
      sortField,
    });
    if (
      (!r.res.ok || !r.json) &&
      (r.res.status === 404 || r.res.status === 405) &&
      args.orderPaths[1]
    ) {
      const alt = args.orderPaths[1]!;
      r = await fetchSalesOrdersForPath({
        baseUrl: args.baseUrl,
        token: args.token,
        apiPath: alt,
        pageNumber: args.pageNumber,
        pageSize: args.pageSize,
        sortField,
      });
      return { res: r, pathUsed: alt };
    }
    return { res: r, pathUsed: path };
  }

  for (const sf of SORT_FIELD_TRIES) {
    const { res: first, pathUsed } = await tryPath(apiPath, sf);
    apiPath = pathUsed;
    if (first.res.ok && first.json && first.res.status !== 401 && first.res.status !== 403) {
      return { first, apiPath, sortField: sf };
    }
    if (first.res.status === 401 || first.res.status === 403) {
      return { first, apiPath, sortField: sf };
    }
  }

  const { res: first, pathUsed } = await tryPath(args.orderPaths[0]!, null);
  apiPath = pathUsed;
  return { first, apiPath, sortField: null };
}

/** Fehler-Payload wie bisher als JSON — wird nicht im Integration-Cache gespeichert. */
export class XentralOrdersPayloadError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super("XentralOrdersPayloadError");
    this.name = "XentralOrdersPayloadError";
  }
}

export function buildXentralOrdersCacheKey(searchParams: URLSearchParams): string {
  const parts = ["all", "recentDays", "fromYmd", "toYmd", "limit", "page"]
    .map((k) => {
      const v = searchParams.get(k);
      return v == null || v === "" ? null : `${k}=${v}`;
    })
    .filter((x): x is string => Boolean(x))
    .sort();
  const h = createHash("sha256").update(parts.join("&")).digest("hex").slice(0, 24);
  return `xentral:orders:${h}`;
}

function parseOptionalEnvMs(name: string): number | null {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : null;
}

export function xentralOrdersCacheFreshMs(): number {
  return parseOptionalEnvMs("XENTRAL_ORDERS_CACHE_FRESH_MS") ?? marketplaceIntegrationFreshMs();
}

export function xentralOrdersCacheStaleMs(): number {
  const fresh = xentralOrdersCacheFreshMs();
  const fromEnv = parseOptionalEnvMs("XENTRAL_ORDERS_CACHE_STALE_MS");
  const fallback = marketplaceIntegrationStaleMs();
  return Math.max(fromEnv ?? fallback, fresh);
}

/**
 * Reine JSON-Payload (Erfolg). Bei Xentral-Fehlern: {@link XentralOrdersPayloadError} — kein Caching.
 * Für Prewarm / Cron: gleiche Funktion wie GET.
 */
export async function computeXentralOrdersPayload(
  request: Request,
  baseUrl: string,
  token: string
): Promise<Record<string, unknown>> {
  const { searchParams } = new URL(request.url);
  const fetchAll = searchParams.get("all") === "1";
  const rawRecentDays = Number(searchParams.get("recentDays") ?? "0");
  const recentDays =
    Number.isFinite(rawRecentDays) && rawRecentDays > 0
      ? Math.min(Math.floor(rawRecentDays), 366)
      : 0;
  const rawLimit = Number(searchParams.get("limit") ?? String(MAX_PAGE_SIZE)) || MAX_PAGE_SIZE;
  const pageSize = Math.min(Math.max(rawLimit, 5), MAX_PAGE_SIZE);
  const pageNumber = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);

  const orderPaths = ["api/v1/salesOrders", "api/v1/salesorders"];

  const effectivePageNumber = recentDays > 0 && !fetchAll ? 1 : pageNumber;

  const [projectById, { first, apiPath, sortField }] = await Promise.all([
    fetchXentralProjectByIdLookup({ baseUrl, token }),
    fetchFirstSalesOrdersPage({
      baseUrl,
      token,
      orderPaths,
      pageNumber: effectivePageNumber,
      pageSize,
    }),
  ]);

  if (!first.res.ok) {
    throw new XentralOrdersPayloadError(502, {
      error:
        first.res.status === 401
          ? "Xentral API: Unauthorized (401). Bitte Personal Access Token (PAT) prüfen."
          : "Xentral-Aufträge konnten nicht geladen werden (salesOrders).",
      status: first.res.status,
      debug:
        process.env.NODE_ENV !== "production"
          ? {
              baseUrl,
              hasToken: Boolean(token),
              pageNumber,
              pageSize,
              url: first.url,
            }
          : undefined,
      preview: (first.text ?? "").slice(0, 240),
    });
  }

  const linkMeta = buildSalesOrderWebLinkMeta(baseUrl);

  const firstItemsRaw = mapToOrders(first.json, projectById) ?? [];
  const firstItems = sortOrdersByDateDesc(firstItemsRaw);
  const totalCount = parseTotalCount(first.json) ?? firstItems.length;

  const maxItemsCap = 50_000;
  const maxPages = 1_000;

  if (fetchAll) {
    const items: XentralOrderRow[] = [...firstItems];
    let page = pageNumber + 1;
    while (items.length < totalCount && items.length < maxItemsCap && page <= maxPages) {
      const next = await fetchSalesOrdersPage({
        baseUrl,
        token,
        apiPath,
        page,
        pageSize,
        sortField,
      });
      if (!next.res.ok) break;
      const nextItems = mapToOrders(next.json, projectById) ?? [];
      if (!nextItems.length) break;
      items.push(...nextItems);
      page += 1;
    }

    const sorted = sortOrdersByDateDesc(items);

    return {
      items: sorted,
      totalCount,
      meta: {
        mode: "all",
        sortField: sortField ?? "none",
        order: "desc",
        fetched: sorted.length,
        cappedAt: maxItemsCap,
        ...linkMeta,
      },
    };
  }

  if (recentDays > 0) {
    const { fromYmd, toYmd, mode: recentMode } = resolveRecentFetchWindow(searchParams, recentDays);
    const matches: XentralOrderRow[] = firstItems.filter((r) => orderInBerlinWindow(r, fromYmd, toYmd));

    let emptyStreak = pageEntirelyBeforeBerlinFrom(firstItems, fromYmd) ? 1 : 0;
    let stoppedEarly = false;
    let apiPage = 2;

    while (apiPage <= maxPages && matches.length < maxItemsCap) {
      const next = await fetchSalesOrdersPage({
        baseUrl,
        token,
        apiPath,
        page: apiPage,
        pageSize,
        sortField,
      });
      if (!next.res.ok) break;
      const nextItems = mapToOrders(next.json, projectById) ?? [];
      if (!nextItems.length) break;

      for (const row of nextItems) {
        if (orderInBerlinWindow(row, fromYmd, toYmd)) matches.push(row);
      }

      if (pageEntirelyBeforeBerlinFrom(nextItems, fromYmd)) {
        emptyStreak += 1;
        if (emptyStreak >= RECENT_DAYS_EMPTY_PAGE_STREAK) {
          stoppedEarly = true;
          break;
        }
      } else {
        emptyStreak = 0;
      }

      apiPage += 1;
    }

    const sorted = sortOrdersByDateDesc(matches);

    return {
      items: sorted,
      totalCount,
      meta: {
        mode: recentMode,
        recentDays,
        fromYmd,
        toYmd,
        timeZone: "Europe/Berlin",
        sortField: sortField ?? "none",
        order: "desc",
        fetched: sorted.length,
        stoppedEarly,
        emptyPageStreakCap: RECENT_DAYS_EMPTY_PAGE_STREAK,
        maxDateRangeDays: MAX_DATE_RANGE_DAYS,
        ...linkMeta,
      },
    };
  }

  return {
    items: firstItems,
    totalCount,
    meta: {
      mode: "page",
      sortField: sortField ?? "none",
      order: "desc",
      pageNumber,
      pageSize,
      ...linkMeta,
    },
  };
}
