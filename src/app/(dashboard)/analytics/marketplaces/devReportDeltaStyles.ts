export const DEV_REPORT_DELTA_TEXT_POSITIVE = "text-emerald-700";
export const DEV_REPORT_DELTA_TEXT_NEGATIVE = "text-rose-700";
export const DEV_REPORT_DELTA_TEXT_NEUTRAL = "text-muted-foreground";

export function devReportDeltaToneClass(v: number | null): string {
  if (v == null || v === 0) return DEV_REPORT_DELTA_TEXT_NEUTRAL;
  return v > 0 ? DEV_REPORT_DELTA_TEXT_POSITIVE : DEV_REPORT_DELTA_TEXT_NEGATIVE;
}
