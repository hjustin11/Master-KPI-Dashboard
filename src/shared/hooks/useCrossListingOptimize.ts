"use client";

import { useCallback, useState } from "react";
import type {
  CrossListingDraftValues,
  CrossListingSourceMap,
  CrossListingTargetSlug,
} from "@/shared/lib/crossListing/crossListingDraftTypes";
import type { CrossListingLlmResult } from "@/shared/lib/crossListing/crossListingLlmOptimize";

export type OptimizeFieldKey = "title" | "description" | "bullets" | "searchTerms";

type State = {
  loading: boolean;
  error: string | null;
  result: CrossListingLlmResult | null;
  rulebookLoaded: boolean;
  applied: Set<OptimizeFieldKey>;
};

const INITIAL: State = {
  loading: false,
  error: null,
  result: null,
  rulebookLoaded: false,
  applied: new Set(),
};

export default function useCrossListingOptimize(): {
  state: State;
  optimize: (args: {
    sku: string;
    targetMarketplace: CrossListingTargetSlug;
    mergedValues: CrossListingDraftValues;
    sourceData: CrossListingSourceMap;
  }) => Promise<void>;
  markApplied: (key: OptimizeFieldKey) => void;
  reset: () => void;
} {
  const [state, setState] = useState<State>(INITIAL);

  const optimize = useCallback(async (args: {
    sku: string;
    targetMarketplace: CrossListingTargetSlug;
    mergedValues: CrossListingDraftValues;
    sourceData: CrossListingSourceMap;
  }) => {
    setState({ ...INITIAL, loading: true, applied: new Set() });
    try {
      const res = await fetch("/api/cross-listing/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const body = (await res.json().catch(() => null)) as
        | { result?: CrossListingLlmResult; rulebookLoaded?: boolean; error?: string }
        | null;
      if (!res.ok || !body || !body.result) {
        setState({ ...INITIAL, error: body?.error ?? `HTTP ${res.status}` });
        return;
      }
      setState({
        loading: false,
        error: null,
        result: body.result,
        rulebookLoaded: Boolean(body.rulebookLoaded),
        applied: new Set(),
      });
    } catch (err) {
      setState({ ...INITIAL, error: err instanceof Error ? err.message : "Netzwerkfehler" });
    }
  }, []);

  const markApplied = useCallback((key: OptimizeFieldKey) => {
    setState((prev) => {
      const next = new Set(prev.applied);
      next.add(key);
      return { ...prev, applied: next };
    });
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { state, optimize, markApplied, reset };
}
