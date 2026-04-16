"use client";

import { useState, useMemo, useCallback } from "react";
import {
  type CalendarPreset,
  type SettlementPeriod,
  type PeriodSelection,
  resolveCalendarPreset,
} from "@/shared/lib/payouts/periodResolver";

export type { CalendarPreset, PeriodSelection };

export default function usePayoutsPeriodSelector() {
  const [selection, setSelection] = useState<PeriodSelection>({
    kind: "preset",
    preset: "last_14_days",
  });
  const [compare, setCompare] = useState(true);

  const period = useMemo(() => {
    switch (selection.kind) {
      case "preset":
        return resolveCalendarPreset(selection.preset);
      case "settlement":
        return { from: selection.period.periodFrom, to: selection.period.periodTo };
      case "custom":
        return { from: selection.from, to: selection.to };
    }
  }, [selection]);

  const setPreset = useCallback((preset: CalendarPreset) => {
    setSelection({ kind: "preset", preset });
  }, []);

  const setSettlementPeriod = useCallback((p: SettlementPeriod) => {
    setSelection({ kind: "settlement", period: p });
  }, []);

  const setCustomRange = useCallback((from: string, to: string) => {
    setSelection({ kind: "custom", from, to });
  }, []);

  return {
    selection,
    period,
    compare,
    setCompare,
    setPreset,
    setSettlementPeriod,
    setCustomRange,
  };
}
