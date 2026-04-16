"use client";

import { useState, useEffect } from "react";
import type { SettlementPeriod } from "@/shared/lib/payouts/periodResolver";

type State = {
  periods: SettlementPeriod[];
  loading: boolean;
  error: string | null;
};

export default function useSettlementPeriods() {
  const [state, setState] = useState<State>({
    periods: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/payouts/periods");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setState({ periods: json.periods ?? [], loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ periods: [], loading: false, error: err instanceof Error ? err.message : "Fehler" });
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
