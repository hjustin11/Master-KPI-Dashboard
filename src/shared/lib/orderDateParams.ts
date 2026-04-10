export function parseYmdParam(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
}

export function ymdToUtcRangeExclusiveEnd(
  fromYmd: string,
  toYmd: string
): { startMs: number; endMs: number } {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const startMs = Date.UTC(fy, fm - 1, fd);
  const endDay = new Date(Date.UTC(ty, tm - 1, td));
  endDay.setUTCDate(endDay.getUTCDate() + 1);
  return { startMs, endMs: endDay.getTime() };
}

export function toDateInputValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** Letzte `dayCount` Kalendertage inkl. heute (lokale Datumslogik wie `<input type="date">`). */
export function ymdRangeInclusiveDayCountLocal(dayCount: number): { fromYmd: string; toYmd: string } {
  const n = Math.max(1, Math.floor(dayCount));
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return { fromYmd: toDateInputValue(start), toYmd: toDateInputValue(end) };
}
