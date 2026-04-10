import { differenceInCalendarDays, format, subDays, subYears } from "date-fns";

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function computeDisplayedPreviousPeriod(
  from: string,
  to: string,
  compareMode: "previous" | "yoy"
): { previousFrom: string; previousTo: string } {
  const f = parseYmdLocal(from);
  const t = parseYmdLocal(to);
  if (compareMode === "yoy") {
    return {
      previousFrom: toYmd(subYears(f, 1)),
      previousTo: toYmd(subYears(t, 1)),
    };
  }
  const spanDays = Math.max(1, differenceInCalendarDays(t, f) + 1);
  const previousTo = subDays(f, 1);
  const previousFrom = subDays(previousTo, spanDays - 1);
  return {
    previousFrom: toYmd(previousFrom),
    previousTo: toYmd(previousTo),
  };
}
