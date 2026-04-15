import { differenceInCalendarDays, format } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { MAX_ANALYTICS_RANGE_DAYS } from "@/shared/lib/analytics-date-range";
import type { MarketplaceReportRow } from "@/app/(dashboard)/analytics/marketplaces/MarketplaceReportPrintView";
import {
  PLACEHOLDER,
  type SalesCompareResponse,
  type TrendDirection,
} from "@/shared/lib/marketplace-sales-types";

/**
 * Reine Hilfsfunktionen für die Analytics-Marktplätze-Ansicht.
 * Alle Funktionen sind seiteneffektfrei und frei testbar.
 */

export const MAX_RANGE_DAYS = MAX_ANALYTICS_RANGE_DAYS;
export const MARKETPLACE_FETCH_TIMEOUT_MS = 60_000;
export const AMAZON_FETCH_TIMEOUT_MS = 120_000;
export const TOTAL_STRIP_MAX_BLOCK_MS = 15_000;

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function defaultPeriod(): { from: string; to: string } {
  const to = startOfLocalDay(new Date());
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: toYmd(from), to: toYmd(to) };
}

export function formatRangeShort(fromYmd: string, toYmd: string, dfLocale: DateFnsLocale): string {
  const a = parseYmdLocal(fromYmd);
  const b = parseYmdLocal(toYmd);
  if (fromYmd === toYmd) return format(a, "d. MMM yyyy", { locale: dfLocale });
  return `${format(a, "d. MMM", { locale: dfLocale })} – ${format(b, "d. MMM yyyy", { locale: dfLocale })}`;
}

export async function fetchSalesCompareWithTimeout<T extends { error?: string }>(
  url: string,
  fallbackErrorMessage: string,
  timeoutMs = MARKETPLACE_FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    let payload: T;
    try {
      payload = (await res.json()) as T;
    } catch {
      throw new Error(fallbackErrorMessage);
    }
    if (!res.ok) {
      throw new Error(payload.error ?? fallbackErrorMessage);
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Zeitlimit erreicht. Bitte erneut versuchen.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function inclusiveDayCount(fromYmd: string, toYmd: string): number {
  return differenceInCalendarDays(parseYmdLocal(toYmd), parseYmdLocal(fromYmd)) + 1;
}

export function kpiLabelsForPeriod(
  periodFrom: string,
  periodTo: string,
  dfLocale: DateFnsLocale,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  const span = formatRangeShort(periodFrom, periodTo, dfLocale);
  return {
    revenue: t("analyticsMp.revenueWithSpan", { span }),
    orders: t("analyticsMp.orders"),
    units: t("analyticsMp.units"),
    trend: t("analyticsMp.trendDelta"),
  };
}

/** Berechnet Delta-% als formatierten String (z. B. "+12,3 %" oder "−4,1 %"). */
export function formatDeltaPct(
  current: number,
  previous: number,
  locale: string
): string | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return undefined;
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return undefined;
  const abs = Math.abs(pct);
  const formatted = abs.toLocaleString(locale, { maximumFractionDigits: 1 });
  if (pct > 0.05) return `+${formatted} %`;
  if (pct < -0.05) return `−${formatted} %`;
  return "±0 %";
}

/** Bestimmt Trend-Richtung aus Delta-%. */
export function trendFromDelta(current: number, previous: number): TrendDirection {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return "unknown";
  const pct = ((current - previous) / previous) * 100;
  if (pct > 0.5) return "up";
  if (pct < -0.5) return "down";
  return "flat";
}

export function formatCurrency(amount: number, currency: string, intlTag: string) {
  return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount || 0);
}

export function formatInt(n: number, intlTag: string) {
  return new Intl.NumberFormat(intlTag).format(n ?? 0);
}

export function safePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return (part / whole) * 100;
}

