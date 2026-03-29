/**
 * Summiert verkaufte Mengen je SKU und Projekt aus Xentral-Lieferscheinen im Kalenderfenster (Europe/Berlin ymd).
 *
 * Quelle (bevorzugt): REST `api/v3/deliveryNotes` mit `include=lineItems,project,lineItems.product` (Positionsmengen = gelieferte Stückzahl).
 * Fallback: `api/v1/deliveryNotes` (camelCase-Variante), JSON:API-Listen inkl. `included`-Positionen.
 * Datumsfilter: `documentDate` (Belegdatum), sonst `createdAt` — in Europe/Berlin als Kalendertag.
 */

import {
  extractAttributes,
  joinUrl,
  pickFirstString,
} from "@/shared/lib/xentralProjectLookup";
import {
  consolidateArticleForecastSoldByProject,
  normalizeArticleForecastProjectLabel,
} from "@/shared/lib/xentralArticleForecastProject";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDateYmd(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return null;
}

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

/** Belegdatum Lieferschein (v1 JSON:API + v3 flaches Objekt). */
export function extractDeliveryNoteYmdFromItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const a = extractAttributes(obj);
  const raw =
    pickFirstString(a.documentDate) ??
    pickFirstString(a.document_date) ??
    pickFirstString(obj.documentDate) ??
    pickFirstString(a.createdAt) ??
    pickFirstString(obj.createdAt) ??
    pickFirstString(a.updatedAt) ??
    pickFirstString(obj.updatedAt) ??
    pickFirstString(a.date) ??
    pickFirstString(a.orderDate);
  if (!raw) return null;
  return apiDateToBerlinYmd(raw) ?? toDateYmd(raw) ?? raw.slice(0, 10);
}

function extractLineSkuQty(line: Record<string, unknown>): { sku: string; quantity: number } | null {
  const po = extractAttributes(line);
  let sku =
    pickFirstString(po.sku) ??
    pickFirstString(po.SKU) ??
    pickFirstString(po.productSku) ??
    pickFirstString(po.articleNumber) ??
    pickFirstString(po.artikelnummer) ??
    pickFirstString(po.articleSku) ??
    pickFirstString(po.number);
  const prod = po.product;
  if (!sku?.trim() && prod && typeof prod === "object" && !Array.isArray(prod)) {
    const pa = extractAttributes(prod as Record<string, unknown>);
    sku =
      pickFirstString(pa.sku) ??
      pickFirstString(pa.SKU) ??
      pickFirstString(pa.number) ??
      pickFirstString(pa.nummer) ??
      pickFirstString(pa.articleNumber) ??
      pickFirstString(pa.artikelnummer);
  }
  const qty =
    asNumber(po.quantity) ??
    asNumber(po.qty) ??
    asNumber(po.amount) ??
    asNumber(po.quantityOrdered) ??
    asNumber(po.menge) ??
    asNumber(po.count) ??
    asNumber(po.quantityShipped);
  if (!sku?.trim() || qty == null || !Number.isFinite(qty) || qty <= 0) return null;
  return { sku: sku.trim(), quantity: qty };
}

function tryExtractFromPositionArray(raw: unknown): Array<{ sku: string; quantity: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ sku: string; quantity: number }> = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const hit = extractLineSkuQty(p as Record<string, unknown>);
    if (hit) out.push(hit);
  }
  return out;
}

const DELIVERY_NOTE_REL_KEYS = [
  "lineItems",
  "deliveryNoteLineItems",
  "deliveryNotePositions",
  "positions",
  "items",
  "lines",
  "positionen",
];

