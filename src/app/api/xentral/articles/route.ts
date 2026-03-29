import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import {
  normalizeArticleForecastProjectLabel,
  clampForecastDateRange,
  parseForecastYmdParam,
} from "@/shared/lib/xentralArticleForecastProject";
import {
  extractAttributes,
  fetchXentralProjectByIdLookup,
  joinUrl,
  pickFirstString,
} from "@/shared/lib/xentralProjectLookup";
import { aggregateSkuSalesWithFileCache } from "@/shared/lib/xentralDeliverySalesCache";

type XentralArticle = {
  sku: string;
  name: string;
  stock: number;
  /** Bestand je Lagerplatz/Standort, falls die API eine Aufschlüsselung liefert; sonst leer. */
  stockByLocation: Record<string, number>;
  /** Verkaufspreis aus Xentral, falls im API-Objekt vorhanden (Referenz für Preisgleichheit). */
  price: number | null;
  /** Xentral-Projekt-ID, falls am Artikel gesetzt. */
  projectId: string | null;
  /** Aufgelöster Projekt-/Marktplatzname (wie bei Bestellungen). */
  projectDisplay: string;
  /** Gesamt verkaufte Menge (API-Felder oder Summe der Projektspalten). */
  totalSold: number;
  /** Verkaufsmengen je Projektname — Basis für dynamische Tabellenspalten. */
  soldByProject: Record<string, number>;
};

type XentralArticleRaw = {
  sku: string;
  name: string;
  stock: number;
  stockByLocation: Record<string, number>;
  price: number | null;
  projectId: string | null;
  totalSold: number;
  soldByProjectRaw: Record<string, number>;
};

const EXCLUDED_NAME_TERMS = [
  "Versandtasche",
  "Versandkarton",
  "B-Ware",
  "Ersatzteil",
  "Volkswagen",
  // Messestand / Zubehör (Beispiele aus deinem Export)
  "Messestand",
  "Kabeltrommel",
  "Mehrfachsteckdose",
  "Beachflag",
  "Pixlip",
  "Staubsauger",
  "Cubes",
  "Schwerlastwagen",
  "Hubwagen",
  "Fernseher",
  "Tablet",
];

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

async function getSupabaseSecret(key: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("integration_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return "";
  const value = (data?.value as string | undefined) ?? "";
  return value.trim();
}

async function resolveXentralConfig() {
  const baseUrl = env("XENTRAL_BASE_URL") || (await getSupabaseSecret("XENTRAL_BASE_URL"));
  const token =
    env("XENTRAL_PAT") ||
    env("XENTRAL_KEY") ||
    (await getSupabaseSecret("XENTRAL_PAT")) ||
    (await getSupabaseSecret("XENTRAL_KEY"));

  return { baseUrl, token };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isNumericOnly(value: string) {
  return /^[0-9]+$/.test(value.trim());
}

function shouldExcludeArticle(args: { sku: string; name: string }) {
  const name = args.name.trim().toLowerCase();
  const sku = args.sku.trim();

  // Messestand-SKUs (z.B. MS-...) generell ausblenden
  if (/^MS-/i.test(sku)) return true;

  if (sku && isNumericOnly(sku)) return true;

  for (const term of EXCLUDED_NAME_TERMS) {
    if (name.includes(term.toLowerCase())) return true;
  }

  return false;
}

function extractSoldByProjectRaw(a: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const blobs: unknown[] = [
    a.salesByChannel,
    a.projectSales,
    a.salesPerProject,
    a.salesByProject,
    (a.statistics as Record<string, unknown> | undefined)?.byProject,
    (a.statistics as Record<string, unknown> | undefined)?.salesByProject,
  ];
  for (const raw of blobs) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const n = asNumber(v);
        if (n != null && Number.isFinite(n)) {
          out[k] = (out[k] ?? 0) + n;
        }
      }
    }
  }
  return out;
}

/**
 * Versucht, Bestände je Lagerplatz/Standort aus typischen Xentral-/JSON:API-Feldern zu lesen.
 * Schlüssel sind Anzeigenamen (roh aus der API); die UI normalisiert die Beschriftung.
 */
