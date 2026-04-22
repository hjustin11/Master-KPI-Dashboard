"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAvailableWeeksBack,
  getIsoWeekByNumber,
  getLastCompletedIsoWeek,
  type IsoWeek,
} from "@/shared/lib/weeklyReport/isoWeekResolver";
import type { WeeklyReportData } from "@/shared/lib/weeklyReport/weeklyReportService";

export type UseWeeklyReportReturn = {
  data: WeeklyReportData | null;
  loading: boolean;
  error: string | null;
  selectedWeek: IsoWeek;
  availableWeeks: IsoWeek[];
  setSelectedWeek: (week: IsoWeek) => void;
  reload: () => void;
};

export default function useWeeklyReport(): UseWeeklyReportReturn {
  const availableWeeks = useMemo(() => getAvailableWeeksBack(12), []);
  const [selectedWeek, setSelectedWeek] = useState<IsoWeek>(() => getLastCompletedIsoWeek());
  const [data, setData] = useState<WeeklyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  const fetchReport = useCallback(async (week: IsoWeek, signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/analytics/weekly-report?year=${week.year}&week=${week.week}`;
      const res = await fetch(url, { cache: "no-store", signal });
      const payload = (await res.json().catch(() => ({}))) as WeeklyReportData & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      if (!payload.weeks?.current || !payload.weeks?.previous) {
        throw new Error("Antwort enthält keine Wochen-Daten.");
      }
      const rehydrated: WeeklyReportData = {
        ...payload,
        weeks: {
          current: rehydrateWeek(payload.weeks.current),
          previous: rehydrateWeek(payload.weeks.previous),
        },
      };
      setData(rehydrated);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Wochenbericht konnte nicht geladen werden.";
      console.error("[useWeeklyReport]", msg, e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchReport(selectedWeek, controller.signal);
    return () => controller.abort();
  }, [selectedWeek, reloadCounter, fetchReport]);

  const reload = useCallback(() => setReloadCounter((c) => c + 1), []);

  return {
    data,
    loading,
    error,
    selectedWeek,
    availableWeeks,
    setSelectedWeek: (week: IsoWeek) => setSelectedWeek(week),
    reload,
  };
}

/** Server liefert IsoWeek mit Date-Feldern als ISO-Strings — wieder zu Date machen. */
function rehydrateWeek(week: IsoWeek): IsoWeek {
  return {
    year: week.year,
    week: week.week,
    label: week.label,
    key: week.key,
    start: typeof week.start === "string" ? new Date(week.start) : week.start,
    end: typeof week.end === "string" ? new Date(week.end) : week.end,
  };
}

/** Helper für UI: aus year+week-String einen IsoWeek bauen. */
export function isoWeekFromKey(key: string): IsoWeek | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (!m) return null;
  return getIsoWeekByNumber(Number(m[1]), Number(m[2]));
}
