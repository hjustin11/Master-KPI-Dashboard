"use client";

import { useState, useEffect, useCallback } from "react";

export type MarketplaceOverviewData = {
  marketplace: { slug: string; name: string; logo: string; connected: boolean };
  range: { from: string; to: string };
  totals: {
    grossSales: number;
    orders: number;
    avgOrderValue: number;
    units: number;
    returnAmount: number;
    returnRate: number;
    adSpend: number;
    fees: number;
    netPayout: number;
  };
  previous: {
    grossSales: number;
    orders: number;
    avgOrderValue: number;
  };
  deltas: {
    grossSales: number | null;
    orders: number | null;
    avgOrderValue: number | null;
  };
  points: Array<{ date: string; orders: number; amount: number; units: number }>;
  previousPoints: Array<{ date: string; orders: number; amount: number; units: number }>;
  narrative: string;
};

type State = {
  data: MarketplaceOverviewData | null;
  loading: boolean;
  error: string | null;
};

export default function useMarketplaceDetail(slug: string, from?: string, to?: string) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/marketplace-detail/${slug}/overview?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as MarketplaceOverviewData;
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Fehler" });
    }
  }, [slug, from, to]);

  useEffect(() => { void load(); }, [load]);

  return { ...state, refresh: load };
}