function extractStockByLocation(a: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};

  const add = (label: string | null, qty: number | null) => {
    if (!label?.trim() || qty == null || !Number.isFinite(qty)) return;
    const k = label.trim();
    out[k] = (out[k] ?? 0) + qty;
  };

  const collectFromRowish = (row: unknown) => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    const ra = extractAttributes(r);
    const storageLoc = ra.storageLocation ?? r.storageLocation;
    const storageNameFromRef =
      storageLoc && typeof storageLoc === "object"
        ? pickFirstString(
            extractAttributes(storageLoc as Record<string, unknown>).name
          ) ?? pickFirstString((storageLoc as Record<string, unknown>).name)
        : null;
    const lagerplatzRef = ra.lagerplatz ?? r.lagerplatz;
    const lagerplatzName =
      lagerplatzRef && typeof lagerplatzRef === "object"
        ? pickFirstString(
            extractAttributes(lagerplatzRef as Record<string, unknown>).name
          ) ??
          pickFirstString(
            extractAttributes(lagerplatzRef as Record<string, unknown>).bezeichnung
          )
        : null;

    const label =
      pickFirstString(ra.name) ??
      pickFirstString(ra.label) ??
      pickFirstString(ra.title) ??
      pickFirstString(ra.storageLocationName) ??
      pickFirstString(ra.lagerplatzName) ??
      (typeof ra.lagerplatz === "string" ? ra.lagerplatz : null) ??
      lagerplatzName ??
      storageNameFromRef ??
      pickFirstString(ra.locationName) ??
      pickFirstString(ra.binName) ??
      pickFirstString(ra.warehouseName) ??
      null;

    const qty =
      asNumber(ra.quantity) ??
      asNumber(ra.stock) ??
      asNumber(ra.count) ??
      asNumber(ra.bestand) ??
      asNumber(ra.availableCount) ??
      asNumber(ra.amount) ??
      asNumber(ra.quantityAvailable);

    add(label, qty);
  };

  const walkArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) collectFromRowish(it);
  };

  walkArray(a.stockPositions);
  walkArray(a.stocks);
  walkArray(a.storageStocks);
  walkArray(a.warehouseStocks);
  walkArray(a.lagerplaetze);
  walkArray(a.stockAllocations);
  walkArray(a.inventoryPositions);

  const stats = a.stockStats;
  if (stats && typeof stats === "object" && !Array.isArray(stats)) {
    const s = stats as Record<string, unknown>;
    walkArray(s.locations);
    walkArray(s.storageLocations);
    walkArray(s.positions);
    walkArray(s.stocks);
    for (const ob of [s.byLocation, s.byStorageLocation, s.perLocation, s.byWarehouse]) {
      if (ob && typeof ob === "object" && !Array.isArray(ob)) {
        for (const [k, v] of Object.entries(ob as Record<string, unknown>)) {
          add(k, asNumber(v));
        }
      }
    }
  }

  return out;
}

function extractTotalSold(a: Record<string, unknown>, soldByProjectRaw: Record<string, number>): number {
  const direct =
    asNumber(a.soldQuantity) ??
    asNumber(a.totalSold) ??
    asNumber(a.salesQuantity) ??
    asNumber(a.verkauft) ??
    asNumber(a.lifetimeSales) ??
    asNumber((a.statistics as Record<string, unknown> | undefined)?.sold) ??
    asNumber((a.statistics as Record<string, unknown> | undefined)?.totalSold) ??
    asNumber((a.statistics as Record<string, unknown> | undefined)?.quantitySold) ??
    null;
  if (direct != null && Number.isFinite(direct) && direct > 0) return direct;
  const sum = Object.values(soldByProjectRaw).reduce((x, y) => x + y, 0);
  return sum > 0 ? sum : 0;
}

