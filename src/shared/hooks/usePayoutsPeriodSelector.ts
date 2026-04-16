"use client";

import { useState, useMemo } from "react";

export type PayoutPreset = "current" | "previous" | "last30" | "lastMonth" | "last3Months" | "custom";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolvePreset(preset: PayoutPreset): { from: string; to: string } {
  const now = new Date();
  const today = ymd(now);

  switch (preset) {
    case "current": {
      const from = new Date(now.getTime() - 14 * 86_400_000);
      return { from: ymd(from), to: today };
    }
    case "previous": {
      const to = new Date(now.getTime() - 14 * 86_400_000);
      const from = new Date(to.getTime() - 14 * 86_400_000);
      return { from: ymd(from), to: ymd(to) };
    }
    case "last30": {
      const from = new Date(now.getTime() - 30 * 86_400_000);
      return { from: ymd(from), to: today };
    }
    case "lastMonth": {
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      return { from: ymd(from), to: ymd(to) };
    }
    case "last3Months": {
      const from = new Date(now.getTime() - 90 * 86_400_000);
      return { from: ymd(from), to: today };
    }
    case "custom":
      return { from: "", to: "" };
  }
}

export default function usePayoutsPeriodSelector() {
  const [preset, setPreset] = useState<PayoutPreset>("current");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [compare, setCompare] = useState(true);

  const period = useMemo(() => {
    if (preset === "custom") return { from: customFrom, to: customTo };
    return resolvePreset(preset);
  }, [preset, customFrom, customTo]);

  return {
    preset,
    setPreset,
    period,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    compare,
    setCompare,
  };
}