export function calcYoY(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatPercent(
  value: number | null | undefined,
  intlTag: string,
  signed = false
): string {
  if (value == null || !Number.isFinite(value)) return PLACEHOLDER;
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString(intlTag, { maximumFractionDigits: 1 })} %`;
}

export function formatTrendPct(
  revenueDeltaPct: number | null | undefined,
  previousAmount: number,
  currentAmount: number,
  intlTag: string,
  t: (key: string) => string
): { text: string; direction: TrendDirection } {
  if (revenueDeltaPct != null && Number.isFinite(revenueDeltaPct)) {
    if (Math.abs(revenueDeltaPct) < 0.05) {
      return { text: t("analyticsMp.trendFlat"), direction: "flat" };
    }
    const sign = revenueDeltaPct > 0 ? "+" : "";
    return {
      text: `${sign}${revenueDeltaPct.toLocaleString(intlTag, { maximumFractionDigits: 1 })} %`,
      direction: revenueDeltaPct > 0 ? "up" : "down",
    };
  }
  if (previousAmount <= 0 && currentAmount > 0) {
    return { text: t("analyticsMp.trendNew"), direction: "up" };
  }
  return { text: PLACEHOLDER, direction: "unknown" };
}

export type TotalsInput = {
  revenue: number;
  orders: number;
  units: number;
  currency: string;
  prevRevenue: number;
  revenueDeltaPct: number | null | undefined;
};

/** Summiert angebundene Kanäle; Währungsmix wird bewusst nicht aggregiert. */
export function buildMarketplaceTotals(
  channels: Array<{
    summary?: SalesCompareResponse["summary"];
    previousSummary?: SalesCompareResponse["previousSummary"];
    revenueDeltaPct?: number | null;
  }>
): TotalsInput | null {
  let currency: string | null = null;
  let revenue = 0;
  let orders = 0;
  let units = 0;
  let prevRevenue = 0;

  for (const ch of channels) {
    const s = ch.summary;
    if (!s) continue;
    if (!currency) currency = s.currency;
    if (s.currency !== currency) continue;
    revenue += s.salesAmount;
    orders += s.orderCount;
    units += s.units;
    prevRevenue += ch.previousSummary?.salesAmount ?? 0;
  }

  if (!currency) return null;
  const revenueDeltaPct =
    prevRevenue > 0 ? Number((((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1)) : null;
  return { revenue, orders, units, currency, prevRevenue, revenueDeltaPct };
}

/** Währung für Gesamt-Diagramm: wie KPI-Summe oder erste Kanal-Währung. */
export function pickRevenueChartCurrency(
  totals: TotalsInput | null,
  ...responses: (SalesCompareResponse | null | undefined)[]
): string {
  if (totals?.currency) return totals.currency;
  for (const r of responses) {
    if (r?.summary?.currency) return r.summary.currency;
  }
  return "EUR";
}

export function buildReportRow(args: {
  id: string;
  label: string;
  data: SalesCompareResponse | null;
}): MarketplaceReportRow {
  const summary = args.data?.summary;
  const previousSummary = args.data?.previousSummary;
  const net = args.data?.netBreakdown;
  const prevNet = args.data?.previousNetBreakdown;
  const currency = summary?.currency ?? previousSummary?.currency ?? "EUR";
  const currentRevenue = summary?.salesAmount ?? 0;
  const previousRevenue = previousSummary?.salesAmount ?? 0;
  const currentOrders = summary?.orderCount ?? 0;
  const previousOrders = previousSummary?.orderCount ?? 0;
  const currentUnits = summary?.units ?? 0;
  const previousUnits = previousSummary?.units ?? 0;
  const currentFbaUnits = summary?.fbaUnits ?? 0;
  const previousFbaUnits = previousSummary?.fbaUnits ?? 0;
  const currentReturns = net?.returnsAmount ?? 0;
  const previousReturns = prevNet?.returnsAmount ?? 0;
  const currentReturned = net?.returnedAmount ?? 0;
  const previousReturned = prevNet?.returnedAmount ?? 0;
  const currentCancelled = net?.cancelledAmount ?? 0;
  const previousCancelled = prevNet?.cancelledAmount ?? 0;
  const currentFees = net?.feesAmount ?? 0;
  const previousFees = prevNet?.feesAmount ?? 0;
  const currentAds = net?.adSpendAmount ?? 0;
  const previousAds = prevNet?.adSpendAmount ?? 0;
  const currentNet =
    net?.netAmount ?? Math.max(0, currentRevenue - currentReturns - currentFees - currentAds);
  const previousNetAmount =
    prevNet?.netAmount ??
    Math.max(0, previousRevenue - previousReturns - previousFees - previousAds);

  return {
    id: args.id,
    label: args.label,
    currency,
    currentRevenue,
    previousRevenue,
    currentOrders,
    previousOrders,
    currentUnits,
    previousUnits,
    currentFbaUnits,
    previousFbaUnits,
    currentReturns,
    previousReturns,
    currentReturned,
    previousReturned,
    currentCancelled,
    previousCancelled,
    currentFees,
    previousFees,
    currentAds,
    previousAds,
    currentNet,
    previousNet: previousNetAmount,
    feeSource: net?.feeSource ?? "default_percentage",
    returnsSource: net?.returnsSource ?? "none",
    costCoverage: net?.costCoverage ?? "estimated",
  };
}
