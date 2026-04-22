/**
 * Weekly Report Service.
 *
 * Aggregiert Sales-Daten + SKU-Breakdown aller Marktplätze (außer Shopify)
 * für eine ISO-Woche und vergleicht mit der Vorwoche.
 *
 * Datenquellen:
 * - `/api/{slug}/sales?from=&to=&compare=1&compareMode=previous` für Summen + Tagespunkte
 * - `marketplace_payouts.product_breakdown` direkt via admin-Client für SKU-Top-Listen
 *
 * Shopify ist hardcoded ausgeschlossen (`EXCLUDED_SLUGS`).
 */

import { createAdminClient } from "@/shared/lib/supabase/admin";
import { getIsoWeekDays, type IsoWeek } from "@/shared/lib/weeklyReport/isoWeekResolver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WeeklyMarketplaceTotals = {
  revenue: number;
  orders: number;
  avgOrderValue: number;
  returnRate: number;
  returnCount: number;
};

export type WeeklyTopSku = {
  sku: string;
  name: string;
  revenueCurrent: number;
  revenuePrevious: number;
  deltaPercent: number;
  ordersCurrent: number;
  ordersPrevious: number;
};

/** Mindest-Umsatz (in einer der Perioden) damit eine SKU in Top-Gewinner/Verlierer landet. */
export const TOP_SKU_REVENUE_THRESHOLD_EUR = 50;
/** Maximale Anzahl Top-Gewinner / Top-Verlierer pro Marktplatz. */
export const TOP_SKU_LIMIT = 20;

export type WeeklyMarketplaceData = {
  slug: string;
  name: string;
  logo: string;
  current: WeeklyMarketplaceTotals;
  previous: WeeklyMarketplaceTotals;
  deltas: {
    revenuePercent: number;
    ordersPercent: number;
    avgOrderValuePercent: number;
    returnRatePp: number;
  };
  /** 7 Tageswerte (Mo–So) der aktuellen Woche. Fehlende Tage = 0. */
  dailyRevenue: number[];
  /** Passend zu dailyRevenue: Ø-Preis-Tagesverlauf (Mo–So). */
  dailyOrders: number[];
  topGainers: WeeklyTopSku[];
  topLosers: WeeklyTopSku[];
  averagePriceTrend: {
    current: number;
    previous: number;
    deltaPercent: number;
  };
  /** Wenn Sales-Endpoint fehlschlug — Bericht zeigt Zeile mit Hinweis. */
  error?: string;
};

export type WeeklyReportNarrativeSegment =
  | { type: "text"; value: string }
  | { type: "metric"; value: string; trend: "up" | "down" | "flat" };

export type WeeklyReportNarrative = {
  text: string;
  segments: WeeklyReportNarrativeSegment[];
};

export type WeeklyReportTotals = {
  current: WeeklyMarketplaceTotals;
  previous: WeeklyMarketplaceTotals;
  deltas: {
    revenuePercent: number;
    ordersPercent: number;
    avgOrderValuePercent: number;
    returnRatePp: number;
  };
};

export type WeeklyReportData = {
  weeks: { current: IsoWeek; previous: IsoWeek };
  totals: WeeklyReportTotals;
  marketplaces: WeeklyMarketplaceData[];
  narrative: WeeklyReportNarrative;
};

// ---------------------------------------------------------------------------
// Konfig: welche Marktplätze + Endpoints
// ---------------------------------------------------------------------------

export const EXCLUDED_SLUGS = new Set<string>(["shopify"]);

type ReportMarketplaceConfig = {
  slug: string;
  name: string;
  logo: string;
  salesEndpoint: string;
  /** marketplace_payouts.marketplace_slug-Wert (Amazon nutzt amazon-de). */
  payoutSlug: string;
};