function mapToArticlesRaw(payload: unknown): XentralArticleRaw[] | null {
  const root = payload as Record<string, unknown> | null;
  const candidates: unknown[] =
    Array.isArray(payload) ? payload : Array.isArray(root?.data) ? (root?.data as unknown[]) : [];
  if (!Array.isArray(candidates) || !candidates.length) return [];

  const rows: XentralArticleRaw[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const a = extractAttributes(obj);

    const sku =
      pickFirstString(a.sku) ??
      pickFirstString(a.SKU) ??
      pickFirstString(obj.sku) ??
      pickFirstString(obj.SKU) ??
      pickFirstString(a.number) ??
      pickFirstString(a.nummer) ??
      pickFirstString(a.articleNumber) ??
      pickFirstString(a.artikelnummer) ??
      "";

    const name =
      pickFirstString(a.name) ??
      pickFirstString(a.bezeichnung) ??
      pickFirstString(a.titel) ??
      pickFirstString(a.artikelname) ??
      pickFirstString(obj.name) ??
      "";

    const stockByLocation = extractStockByLocation(a);
    const sumByLocation = Object.values(stockByLocation).reduce((x, y) => x + y, 0);

    const aggregateStock =
      asNumber(a.stock) ??
      asNumber(a.bestand) ??
      asNumber(a.lagerbestand) ??
      asNumber(a.availableCount) ??
      asNumber((a.stockStats as Record<string, unknown> | undefined)?.availableCount) ??
      asNumber((a.stockStats as Record<string, unknown> | undefined)?.totalCount) ??
      asNumber(a.stockCount) ??
      asNumber(a.on_hand) ??
      asNumber(obj.stock) ??
      0;

    const stock =
      Object.keys(stockByLocation).length > 0 ? sumByLocation : aggregateStock;

    const price =
      asNumber(a.verkaufspreis) ??
      asNumber(a.salesPrice) ??
      asNumber((a.sales as Record<string, unknown> | undefined)?.price) ??
      asNumber(a.price) ??
      asNumber(a.listPrice) ??
      asNumber(a.listprice) ??
      asNumber(a.uvp) ??
      asNumber(a.bruttopreis) ??
      asNumber(a.nettopreis) ??
      asNumber(a.unitPrice) ??
      asNumber((a.pricing as Record<string, unknown> | undefined)?.gross) ??
      null;

    const projectRef = a.project;
    const projectIdFromRef =
      projectRef && typeof projectRef === "object"
        ? pickFirstString((projectRef as Record<string, unknown>).id)
        : null;
    const projectIdFlat =
      pickFirstString(a.projectId) ??
      pickFirstString(a.project_id) ??
      pickFirstString(a.projekt) ??
      null;
    const projectId = projectIdFromRef ?? projectIdFlat ?? null;

    const soldByProjectRaw = extractSoldByProjectRaw(a);
    const totalSold = extractTotalSold(a, soldByProjectRaw);

    if (!sku && !name) continue;
    if (shouldExcludeArticle({ sku, name })) continue;
    rows.push({
      sku,
      name,
      stock,
      stockByLocation,
      price,
      projectId,
      totalSold,
      soldByProjectRaw,
    });
  }

  return rows;
}

function enrichArticles(rows: XentralArticleRaw[], projectById: Map<string, string>): XentralArticle[] {
  return rows.map((r) => {
    let projectDisplay = "—";
    if (r.projectId) {
      const mapped = projectById.get(r.projectId);
      projectDisplay = normalizeArticleForecastProjectLabel((mapped ?? r.projectId).trim() || "—");
    }

    const soldByProject: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.soldByProjectRaw)) {
      const keyTrim = k.trim();
      const isNumericKey = /^[0-9]+$/.test(keyTrim);
      const label =
        isNumericKey && projectById.has(keyTrim)
          ? normalizeArticleForecastProjectLabel(projectById.get(keyTrim)!)
          : normalizeArticleForecastProjectLabel(k);
      soldByProject[label] = (soldByProject[label] ?? 0) + v;
    }

    if (Object.keys(soldByProject).length === 0 && r.totalSold > 0 && projectDisplay !== "—") {
      soldByProject[projectDisplay] = r.totalSold;
    }

    const sumCols = Object.values(soldByProject).reduce((acc, n) => acc + n, 0);
    const totalSold = sumCols > 0 ? sumCols : r.totalSold;

    return {
      sku: r.sku,
      name: r.name,
      stock: r.stock,
      stockByLocation: { ...r.stockByLocation },
      price: r.price,
      projectId: r.projectId,
      projectDisplay,
      totalSold,
      soldByProject,
    };
  });
}

function parseTotalCount(payload: unknown): number | null {
  const root = payload as Record<string, unknown> | null;
  const extra = (root?.extra as Record<string, unknown> | undefined) ?? undefined;
  const totalCount = extra?.totalCount;
  return asNumber(totalCount);
}

