"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayoutOverview } from "@/shared/lib/payouts/payoutTypes";

type State = {
  data: PayoutOverview | null;
  loading: boolean;
  error: string | null;
  syncing: boolean;
};

const INITIAL: State = { data: null, loading: false, error: null, syncing: false };

export default function usePayoutsLoader(args: {
  from: string;
  to: string;
  marketplaces: string[];
  compare: boolean;
  enabled: boolean;
}): State & { refresh: () => void; syncAll: () => Promise<void> } {
  const [state, setState] = useState<State>(INITIAL);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!args.from || !args.to || !args.enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams({
        from: args.from,
        to: args.to,
        compare: args.compare ? "true" : "false",
      });
      if (args.marketplaces.length > 0) {
        params.set("marketplaces", args.marketplaces.join(","));
      }
      const res = await fetch(`/api/payouts/overview?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as PayoutOverview;
      setState({ data, loading: false, error: null, syncing: false });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Fehler beim Laden.",
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick triggers manual refresh
  }, [args.from, args.to, args.marketplaces, args.compare, args.enabled, tick]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const syncAll = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true }));
    try {
      // Parallel: Amazon + Mirakl + Shopify
      const results = await Promise.allSettled([
        fetch("/api/payouts/amazon/sync", { method: "POST" }),
        fetch("/api/payouts/mirakl/sync", { method: "POST" }),
        fetch("/api/payouts/shopify/sync", { method: "POST" }),
      ]);
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("[payouts:syncAll]", r.reason);
        }
      }
      setTick((t) => t + 1);
    } catch (err) {
      setState((s) => ({
        ...s,
        syncing: false,
        error: err instanceof Error ? err.message : "Sync fehlgeschlagen.",
      }));
    }
  }, []);

  return { ...state, refresh, syncAll };
}
