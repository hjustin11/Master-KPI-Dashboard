import { expandMarketplaceKeyName } from "@/shared/lib/xentralProjectLookup";

const MAX_ARTICLE_FORECAST_RANGE_DAYS = 366;

/**
 * yyyy-mm-dd des Kalendertags in Europe/Berlin für einen Instant.
 * Unabhängig von der Prozess-Zeitzone (SSR in UTC vs. Browser) — vermeidet Hydration-Mismatches bei Datumsfeldern.
 */
export function formatInstantAsBerlinYmd(d: Date): string {
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

export function parseYmdToUtcNoon(ymd: string): number | null {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isFinite(ts) ? ts : null;
}

export function addDaysToYmd(ymd: string, days: number): string {
  const ts = parseYmdToUtcNoon(ymd);
  if (ts == null) return ymd;
  const d = new Date(ts + days * 86400000);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * Standard-Zeitraum: 90 Kalendertage inkl. Berlin-„heute“ (from = to − 89 Tage),
 * konsistent mit der Regel „Verkaufsfenster (Tage)“ in der Bedarfsprognose.
 */
export function defaultArticleForecastFromToYmd(): { fromYmd: string; toYmd: string } {
  const toYmd = formatInstantAsBerlinYmd(new Date());
  const fromYmd = addDaysToYmd(toYmd, -89);
  return { fromYmd, toYmd };
}

export function parseForecastYmdParam(value: string | null): string | null {
  if (!value) return null;
  const t = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Sortierte Grenzen; maximal {@link MAX_ARTICLE_FORECAST_RANGE_DAYS} Tage (von toYmd rückwärts). */
export function clampForecastDateRange(fromYmd: string, toYmd: string): { fromYmd: string; toYmd: string } {
  let f = fromYmd;
  let t = toYmd;
  if (f > t) [f, t] = [t, f];
  const t0 = Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)), 12);
  const t1 = Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)), 12);
  const spanDays = Math.floor((t1 - t0) / 86400000) + 1;
  if (spanDays <= MAX_ARTICLE_FORECAST_RANGE_DAYS) return { fromYmd: f, toYmd: t };
  const clampFromMs = t1 - (MAX_ARTICLE_FORECAST_RANGE_DAYS - 1) * 86400000;
  const d = new Date(clampFromMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { fromYmd: `${y}-${m}-${day}`, toYmd: t };
}

/**
 * Einheitliche Spaltennamen in der Bedarfsprognose: AMZ-FBA + AMZ-FBM → „Amazon“.
 */
export function normalizeArticleForecastProjectLabel(label: string): string {
  const t = label.trim();
  if (!t) return "—";
  if (t === "—") return "—";
  const expanded = expandMarketplaceKeyName(t);
  // Falls nach Expansion immer noch ein Roh-Kürzel (AMZ-FBA/AMZ-FBM) → "Amazon"
  const u = expanded.toUpperCase().replace(/\s+/g, " ").trim();
  if (u === "AMZ-FBA" || u === "AMZ-FBM") return "Amazon";
  return expanded;
}

/** Fasst doppelte Keys nach Normalisierung zusammen (z. B. Schreibweisen). */
export function consolidateArticleForecastSoldByProject(sold: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sold)) {
    const nk = normalizeArticleForecastProjectLabel(k);
    if (nk === "—") {
      out["—"] = (out["—"] ?? 0) + v;
      continue;
    }
    out[nk] = (out[nk] ?? 0) + v;
  }
  return out;
}
