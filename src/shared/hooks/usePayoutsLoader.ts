"use client";

import { useCallback, useEffect, useState } from "react";
import type { PayoutOverview } from "@/shared/lib/payouts/payoutTypes";

type SyncStatus = "idle" | "running" | "done" | "failed";

type State = {
  data: PayoutOverview | null;
  loading: boolean;
  error: string | null;
  syncing: boolean;
  syncStatuses: Record<string, SyncStatus>;
};

const INITIAL: State = { data: null, loading: false, error: null, syncing: false, syncStatuses: {} };

async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs = 120_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
      setState((s) => ({ ...s, data, loading: false, error: null, syncing: false }));
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
    const syncs = [
      { key: "amazon", url: "/api/payouts/amazon/sync", timeout: 120_000 },
      { key: "mirakl", url: "/api/payouts/mirakl/sync", timeout: 30_000 },
      { key: "shopify", url: "/api/payouts/shopify/sync", timeout: 30_000 },
    ];

    const statuses: Record<string, SyncStatus> = {};
    for (const s of syncs) statuses[s.key] = "running";
    setState((s) => ({ ...s, syncing: true, error: null, syncStatuses: { ...statuses } }));

    const results = await Promise.allSettled(
      syncs.map(async (s) => {
        try {
          const res = await fetchWithTimeout(s.url, { method: "POST" }, s.timeout);
          statuses[s.key] = res.ok ? "done" : "failed";
          setState((prev) => ({ ...prev, syncStatuses: { ...statuses } }));
          return { key: s.key, ok: res.ok };
        } catch (err) {
          console.error(`[payouts:syncAll] ${s.key}:`, err instanceof Error ? err.message : err);
          statuses[s.key] = "failed";
          setState((prev) => ({ ...prev, syncStatuses: { ...statuses } }));
          return { key: s.key, ok: false };
        }
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    const failed = results.length - succeeded;

    setState((s) => ({
      ...s,
      syncing: false,
      error: failed > 0 ? `${succeeded} synchronisiert, ${failed} fehlgeschlagen.` : null,
    }));

    // Einmaliger Refresh am Ende
    setTick((t) => t + 1);
  }, []);

  return { ...state, refresh, syncAll };
}
