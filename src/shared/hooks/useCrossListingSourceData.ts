"use client";

import { useEffect, useRef, useState } from "react";
import type { CrossListingSourceDataResponse } from "@/shared/lib/crossListing/crossListingDraftTypes";

type State = {
  data: CrossListingSourceDataResponse | null;
  loading: boolean;
  error: string | null;
};

export default function useCrossListingSourceData(sku: string | null): State {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const reqIdRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqIdRef.current;

    (async () => {
      if (!sku) {
        if (reqId === reqIdRef.current) setState({ data: null, loading: false, error: null });
        return;
      }
      setState({ data: null, loading: true, error: null });
      try {
        const res = await fetch(`/api/cross-listing/source-data?sku=${encodeURIComponent(sku)}`, {
          cache: "no-store",
        });
        const body = (await res.json().catch(() => null)) as
          | CrossListingSourceDataResponse
          | { error?: string }
          | null;
        if (reqId !== reqIdRef.current) return;
        if (!res.ok || !body || "error" in body) {
          const msg = body && "error" in body && body.error ? body.error : `HTTP ${res.status}`;
          setState({ data: null, loading: false, error: msg });
          return;
        }
        setState({ data: body as CrossListingSourceDataResponse, loading: false, error: null });
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Netzwerkfehler",
        });
      }
    })();
  }, [sku]);

  return state;
}