const REPORT_MARKETPLACES: ReportMarketplaceConfig[] = [
  {
    slug: "amazon",
    name: "Amazon DE",
    logo: "/brand/marketplaces/amazon.svg",
    salesEndpoint: "/api/amazon/sales",
    payoutSlug: "amazon-de",
  },
  {
    slug: "otto",
    name: "Otto",
    logo: "/brand/marketplaces/otto.svg",
    salesEndpoint: "/api/otto/sales",
    payoutSlug: "otto",
  },
  {
    slug: "ebay",
    name: "eBay",
    logo: "/brand/marketplaces/ebay.svg",
    salesEndpoint: "/api/ebay/sales",
    payoutSlug: "ebay",
  },
  {
    slug: "kaufland",
    name: "Kaufland",
    logo: "/brand/marketplaces/kaufland.svg",
    salesEndpoint: "/api/kaufland/sales",
    payoutSlug: "kaufland",
  },
  {
    slug: "fressnapf",
    name: "Fressnapf",
    logo: "/brand/marketplaces/fressnapf.svg",
    salesEndpoint: "/api/fressnapf/sales",
    payoutSlug: "fressnapf",
  },
  {
    slug: "mediamarkt-saturn",
    name: "MediaMarkt & Saturn",
    logo: "/brand/marketplaces/mediamarkt-saturn.svg",
    salesEndpoint: "/api/mediamarkt-saturn/sales",
    payoutSlug: "mediamarkt-saturn",
  },
  {
    slug: "zooplus",
    name: "Zooplus",
    logo: "/brand/marketplaces/zooplus.svg",
    salesEndpoint: "/api/zooplus/sales",
    payoutSlug: "zooplus",
  },
  {
    slug: "tiktok",
    name: "TikTok",
    logo: "/brand/marketplaces/tiktok.svg",
    salesEndpoint: "/api/tiktok/sales",
    payoutSlug: "tiktok",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const safeNumber = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return round1(((current - previous) / previous) * 100);
}

function emptyTotals(): WeeklyMarketplaceTotals {
  return { revenue: 0, orders: 0, avgOrderValue: 0, returnRate: 0, returnCount: 0 };
}

function totalsFromSales(args: {
  salesAmount: number;
  orderCount: number;
  returnedAmount: number;
}): WeeklyMarketplaceTotals {
  const revenue = round2(args.salesAmount);
  const orders = Math.round(args.orderCount);
  const avgOrderValue = orders > 0 ? round2(revenue / orders) : 0;
  // Heuristik: Retouren-Rate aus Retour-Betrag/Umsatz. Mangels Stückzahlen nutzen
  // wir Summen — passt für Präsentation.
  const returnRate = revenue > 0 ? round1((args.returnedAmount / revenue) * 100) : 0;
  return {
    revenue,
    orders,
    avgOrderValue,
    returnRate,
    returnCount: 0,
  };
}

function buildDailyRevenueSeries(week: IsoWeek, points: Array<{ date?: string; amount?: number }>): number[] {
  const days = getIsoWeekDays(week);
  const map = new Map<string, number>();
  for (const p of points) {
    if (typeof p?.date === "string" && typeof p?.amount === "number") {
      map.set(p.date.slice(0, 10), safeNumber(p.amount));
    }
  }
  return days.map((d) => round2(map.get(d) ?? 0));
}

function buildDailyOrdersSeries(week: IsoWeek, points: Array<{ date?: string; orders?: number }>): number[] {
  const days = getIsoWeekDays(week);
  const map = new Map<string, number>();
  for (const p of points) {
    if (typeof p?.date === "string" && typeof p?.orders === "number") {
      map.set(p.date.slice(0, 10), safeNumber(p.orders));
    }
  }
  return days.map((d) => Math.round(map.get(d) ?? 0));
}

// ---------------------------------------------------------------------------
// Sales-Endpoint-Fetch
// ---------------------------------------------------------------------------

type SalesEndpointResponse = {
  summary?: { salesAmount?: number; orderCount?: number };
  previousSummary?: { salesAmount?: number; orderCount?: number };
  netBreakdown?: { returnedAmount?: number };
  previousNetBreakdown?: { returnedAmount?: number };
  points?: Array<{ date?: string; amount?: number; orders?: number }>;
  previousPoints?: Array<{ date?: string; amount?: number; orders?: number }>;
};

async function fetchMarketplaceSales(args: {
  origin: string;
  cookieHeader: string;
  endpoint: string;
  fromCurrent: string;
  toCurrent: string;
}): Promise<SalesEndpointResponse> {
  const url = `${args.origin}${args.endpoint}?from=${args.fromCurrent}&to=${args.toCurrent}&compare=1&compareMode=previous`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: args.cookieHeader ? { cookie: args.cookieHeader } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  return (await res.json()) as SalesEndpointResponse;
}

// ---------------------------------------------------------------------------
// SKU-Top-Liste aus marketplace_payouts.product_breakdown
// ---------------------------------------------------------------------------

type ProductBreakdownEntry = {
  sku?: string;
  title?: string;
  gross?: number;
  units?: number;
};

type SkuAccumulator = { gross: number; units: number; name: string };

type PayoutRow = {
  period_from: string;
  period_to: string;
  product_breakdown: ProductBreakdownEntry[] | null;
};

type EnrichedSku = WeeklyTopSku & { absoluteShift: number };

const stripFields = (e: EnrichedSku): WeeklyTopSku => ({
  sku: e.sku,
  name: e.name,
  revenueCurrent: e.revenueCurrent,
  revenuePrevious: e.revenuePrevious,
  deltaPercent: e.deltaPercent,
  ordersCurrent: e.ordersCurrent,
  ordersPrevious: e.ordersPrevious,
});

function rankSkus(rows: EnrichedSku[]): { topGainers: WeeklyTopSku[]; topLosers: WeeklyTopSku[] } {
  const gainers = rows
    .filter((r) => r.absoluteShift > 0)
    .sort((a, b) => b.absoluteShift - a.absoluteShift)
    .slice(0, TOP_SKU_LIMIT)
    .map(stripFields);
  const losers = rows
    .filter((r) => r.absoluteShift < 0)
    .sort((a, b) => a.absoluteShift - b.absoluteShift)
    .slice(0, TOP_SKU_LIMIT)
    .map(stripFields);
  return { topGainers: gainers, topLosers: losers };
}

/**
 * Bevorzugte Quelle für Otto/Kaufland/Fressnapf/eBay/Zooplus/MMS/TikTok:
 * `/api/analytics/marketplace-article-sales` aggregiert Order-Line-Items mit
 * SKU + Title + Units direkt. Liefert null wenn der Marktplatz dort nicht
 * unterstützt ist (z. B. amazon → unsupported flag).
 */
async function fetchTopSkusViaArticleSales(args: {
  marketplaceSlug: string;
  current: IsoWeek;
  previous: IsoWeek;
  origin: string;
  cookieHeader: string;
}): Promise<{ topGainers: WeeklyTopSku[]; topLosers: WeeklyTopSku[] } | null> {
  const fromIso = args.current.start.toISOString().slice(0, 10);
  const toIso = args.current.end.toISOString().slice(0, 10);
  const url = `${args.origin}/api/analytics/marketplace-article-sales?marketplace=${encodeURIComponent(args.marketplaceSlug)}&from=${fromIso}&to=${toIso}`;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: args.cookieHeader ? { cookie: args.cookieHeader } : {},
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as
    | {
        unsupported?: boolean;
        items?: Array<{
          key?: string;
          title?: string;
          unitsCurrent?: number;
          unitsPrevious?: number;
          revenueCurrent?: number;
          revenuePrevious?: number;
        }>;
      }
    | null;
  if (!json || json.unsupported) return null;
  const items = Array.isArray(json.items) ? json.items : [];

  const enriched: EnrichedSku[] = [];
  for (const it of items) {
    const sku = (it.key ?? "").trim();
    if (!sku) continue;
    const revCurrent = safeNumber(it.revenueCurrent);
    const revPrevious = safeNumber(it.revenuePrevious);
    if (revCurrent === 0 && revPrevious === 0) continue;
    if (revCurrent < TOP_SKU_REVENUE_THRESHOLD_EUR && revPrevious < TOP_SKU_REVENUE_THRESHOLD_EUR) continue;
    enriched.push({
      sku,
      name: it.title ?? sku,
      revenueCurrent: round2(revCurrent),
      revenuePrevious: round2(revPrevious),
      deltaPercent: deltaPercent(revCurrent, revPrevious),
      ordersCurrent: Math.round(safeNumber(it.unitsCurrent)),
      ordersPrevious: Math.round(safeNumber(it.unitsPrevious)),
      absoluteShift: revCurrent - revPrevious,
    });
  }
  return rankSkus(enriched);
}

async function fetchTopSkus(args: {
  payoutSlug: string;
  current: IsoWeek;
  previous: IsoWeek;
}): Promise<{ topGainers: WeeklyTopSku[]; topLosers: WeeklyTopSku[] }> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { topGainers: [], topLosers: [] };
  }

  // Weites Fenster: letzte 60 Tage vor currentEnd, damit wir auch bi-wöchentliche
  // Amazon-Payouts erwischen die außerhalb der exakten ISO-Woche enden.
  const windowEndMs = args.current.end.getTime();
  const windowStartMs = windowEndMs - 60 * 86_400_000;
  const fromIso = new Date(windowStartMs).toISOString().slice(0, 10);
  const toIso = args.current.end.toISOString().slice(0, 10);

  const { data: rows } = await admin
    .from("marketplace_payouts")
    .select("period_from, period_to, product_breakdown")
    .eq("marketplace_slug", args.payoutSlug)
    .gte("period_to", fromIso)
    .lte("period_from", toIso)
    .not("product_breakdown", "is", null)
    .order("period_to", { ascending: false });

  if (!rows || rows.length === 0) return { topGainers: [], topLosers: [] };

  const typedRows = rows as PayoutRow[];
  const currStart = args.current.start.getTime();
  const currEnd = args.current.end.getTime();
  const prevStart = args.previous.start.getTime();
  const prevEnd = args.previous.end.getTime();

  const payoutInWeek = (row: PayoutRow, weekStartMs: number, weekEndMs: number): boolean => {
    const periodToTs = new Date(row.period_to).getTime();
    return periodToTs >= weekStartMs && periodToTs <= weekEndMs;
  };

  // Bucket 1: Direkt-Match per ISO-Woche (funktioniert für Otto / tägliche Payouts)
  let currentPayouts = typedRows.filter((r) => payoutInWeek(r, currStart, currEnd));
  let previousPayouts = typedRows.filter((r) => payoutInWeek(r, prevStart, prevEnd));

  // Fallback 1: Bi-wöchentliche Amazon-Payouts enden selten an ISO-Woche-Grenzen.
  // Wenn current leer ist, nimm den jüngsten Payout dessen period_to <= currEnd liegt.
  if (currentPayouts.length === 0) {
    const latest = typedRows.find((r) => new Date(r.period_to).getTime() <= currEnd);
    if (latest) currentPayouts = [latest];
  }

  // Fallback 2: Previous = der Payout DAVOR (nicht überlappend mit current).
  if (previousPayouts.length === 0 && currentPayouts.length > 0) {
    const currentMinFromMs = Math.min(
      ...currentPayouts.map((r) => new Date(r.period_from).getTime())
    );
    const olderPayouts = typedRows.filter(
      (r) => new Date(r.period_to).getTime() < currentMinFromMs
    );
    // Wenn olderPayouts mehrere Payouts enthält, aggregiere alle die in der
    // gleichen "Periode" (∼Länge wie current) liegen.
    if (olderPayouts.length > 0) {
      const currentWindowSpan = Math.max(
        ...currentPayouts.map((r) => new Date(r.period_to).getTime() - new Date(r.period_from).getTime())
      );
      const latestOlderToMs = new Date(olderPayouts[0].period_to).getTime();
      previousPayouts = olderPayouts.filter(
        (r) => new Date(r.period_to).getTime() >= latestOlderToMs - currentWindowSpan
      );
    }
  }

  const currMap = new Map<string, SkuAccumulator>();
  const prevMap = new Map<string, SkuAccumulator>();
  const bumpMap = (map: Map<string, SkuAccumulator>, sku: string, name: string, gross: number, units: number) => {
    const existing = map.get(sku);
    if (existing) {
      existing.gross += gross;
      existing.units += units;
    } else {
      map.set(sku, { gross, units, name });
    }
  };

  const accumulate = (payouts: PayoutRow[], target: Map<string, SkuAccumulator>) => {
    for (const row of payouts) {
      const entries = (row.product_breakdown ?? []) as ProductBreakdownEntry[];
      for (const e of entries) {
        const sku = (e.sku ?? "").trim();
        if (!sku) continue;
        const gross = safeNumber(e.gross);
        const units = safeNumber(e.units);
        const name = e.title ?? sku;
        bumpMap(target, sku, name, gross, units);
      }
    }
  };

  accumulate(currentPayouts, currMap);
  accumulate(previousPayouts, prevMap);

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[weeklyReport:topSkus] ${args.payoutSlug} KW${args.current.week}: ` +
        `${typedRows.length} payouts in window, ` +
        `currentPayouts=${currentPayouts.length} (${currentPayouts.map((r) => `${r.period_from}→${r.period_to}`).join(",")}), ` +
        `previousPayouts=${previousPayouts.length} (${previousPayouts.map((r) => `${r.period_from}→${r.period_to}`).join(",")}), ` +
        `currSkus=${currMap.size}, prevSkus=${prevMap.size}`
    );
  }

  const allSkus = new Set<string>([...currMap.keys(), ...prevMap.keys()]);
  const rowsBuilt: EnrichedSku[] = [];

  for (const sku of allSkus) {
    const curr = currMap.get(sku);
    const prev = prevMap.get(sku);
    const revCurrent = curr?.gross ?? 0;
    const revPrevious = prev?.gross ?? 0;
    if (revCurrent === 0 && revPrevious === 0) continue;
    if (revCurrent < TOP_SKU_REVENUE_THRESHOLD_EUR && revPrevious < TOP_SKU_REVENUE_THRESHOLD_EUR) continue;
    rowsBuilt.push({
      sku,
      name: curr?.name ?? prev?.name ?? sku,
      revenueCurrent: round2(revCurrent),
      revenuePrevious: round2(revPrevious),
      deltaPercent: deltaPercent(revCurrent, revPrevious),
      ordersCurrent: Math.round(curr?.units ?? 0),
      ordersPrevious: Math.round(prev?.units ?? 0),
      absoluteShift: revCurrent - revPrevious,
    });
  }

  return rankSkus(rowsBuilt);
}

// ---------------------------------------------------------------------------
// Pro-Marktplatz-Aggregat
// ---------------------------------------------------------------------------

async function buildMarketplaceData(args: {
  config: ReportMarketplaceConfig;
  origin: string;
  cookieHeader: string;
  current: IsoWeek;
  previous: IsoWeek;
}): Promise<WeeklyMarketplaceData> {
  const { config, current, previous } = args;
  const fromCurrent = current.start.toISOString().slice(0, 10);
  const toCurrent = current.end.toISOString().slice(0, 10);

  const placeholder: WeeklyMarketplaceData = {
    slug: config.slug,
    name: config.name,
    logo: config.logo,
    current: emptyTotals(),
    previous: emptyTotals(),
    deltas: { revenuePercent: 0, ordersPercent: 0, avgOrderValuePercent: 0, returnRatePp: 0 },
    dailyRevenue: [0, 0, 0, 0, 0, 0, 0],
    dailyOrders: [0, 0, 0, 0, 0, 0, 0],
    topGainers: [],
    topLosers: [],
    averagePriceTrend: { current: 0, previous: 0, deltaPercent: 0 },
  };

  let sales: SalesEndpointResponse | null = null;
  try {
    sales = await fetchMarketplaceSales({
      origin: args.origin,
      cookieHeader: args.cookieHeader,
      endpoint: config.salesEndpoint,
      fromCurrent,
      toCurrent,
    });
  } catch (err) {
    return {
      ...placeholder,
      error: err instanceof Error ? err.message : "Sales-Daten konnten nicht geladen werden.",
    };
  }

  const currentTotals = totalsFromSales({
    salesAmount: safeNumber(sales.summary?.salesAmount),
    orderCount: safeNumber(sales.summary?.orderCount),
    returnedAmount: safeNumber(sales.netBreakdown?.returnedAmount),
  });
  const previousTotals = totalsFromSales({
    salesAmount: safeNumber(sales.previousSummary?.salesAmount),
    orderCount: safeNumber(sales.previousSummary?.orderCount),
    returnedAmount: safeNumber(sales.previousNetBreakdown?.returnedAmount),
  });

  const deltas = {
    revenuePercent: deltaPercent(currentTotals.revenue, previousTotals.revenue),
    ordersPercent: deltaPercent(currentTotals.orders, previousTotals.orders),
    avgOrderValuePercent: deltaPercent(currentTotals.avgOrderValue, previousTotals.avgOrderValue),
    returnRatePp: round1(currentTotals.returnRate - previousTotals.returnRate),
  };

  const dailyRevenue = buildDailyRevenueSeries(current, sales.points ?? []);
  const dailyOrders = buildDailyOrdersSeries(current, sales.points ?? []);

  let topGainers: WeeklyTopSku[] = [];
  let topLosers: WeeklyTopSku[] = [];
  try {
    // 1. Bevorzugt: Order-Line-Items via /api/analytics/marketplace-article-sales
    //    (liefert Title aus Plattform-Daten, exakte Stückzahlen, ISO-Wochen-genau).
    const fromArticleSales = await fetchTopSkusViaArticleSales({
      marketplaceSlug: config.slug,
      current,
      previous,
      origin: args.origin,
      cookieHeader: args.cookieHeader,
    });

    if (fromArticleSales) {
      topGainers = fromArticleSales.topGainers;
      topLosers = fromArticleSales.topLosers;
    }

    // 2. Fallback: marketplace_payouts.product_breakdown
    //    - immer für Amazon (article-sales liefert dort `unsupported`)
    //    - auch wenn article-sales leer war (z. B. Otto-Orders ohne SKU/Title)
    if (topGainers.length === 0 && topLosers.length === 0) {
      const fromPayouts = await fetchTopSkus({
        payoutSlug: config.payoutSlug,
        current,
        previous,
      });
      topGainers = fromPayouts.topGainers;
      topLosers = fromPayouts.topLosers;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[weeklyReport:topSkus:${config.slug}] articleSales=${fromArticleSales ? `${fromArticleSales.topGainers.length}+${fromArticleSales.topLosers.length}` : "null"} → final ${topGainers.length}+${topLosers.length}`
      );
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[weeklyReport:topSkus:${config.slug}] error`, err);
    }
  }

  return {
    slug: config.slug,
    name: config.name,
    logo: config.logo,
    current: currentTotals,
    previous: previousTotals,
    deltas,
    dailyRevenue,
    dailyOrders,
    topGainers,
    topLosers,
    averagePriceTrend: {
      current: currentTotals.avgOrderValue,
      previous: previousTotals.avgOrderValue,
      deltaPercent: deltas.avgOrderValuePercent,
    },
  };
}

// ---------------------------------------------------------------------------
// Concurrency-Drossel
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Narrative-Generator
// ---------------------------------------------------------------------------

function trendOf(value: number): "up" | "down" | "flat" {
  if (value > 0.5) return "up";
  if (value < -0.5) return "down";
  return "flat";
}

function formatPercent(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1).replace(".", ",")} %`;
}

