export type CalendarPreset =
  | "last_14_days"
  | "last_30_days"
  | "last_month"
  | "last_quarter"
  | "year_to_date";

export type SettlementPeriod = {
  periodFrom: string;
  periodTo: string;
  marketplace: string;
  isOpen: boolean;
};

export type PeriodSelection =
  | { kind: "preset"; preset: CalendarPreset }
  | { kind: "settlement"; period: SettlementPeriod }
  | { kind: "custom"; from: string; to: string };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveCalendarPreset(preset: CalendarPreset): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);

  switch (preset) {
    case "last_14_days": {
      const from = new Date(now.getTime() - 13 * 86_400_000);
      return { from: ymd(from), to: today };
    }
    case "last_30_days": {
      const from = new Date(now.getTime() - 29 * 86_400_000);
      return { from: ymd(from), to: today };
    }
    case "last_month": {
      const uY = now.getUTCFullYear();
      const uM = now.getUTCMonth();
      const prevY = uM === 0 ? uY - 1 : uY;
      const prevM = uM === 0 ? 11 : uM - 1;
      const from = new Date(Date.UTC(prevY, prevM, 1));
      const to = new Date(Date.UTC(prevY, prevM + 1, 0));
      return { from: ymd(from), to: ymd(to) };
    }
    case "last_quarter": {
      const uY = now.getUTCFullYear();
      const uM = now.getUTCMonth();
      const from = new Date(Date.UTC(uY, uM - 3, 1));
      const to = new Date(Date.UTC(uY, uM, 0)); // last day of previous month
      return { from: ymd(from), to: ymd(to) };
    }
    case "year_to_date": {
      return { from: `${now.getUTCFullYear()}-01-01`, to: today };
    }
  }
}

/**
 * Formatiert eine Settlement-Periode als deutsches Label.
 * z.B. "31.3.2026 – 14.4.2026" oder "14.4.2026 – heute (offen)"
 */
export function formatSettlementLabel(p: SettlementPeriod): string {
  const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  };

  const from = fmtDate(p.periodFrom);
  if (p.isOpen) {
    return `${from} – heute (offen)`;
  }
  return `${from} – ${fmtDate(p.periodTo)}`;
}

/**
 * Erzeugt einen eindeutigen Select-Value-String aus einer SettlementPeriod.
 */
export function settlementToValue(p: SettlementPeriod): string {
  return `settlement:${p.periodFrom}:${p.periodTo}:${p.marketplace}`;
}

/**
 * Parst einen Select-Value zurück in eine SettlementPeriod.
 */
export function valueToSettlement(value: string): SettlementPeriod | null {
  const parts = value.split(":");
  if (parts[0] !== "settlement" || parts.length < 4) return null;
  return {
    periodFrom: parts[1],
    periodTo: parts[2],
    marketplace: parts[3],
    isOpen: new Date(parts[2]).getTime() >= Date.now() - 86_400_000,
  };
}