function extractFromIncludedLineItems(
  obj: Record<string, unknown>,
  root: Record<string, unknown>,
  relKeys: readonly string[]
): Array<{ sku: string; quantity: number }> {
  const rel = obj.relationships as Record<string, unknown> | undefined;
  if (!rel) return [];
  const includedRaw = root.included;
  if (!Array.isArray(includedRaw)) return [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const inc of includedRaw) {
    if (!inc || typeof inc !== "object") continue;
    const o = inc as Record<string, unknown>;
    const type = pickFirstString(o.type);
    const id = pickFirstString(o.id);
    if (type && id) byKey.set(`${type}:${id}`, o);
  }

  const out: Array<{ sku: string; quantity: number }> = [];
  for (const key of relKeys) {
    const block = rel[key];
    if (!block || typeof block !== "object") continue;
    const data = (block as Record<string, unknown>).data;
    const refs = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
    for (const ref of refs) {
      if (!ref || typeof ref !== "object") continue;
      const r = ref as Record<string, unknown>;
      const type = pickFirstString(r.type);
      const id = pickFirstString(r.id);
      if (!type || !id) continue;
      const inc = byKey.get(`${type}:${id}`);
      if (!inc) continue;
      const hit = extractLineSkuQty(inc);
      if (hit) out.push(hit);
    }
    if (out.length) return out;
  }
  return out;
}

function extractPositionsFromDeliveryNoteItem(
  item: Record<string, unknown>,
  root: Record<string, unknown>
): Array<{ sku: string; quantity: number }> {
  const a = extractAttributes(item);
  const arrays = [
    a.lineItems,
    a.deliveryNoteLineItems,
    a.deliveryNotePositions,
    a.positions,
    a.items,
    a.lines,
    a.positionen,
    a.salesOrderPositions,
  ];
  for (const arr of arrays) {
    const got = tryExtractFromPositionArray(arr);
    if (got.length) return got;
  }
  return extractFromIncludedLineItems(item, root, DELIVERY_NOTE_REL_KEYS);
}

/** v3 API: `lineItems[].number` ≈ SKU, `quantity` geliefert. */
function linesFromV3DeliveryNote(doc: Record<string, unknown>): Array<{ sku: string; quantity: number }> {
  const raw = doc.lineItems;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ sku: string; quantity: number }> = [];
  for (const line of raw) {
    if (!line || typeof line !== "object") continue;
    const l = line as Record<string, unknown>;
    if (pickFirstString(l.type) === "page_break") continue;
    let sku = pickFirstString(l.number);
    const prod = l.product;
    if ((!sku || !sku.trim()) && prod && typeof prod === "object" && !Array.isArray(prod)) {
      sku = pickFirstString((prod as Record<string, unknown>).number);
    }
    const qty = asNumber(l.quantity);
    if (!sku?.trim() || qty == null || !Number.isFinite(qty) || qty <= 0) continue;
    out.push({ sku: sku.trim(), quantity: qty });
  }
  return out;
}

function resolveMarketplaceLabel(
  a: Record<string, unknown>,
  projectById: Map<string, string>
): string {
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
      pickFirstString((a.project as Record<string, unknown> | undefined)?.name) ??
      pickFirstString((a.project as Record<string, unknown> | undefined)?.title) ??
      "—";
  }
  return normalizeArticleForecastProjectLabel(marketplace);
}

function resolveMarketplaceLabelForDeliveryNote(
  doc: Record<string, unknown>,
  projectById: Map<string, string>
): string {
  const proj = doc.project;
  if (proj && typeof proj === "object" && !Array.isArray(proj)) {
    const p = proj as Record<string, unknown>;
    const pid = pickFirstString(p.id);
    if (pid && projectById.has(pid)) {
      return normalizeArticleForecastProjectLabel(projectById.get(pid)!);
    }
    const pname = pickFirstString(p.name);
    if (pname?.trim()) return normalizeArticleForecastProjectLabel(pname);
  }
  return resolveMarketplaceLabel(extractAttributes(doc), projectById);
}

function isCanceledDeliveryNote(doc: Record<string, unknown>, a: Record<string, unknown>): boolean {
  const s = (pickFirstString(a.status) ?? pickFirstString(doc.status) ?? "").toLowerCase();
  return s === "canceled" || s === "cancelled" || s === "storniert";
}

function orderInBerlinWindow(ymd: string | null, fromYmd: string, toYmd: string): boolean {
  if (!ymd) return false;
  return ymd >= fromYmd && ymd <= toYmd;
}

