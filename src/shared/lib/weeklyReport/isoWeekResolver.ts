/**
 * ISO-Wochen-Helfer für den Wochenbericht.
 * Montag 00:00 → Sonntag 23:59:59.999 (lokale Zeit Europe/Berlin).
 *
 * Nutzt date-fns ISO-Funktionen (Montag als Wochenstart).
 * Annahme: Server läuft in Europe/Berlin oder UTC; date-fns operiert auf
 * lokalen Datums-Werten. Für DE-Anwendungsfälle reicht das.
 */

import {
  addDays,
  endOfISOWeek,
  getISOWeek,
  getISOWeekYear,
  setISOWeek,
  setISOWeekYear,
  startOfISOWeek,
  subWeeks,
} from "date-fns";

export type IsoWeek = {
  year: number;
  week: number;
  start: Date;
  end: Date;
  label: string;
  /** Stable key für Dropdown-values: `${year}-${week}`. */
  key: string;
};

function buildIsoWeek(year: number, week: number, start: Date, end: Date): IsoWeek {
  return {
    year,
    week,
    start,
    end,
    label: `KW ${week} / ${year}`,
    key: `${year}-${String(week).padStart(2, "0")}`,
  };
}

export function getIsoWeek(date: Date): IsoWeek {
  const start = startOfISOWeek(date);
  const end = endOfISOWeek(date);
  const week = getISOWeek(date);
  const year = getISOWeekYear(date);
  return buildIsoWeek(year, week, start, end);
}

export function getPreviousIsoWeek(week: IsoWeek): IsoWeek {
  return getIsoWeek(subWeeks(week.start, 1));
}

export function getIsoWeekByNumber(year: number, week: number): IsoWeek {
  // Jan 4 ist garantiert in ISO-Woche 1 — sicherer Anker.
  const anchor = setISOWeekYear(new Date(year, 0, 4), year);
  const target = setISOWeek(anchor, week);
  return getIsoWeek(target);
}

/**
 * Letzte vollständig abgeschlossene ISO-Woche.
 * Default-Periode für den Wochenbericht: nicht die laufende Woche, sondern
 * die vorherige (sonst sind die Zahlen unvollständig).
 */
export function getLastCompletedIsoWeek(now: Date = new Date()): IsoWeek {
  const currentStart = startOfISOWeek(now);
  // Wir nehmen IMMER die Woche davor, um sicherzustellen, dass alle Tage da sind.
  return getIsoWeek(subWeeks(currentStart, 1));
}

/** Letzte N abgeschlossene ISO-Wochen (jüngste zuerst). */
export function getAvailableWeeksBack(count: number, now: Date = new Date()): IsoWeek[] {
  const out: IsoWeek[] = [];
  let cursor = getLastCompletedIsoWeek(now);
  for (let i = 0; i < count; i += 1) {
    out.push(cursor);
    cursor = getPreviousIsoWeek(cursor);
  }
  return out;
}

/** Jeder Tag-Mo bis So- als YYYY-MM-DD (lokal). */
export function getIsoWeekDays(week: IsoWeek): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(week.start, i);
    out.push(formatIsoDate(d));
  }
  return out;
}

/** Format `YYYY-MM-DD` aus lokaler Date. */
export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