export async function GET(request: Request) {
  const { baseUrl, token } = await resolveXentralConfig();

  if (!baseUrl || !token) {
    return NextResponse.json(
      {
        error:
          "Xentral ist nicht konfiguriert. Bitte Env Vars setzen oder Supabase Tabelle 'integration_secrets' befüllen.",
        missing: {
          XENTRAL_BASE_URL: !baseUrl,
          XENTRAL_PAT_or_KEY: !token,
        },
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const fetchAll = searchParams.get("all") === "1";
  const rawLimit = Number(searchParams.get("limit") ?? "150") || 150;
  const pageSize = Math.min(Math.max(rawLimit, 10), 150);
  const pageNumber = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);

  async function fetchPage(page: number) {
    const url = new URL(joinUrl(baseUrl, "api/v1/products"));
    url.searchParams.set("page[number]", String(page));
    url.searchParams.set("page[size]", String(pageSize));
    if (query) {
      url.searchParams.set("filter[0][key]", "search");
      url.searchParams.set("filter[0][value]", query);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
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

  const first = await fetchPage(pageNumber);
  if (!first.res.ok || !first.json) {
    return NextResponse.json(
      {
        error:
          first.res.status === 401
            ? "Xentral API: Unauthorized (401). Bitte Personal Access Token (PAT) in .env.local setzen."
            : "Xentral API konnte nicht gelesen werden. Token/Endpoint prüfen.",
        status: first.res.status,
        debug:
          process.env.NODE_ENV !== "production"
            ? {
                baseUrl,
                hasToken: Boolean(token),
                tokenLength: token.length,
                tokenHasPipe: token.includes("|"),
                pageNumber,
                pageSize,
                url: first.url,
              }
            : undefined,
        preview: (first.text ?? "").slice(0, 240),
      },
      { status: 502 }
    );
  }

  const projectById = await fetchXentralProjectByIdLookup({ baseUrl, token });
  const firstRaw = mapToArticlesRaw(first.json) ?? [];
  const firstItems = enrichArticles(firstRaw, projectById);
  const totalCount = parseTotalCount(first.json) ?? firstItems.length;

  const qFrom = parseForecastYmdParam(searchParams.get("fromYmd"));
  const qTo = parseForecastYmdParam(searchParams.get("toYmd"));

  async function withOptionalSalesWindow(items: XentralArticle[]): Promise<{
    items: XentralArticle[];
    meta?: Record<string, unknown>;
  }> {
    if (!qFrom || !qTo) return { items };
    const { fromYmd, toYmd } = clampForecastDateRange(qFrom, qTo);
    const agg = await aggregateSkuSalesWithFileCache({
      baseUrl,
      token,
      projectById,
      fromYmd,
      toYmd,
    });
    const next = items.map((row) => {
      const hit = agg.bySku.get(row.sku.trim().toLowerCase());
      if (hit) {
        return {
          ...row,
          soldByProject: hit.soldByProject,
          totalSold: hit.totalSold,
        };
      }
      return { ...row, soldByProject: {}, totalSold: 0 };
    });
    return {
      items: next,
      meta: {
        salesWindow: {
          fromYmd,
          toYmd,
          deliveryNotesInWindow: agg.meta.deliveryNotesInWindow,
          lineItemsParsed: agg.meta.lineItemsParsed,
          pagesFetched: agg.meta.pagesFetched,
          stoppedEarly: agg.meta.stoppedEarly,
          hitSalesPageCap: agg.meta.hitSalesPageCap,
          listOk: agg.meta.listOk,
          listStatus: agg.meta.listStatus,
          source: agg.meta.source,
          cacheDaysUsed: agg.meta.cacheDaysUsed,
          liveWindowFromYmd: agg.meta.liveWindowFromYmd,
          liveWindowToYmd: agg.meta.liveWindowToYmd,
        },
      },
    };
  }

  if (!fetchAll) {
    const { items, meta } = await withOptionalSalesWindow(firstItems);
    return NextResponse.json({ items, totalCount, meta });
  }

  const rawAccum: XentralArticleRaw[] = [...firstRaw];
  const maxItems = 20_000;
  const maxPages = 400;
  let page = pageNumber + 1;
  while (rawAccum.length < totalCount && rawAccum.length < maxItems && page <= maxPages) {
    const next = await fetchPage(page);
    if (!next.res.ok || !next.json) break;
    const nextRaw = mapToArticlesRaw(next.json) ?? [];
    if (!nextRaw.length) break;
    rawAccum.push(...nextRaw);
    page += 1;
  }

  const enriched = enrichArticles(rawAccum, projectById);
  const { items, meta } = await withOptionalSalesWindow(enriched);
  return NextResponse.json({ items, totalCount, meta });
}