function formatEur(v: number): string {
  return `${Math.round(v).toLocaleString("de-DE")} €`;
}

function buildNarrative(args: {
  totals: WeeklyReportTotals;
  marketplaces: WeeklyMarketplaceData[];
}): WeeklyReportNarrative {
  const { totals, marketplaces } = args;
  const eligible = marketplaces.filter((m) => m.current.revenue > 0 || m.previous.revenue > 0);

  const winner = [...eligible].sort((a, b) => b.deltas.revenuePercent - a.deltas.revenuePercent)[0];
  const loser = [...eligible].sort((a, b) => a.deltas.revenuePercent - b.deltas.revenuePercent)[0];

  const revPct = totals.deltas.revenuePercent;

  const segments: WeeklyReportNarrativeSegment[] = [];
  segments.push({ type: "text", value: "Gesamtumsatz " });
  segments.push({ type: "metric", value: formatPercent(revPct), trend: trendOf(revPct) });
  segments.push({ type: "text", value: " auf " });
  segments.push({ type: "metric", value: formatEur(totals.current.revenue), trend: "flat" });

  if (winner && winner.deltas.revenuePercent > 0) {
    segments.push({ type: "text", value: " · " });
    segments.push({ type: "text", value: `${winner.name} ` });
    segments.push({
      type: "metric",
      value: formatPercent(winner.deltas.revenuePercent),
      trend: "up",
    });
    segments.push({ type: "text", value: " dominiert" });
  }
  if (loser && loser.deltas.revenuePercent < 0 && loser.slug !== winner?.slug) {
    segments.push({ type: "text", value: " · " });
    segments.push({ type: "text", value: `${loser.name} ` });
    segments.push({
      type: "metric",
      value: formatPercent(loser.deltas.revenuePercent),
      trend: "down",
    });
    segments.push({ type: "text", value: " schwächelt" });
  }

  const text = segments
    .map((s) => s.value)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return { text, segments };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GetWeeklyReportArgs = {
  current: IsoWeek;
  previous: IsoWeek;
  origin: string;
  cookieHeader: string;
};

export async function getWeeklyReport(args: GetWeeklyReportArgs): Promise<WeeklyReportData> {
  const { current, previous, origin, cookieHeader } = args;

  const includedConfigs = REPORT_MARKETPLACES.filter((m) => !EXCLUDED_SLUGS.has(m.slug));

  const marketplaces = await mapWithConcurrency(includedConfigs, 3, (config) =>
    buildMarketplaceData({ config, origin, cookieHeader, current, previous })
  );

  // Totale aufsummieren
  const sumTotals = (key: keyof WeeklyMarketplaceTotals): number =>
    marketplaces.reduce((acc, m) => acc + (m.current[key] as number), 0);
  const sumPrevTotals = (key: keyof WeeklyMarketplaceTotals): number =>
    marketplaces.reduce((acc, m) => acc + (m.previous[key] as number), 0);

  const currentRev = round2(sumTotals("revenue"));
  const currentOrders = sumTotals("orders");
  const previousRev = round2(sumPrevTotals("revenue"));
  const previousOrders = sumPrevTotals("orders");

  const currentReturnedAmount = marketplaces.reduce(
    (acc, m) => acc + (m.current.returnRate / 100) * m.current.revenue,
    0
  );
  const previousReturnedAmount = marketplaces.reduce(
    (acc, m) => acc + (m.previous.returnRate / 100) * m.previous.revenue,
    0
  );
  const currentReturnRate = currentRev > 0 ? round1((currentReturnedAmount / currentRev) * 100) : 0;
  const previousReturnRate = previousRev > 0 ? round1((previousReturnedAmount / previousRev) * 100) : 0;

  const totals: WeeklyReportTotals = {
    current: {
      revenue: currentRev,
      orders: currentOrders,
      avgOrderValue: currentOrders > 0 ? round2(currentRev / currentOrders) : 0,
      returnRate: currentReturnRate,
      returnCount: 0,
    },
    previous: {
      revenue: previousRev,
      orders: previousOrders,
      avgOrderValue: previousOrders > 0 ? round2(previousRev / previousOrders) : 0,
      returnRate: previousReturnRate,
      returnCount: 0,
    },
    deltas: {
      revenuePercent: deltaPercent(currentRev, previousRev),
      ordersPercent: deltaPercent(currentOrders, previousOrders),
      avgOrderValuePercent: deltaPercent(
        currentOrders > 0 ? currentRev / currentOrders : 0,
        previousOrders > 0 ? previousRev / previousOrders : 0
      ),
      returnRatePp: round1(currentReturnRate - previousReturnRate),
    },
  };

  const narrative = buildNarrative({ totals, marketplaces });

  // Marktplätze nach Umsatz absteigend sortieren (für UI / Default)
  marketplaces.sort((a, b) => b.current.revenue - a.current.revenue);

  // Artikel-Namen aus Xentral anreichern (1 Fetch für alle SKUs gesammelt)
  await enrichTopSkuNames({
    marketplaces,
    origin,
    cookieHeader,
  });

  return {
    weeks: { current, previous },
    totals,
    marketplaces,
    narrative,
  };
}

/**
 * Enrichment: reichert topGainers/topLosers mit Artikel-Namen an.
 * Reihenfolge:
 *   1. Bestehender Name aus Order-Line-Items (article-sales) — schon gesetzt
 *   2. Marktplatz-Katalog `/api/{slug}/products?all=1` (Amazon, Otto, ...) — pro MP separat
 *   3. Xentral-Stammdaten — letzter Fallback
 */
async function enrichTopSkuNames(args: {
  marketplaces: WeeklyMarketplaceData[];
  origin: string;
  cookieHeader: string;
}): Promise<void> {
  const hasAnySkus = args.marketplaces.some(
    (mp) => mp.topGainers.length > 0 || mp.topLosers.length > 0
  );
  if (!hasAnySkus) return;

  // Pass 1: pro Marktplatz Katalog laden + Namen füllen
  await mapWithConcurrency(args.marketplaces, 3, async (mp) => {
    if (mp.topGainers.length === 0 && mp.topLosers.length === 0) return;
    const needs = (item: WeeklyTopSku) => !item.name || item.name === item.sku;
    if (![...mp.topGainers, ...mp.topLosers].some(needs)) return;

    let mpMap: Map<string, string>;
    try {
      mpMap = await fetchMarketplaceProductNameMap({
        slug: mp.slug,
        origin: args.origin,
        cookieHeader: args.cookieHeader,
      });
    } catch {
      return;
    }
    if (mpMap.size === 0) return;
    const fill = (item: WeeklyTopSku) => {
      if (!needs(item)) return;
      const t = mpMap.get(item.sku.toLowerCase());
      if (t) item.name = t;
    };
    for (const item of mp.topGainers) fill(item);
    for (const item of mp.topLosers) fill(item);
  });

  // Pass 2: Xentral als Fallback für noch fehlende
  const stillMissing = args.marketplaces.some((mp) =>
    [...mp.topGainers, ...mp.topLosers].some((i) => !i.name || i.name === i.sku)
  );
  if (!stillMissing) return;

  let xentralMap: Map<string, string>;
  try {
    xentralMap = await fetchXentralNameMap(args.origin, args.cookieHeader);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[weeklyReport:enrichNames] Xentral fetch fehlgeschlagen:", err);
    }
    return;
  }
  for (const mp of args.marketplaces) {
    for (const item of [...mp.topGainers, ...mp.topLosers]) {
      if (item.name && item.name !== item.sku) continue;
      const fromXentral = xentralMap.get(item.sku.toLowerCase());
      if (fromXentral) item.name = fromXentral;
    }
  }
}