function pageEntirelyBeforeBerlinFromPayload(payload: unknown, fromYmd: string): boolean {
  const root = payload as Record<string, unknown> | null;
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data)
      ? (root.data as unknown[])
      : [];
  const dates = candidates
    .map((item) => extractDeliveryNoteYmdFromItem(item))
    .filter((d): d is string => Boolean(d));
  if (!dates.length) return false;
  return dates.every((d) => d < fromYmd);
}

const MAX_PAGE_SIZE = 50;
const V1_SORT_FIELD_TRIES = ["documentDate", "documentNumber", "id", "createdAt"] as const;
type V1SortFieldTry = (typeof V1_SORT_FIELD_TRIES)[number] | null;
const RECENT_DAYS_EMPTY_PAGE_STREAK = 18;
const AGG_MAX_PAGES_HARD = 800;
const V1_DELIVERY_NOTE_PATHS: [string, string] = ["api/v1/deliveryNotes", "api/v1/deliverynotes"];

/**
 * Max. Anzahl Listenseiten (Lieferscheine) pro Artikelprognose-Request.
 */
export function resolveSalesAggMaxPages(): number {
  const raw = Number(process.env.XENTRAL_SALES_AGG_MAX_PAGES);
  const fallback = 120;
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  return Math.min(AGG_MAX_PAGES_HARD, Math.max(5, n));
}

function appendV1NewestFirstSort(url: URL, field: string) {
  url.searchParams.set("order[0][field]", field);
  url.searchParams.set("order[0][dir]", "desc");
}