async function fetchMarketplaceProductNameMap(args: {
  slug: string;
  origin: string;
  cookieHeader: string;
}): Promise<Map<string, string>> {
  const url = `${args.origin}/api/${args.slug}/products?all=1`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: args.cookieHeader ? { cookie: args.cookieHeader } : {},
  });
  const map = new Map<string, string>();
  if (!res.ok) return map;
  const json = (await res.json().catch(() => null)) as {
    items?: Array<{ sku?: string; title?: string; name?: string }>;
  } | null;
  if (!json?.items) return map;
  for (const it of json.items) {
    const sku = (it.sku ?? "").trim();
    const title = (it.title ?? it.name ?? "").trim();
    if (sku && title) map.set(sku.toLowerCase(), title);
  }
  return map;
}

async function fetchXentralNameMap(origin: string, cookieHeader: string): Promise<Map<string, string>> {
  const url = `${origin}/api/xentral/articles?limit=2000&includeSales=0&includePrices=0`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = (await res.json().catch(() => null)) as {
    items?: Array<{ sku?: string; name?: string }>;
  } | null;
  const map = new Map<string, string>();
  if (!json?.items) return map;
  for (const a of json.items) {
    const sku = (a.sku ?? "").trim();
    const name = (a.name ?? "").trim();
    if (sku && name) map.set(sku.toLowerCase(), name);
  }
  return map;
}