export async function fetchV1DeliveryNotesPage(args: {
  baseUrl: string;
  token: string;
  apiPath: string;
  page: number;
  pageSize: number;
  sortField: V1SortFieldTry;
}) {
  const url = new URL(joinUrl(args.baseUrl, args.apiPath));
  url.searchParams.set("page[number]", String(args.page));
  url.searchParams.set("page[size]", String(args.pageSize));
  if (args.sortField) {
    appendV1NewestFirstSort(url, args.sortField);
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

export async function fetchV3DeliveryNotesPage(args: {
  baseUrl: string;
  token: string;
  page: number;
  perPage: number;
}) {
  const url = new URL(joinUrl(args.baseUrl, "api/v3/deliveryNotes"));
  url.searchParams.set("page", String(args.page));
  url.searchParams.set("perPage", String(args.perPage));
  url.searchParams.set("sort", "-documentDate");
  url.searchParams.set("include", "lineItems,project,lineItems.product");

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

export function v3LastPageFromPayload(payload: unknown): number | null {
  const meta = (payload as Record<string, unknown> | undefined)?.meta as
    | Record<string, unknown>
    | undefined;
  const lp = asNumber(meta?.lastPage);
  if (lp == null || lp < 1) return null;
  return Math.floor(lp);
}

export async function fetchFirstV1DeliveryNotesPage(args: {
  baseUrl: string;
  token: string;
  pageNumber: number;
  pageSize: number;
}): Promise<{
  first: Awaited<ReturnType<typeof fetchV1DeliveryNotesPage>>;
  apiPath: string;
  sortField: V1SortFieldTry;
}> {
  let apiPath: string = V1_DELIVERY_NOTE_PATHS[0]!;

  async function tryPath(path: string, sortField: V1SortFieldTry) {
    let r = await fetchV1DeliveryNotesPage({
      baseUrl: args.baseUrl,
      token: args.token,
      apiPath: path,
      page: args.pageNumber,
      pageSize: args.pageSize,
      sortField,
    });
    if (
      (!r.res.ok || !r.json) &&
      (r.res.status === 404 || r.res.status === 405) &&
      V1_DELIVERY_NOTE_PATHS[1]
    ) {
      const alt = V1_DELIVERY_NOTE_PATHS[1];
      r = await fetchV1DeliveryNotesPage({
        baseUrl: args.baseUrl,
        token: args.token,
        apiPath: alt,
        page: args.pageNumber,
        pageSize: args.pageSize,
        sortField,
      });
      return { res: r, pathUsed: alt };
    }
    return { res: r, pathUsed: path };
  }

  for (const sf of V1_SORT_FIELD_TRIES) {
    const { res: first, pathUsed } = await tryPath(apiPath, sf);
    apiPath = pathUsed;
    if (first.res.ok && first.json && first.res.status !== 401 && first.res.status !== 403) {
      return { first, apiPath, sortField: sf };
    }
    if (first.res.status === 401 || first.res.status === 403) {
      return { first, apiPath, sortField: sf };
    }
  }

  const { res: first, pathUsed } = await tryPath(V1_DELIVERY_NOTE_PATHS[0], null);
  apiPath = pathUsed;
  return { first, apiPath, sortField: null };
}

export type ExtractedDeliverySaleLine = {
  ymd: string;
  skuKey: string;
  marketplaceLabel: string;
  quantity: number;
};

/**
 * Eine API-Seite Lieferscheine → flache Verkaufslinien (für Cache-Sync).
 */
export function extractSalesLinesFromDeliveryNotesPage(
  payload: unknown,
  projectById: Map<string, string>,
  source: "v3" | "v1"
): ExtractedDeliverySaleLine[] {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const out: ExtractedDeliverySaleLine[] = [];
  for (const item of candidatesFromPayload(payload)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const ymd = extractDeliveryNoteYmdFromItem(item);
    if (!ymd) continue;
    const a = extractAttributes(obj);
    if (isCanceledDeliveryNote(obj, a)) continue;

    const marketplaceLabel =
      source === "v3"
        ? resolveMarketplaceLabelForDeliveryNote(obj, projectById)
        : resolveMarketplaceLabel(a, projectById);

    const lines =
      source === "v3" ? linesFromV3DeliveryNote(obj) : extractPositionsFromDeliveryNoteItem(obj, root);

    for (const { sku, quantity } of lines) {
      const key = sku.trim().toLowerCase();
      if (!key) continue;
      out.push({ ymd, skuKey: key, marketplaceLabel, quantity });
    }
  }
  return out;
}

export type SkuSalesWindowAggregationMeta = {
  deliveryNotesInWindow: number;
  lineItemsParsed: number;
  pagesFetched: number;
  stoppedEarly: boolean;
  hitSalesPageCap: boolean;
  listOk: boolean;
  listStatus?: number;
  /** v3 mit Positions-Include, sonst v1-Liste. */
  source: "v3_delivery_notes" | "v1_delivery_notes";
  /** Nur bei Datei-Cache: Tage mit Einträgen im gewählten Cache-Schnitt */
  cacheDaysUsed?: number;
  liveWindowFromYmd?: string;
  liveWindowToYmd?: string;
};

export type SkuSalesWindowAggregationResult = {
  bySku: Map<string, { soldByProject: Record<string, number>; totalSold: number }>;
  meta: SkuSalesWindowAggregationMeta;
};

export function candidatesFromPayload(payload: unknown): unknown[] {
  const root = payload as Record<string, unknown> | null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(root?.data)) return root.data as unknown[];
  return [];
}

export async function aggregateSkuSalesInBerlinWindow(args: {
  baseUrl: string;
  token: string;
  projectById: Map<string, string>;
  fromYmd: string;
  toYmd: string;
  pageSize?: number;
}): Promise<SkuSalesWindowAggregationResult> {
  const pageSize = Math.min(Math.max(args.pageSize ?? MAX_PAGE_SIZE, 5), MAX_PAGE_SIZE);
  const pageCap = resolveSalesAggMaxPages();

  const v3First = await fetchV3DeliveryNotesPage({
    baseUrl: args.baseUrl,
    token: args.token,
    page: 1,
    perPage: pageSize,
  });

  const useV3 =
    v3First.res.ok &&
    v3First.json &&
    v3First.res.status !== 401 &&
    v3First.res.status !== 403;

  if (useV3) {
    return aggregateFromV3DeliveryNotes({
      ...args,
      pageSize,
      pageCap,
      first: v3First,
    });
  }

  const { first, apiPath, sortField } = await fetchFirstV1DeliveryNotesPage({
    baseUrl: args.baseUrl,
    token: args.token,
    pageNumber: 1,
    pageSize,
  });

  const emptyMeta: SkuSalesWindowAggregationMeta = {
    deliveryNotesInWindow: 0,
    lineItemsParsed: 0,
    pagesFetched: 0,
    stoppedEarly: false,
    hitSalesPageCap: false,
    listOk: first.res.ok,
    listStatus: first.res.status,
    source: "v1_delivery_notes",
  };

  if (!first.res.ok || !first.json) {
    return { bySku: new Map(), meta: emptyMeta };
  }

  const bySku = new Map<string, { soldByProject: Record<string, number> }>();
  let deliveryNotesInWindow = 0;
  let lineItemsParsed = 0;
  let pagesFetched = 0;
  let emptyStreak = pageEntirelyBeforeBerlinFromPayload(first.json, args.fromYmd) ? 1 : 0;

  function processV1Payload(payload: unknown) {
    const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    for (const item of candidatesFromPayload(payload)) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const ymd = extractDeliveryNoteYmdFromItem(item);
      if (!orderInBerlinWindow(ymd, args.fromYmd, args.toYmd)) continue;

      const a = extractAttributes(obj);
      if (isCanceledDeliveryNote(obj, a)) continue;

      const marketplaceLabel = resolveMarketplaceLabel(a, args.projectById);
      const lines = extractPositionsFromDeliveryNoteItem(obj, root);
      deliveryNotesInWindow += 1;
      lineItemsParsed += lines.length;

      for (const { sku, quantity } of lines) {
        const key = sku.trim().toLowerCase();
        if (!key) continue;
        let rec = bySku.get(key);
        if (!rec) {
          rec = { soldByProject: {} };
          bySku.set(key, rec);
        }
        rec.soldByProject[marketplaceLabel] = (rec.soldByProject[marketplaceLabel] ?? 0) + quantity;
      }
    }
  }

  processV1Payload(first.json);
  pagesFetched = 1;

  let hitSalesPageCap = false;
  let apiPage = 2;
  while (apiPage <= pageCap) {
    const next = await fetchV1DeliveryNotesPage({
      baseUrl: args.baseUrl,
      token: args.token,
      apiPath,
      page: apiPage,
      pageSize,
      sortField,
    });
    if (!next.res.ok || !next.json) break;
    processV1Payload(next.json);
    pagesFetched += 1;

    if (pageEntirelyBeforeBerlinFromPayload(next.json, args.fromYmd)) {
      emptyStreak += 1;
      // Nur Abbruch: ältere Seiten können nichts mehr zum Fenster [fromYmd,to] liefern.
      // Kein stoppedEarly — sonst false positive („unvollständig“) obwohl alle Treffer schon gezählt sind.
      if (emptyStreak >= RECENT_DAYS_EMPTY_PAGE_STREAK) {
        break;
      }
    } else {
      emptyStreak = 0;
    }

    if (!candidatesFromPayload(next.json).length) break;

    if (apiPage >= pageCap) {
      hitSalesPageCap = true;
      break;
    }

    apiPage += 1;
  }

  const resultMap = new Map<string, { soldByProject: Record<string, number>; totalSold: number }>();
  for (const [sku, rec] of bySku) {
    const soldByProject = consolidateArticleForecastSoldByProject(rec.soldByProject);
    const totalSold = Object.values(soldByProject).reduce((s, n) => s + n, 0);
    resultMap.set(sku, { soldByProject, totalSold });
  }

  return {
    bySku: resultMap,
    meta: {
      deliveryNotesInWindow,
      lineItemsParsed,
      pagesFetched,
      stoppedEarly: hitSalesPageCap,
      hitSalesPageCap,
      listOk: true,
      listStatus: first.res.status,
      source: "v1_delivery_notes",
    },
  };
}

async function aggregateFromV3DeliveryNotes(args: {
  baseUrl: string;
  token: string;
  projectById: Map<string, string>;
  fromYmd: string;
  toYmd: string;
  pageSize: number;
  pageCap: number;
  first: Awaited<ReturnType<typeof fetchV3DeliveryNotesPage>>;
}): Promise<SkuSalesWindowAggregationResult> {
  const { baseUrl, token, projectById, fromYmd, toYmd, pageSize, pageCap, first } = args;

  const emptyMeta: SkuSalesWindowAggregationMeta = {
    deliveryNotesInWindow: 0,
    lineItemsParsed: 0,
    pagesFetched: 0,
    stoppedEarly: false,
    hitSalesPageCap: false,
    listOk: first.res.ok,
    listStatus: first.res.status,
    source: "v3_delivery_notes",
  };

  if (!first.res.ok || !first.json) {
    return { bySku: new Map(), meta: emptyMeta };
  }

  const bySku = new Map<string, { soldByProject: Record<string, number> }>();
  let deliveryNotesInWindow = 0;
  let lineItemsParsed = 0;
  let pagesFetched = 0;
  let stoppedEarly = false;
  let emptyStreak = pageEntirelyBeforeBerlinFromPayload(first.json, fromYmd) ? 1 : 0;
  const lastPageKnown = v3LastPageFromPayload(first.json);
  const effectiveLastPage =
    lastPageKnown != null ? Math.min(lastPageKnown, pageCap) : pageCap;

  function processV3Payload(payload: unknown) {
    for (const item of candidatesFromPayload(payload)) {
      if (!item || typeof item !== "object") continue;
      const doc = item as Record<string, unknown>;
      const ymd = extractDeliveryNoteYmdFromItem(doc);
      if (!orderInBerlinWindow(ymd, fromYmd, toYmd)) continue;

      const a = extractAttributes(doc);
      if (isCanceledDeliveryNote(doc, a)) continue;

      const marketplaceLabel = resolveMarketplaceLabelForDeliveryNote(doc, projectById);
      const lines = linesFromV3DeliveryNote(doc);
      deliveryNotesInWindow += 1;
      lineItemsParsed += lines.length;

      for (const { sku, quantity } of lines) {
        const key = sku.trim().toLowerCase();
        if (!key) continue;
        let rec = bySku.get(key);
        if (!rec) {
          rec = { soldByProject: {} };
          bySku.set(key, rec);
        }
        rec.soldByProject[marketplaceLabel] = (rec.soldByProject[marketplaceLabel] ?? 0) + quantity;
      }
    }
  }

  processV3Payload(first.json);
  pagesFetched = 1;

  let hitSalesPageCap = false;
  for (let page = 2; page <= effectiveLastPage; page += 1) {
    const next = await fetchV3DeliveryNotesPage({
      baseUrl,
      token,
      page,
      perPage: pageSize,
    });
    if (!next.res.ok || !next.json) break;
    processV3Payload(next.json);
    pagesFetched += 1;

    if (pageEntirelyBeforeBerlinFromPayload(next.json, fromYmd)) {
      emptyStreak += 1;
      if (emptyStreak >= RECENT_DAYS_EMPTY_PAGE_STREAK) {
        break;
      }
    } else {
      emptyStreak = 0;
    }

    if (!candidatesFromPayload(next.json).length) break;
  }

  if (lastPageKnown != null && lastPageKnown > pageCap) {
    hitSalesPageCap = true;
    stoppedEarly = true;
  } else if (lastPageKnown == null && pagesFetched >= pageCap) {
    hitSalesPageCap = true;
    stoppedEarly = true;
  }

  const resultMap = new Map<string, { soldByProject: Record<string, number>; totalSold: number }>();
  for (const [sku, rec] of bySku) {
    const soldByProject = consolidateArticleForecastSoldByProject(rec.soldByProject);
    const totalSold = Object.values(soldByProject).reduce((s, n) => s + n, 0);
    resultMap.set(sku, { soldByProject, totalSold });
  }

  return {
    bySku: resultMap,
    meta: {
      deliveryNotesInWindow,
      lineItemsParsed,
      pagesFetched,
      stoppedEarly: stoppedEarly || hitSalesPageCap,
      hitSalesPageCap,
      listOk: true,
      listStatus: first.res.status,
      source: "v3_delivery_notes",
    },
  };
}
