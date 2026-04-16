"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CrossListingDraftRow,
  CrossListingDraftValues,
  CrossListingSourceMap,
} from "@/shared/lib/crossListing/crossListingDraftTypes";

type ListState = {
  drafts: CrossListingDraftRow[];
  loading: boolean;
  error: string | null;
};

type CreateArgs = {
  sku: string;
  ean: string | null;
  targetMarketplaceSlug: string;
  sourceMarketplaceSlug: string;
  sourceData: CrossListingSourceMap;
  generatedListing?: CrossListingDraftValues | null;
  userEdits?: CrossListingDraftValues | null;
};

type UpdateArgs = {
  id: string;
  userEdits?: CrossListingDraftValues | null;
  status?: CrossListingDraftRow["status"];
  errorMessage?: string | null;
};

export default function useCrossListingDrafts(args: { skus?: readonly string[] } = {}): {
  list: ListState;
  reload: () => void;
  createDraft: (input: CreateArgs) => Promise<CrossListingDraftRow>;
  updateDraft: (input: UpdateArgs) => Promise<CrossListingDraftRow>;
} {
  const [list, setList] = useState<ListState>({ drafts: [], loading: false, error: null });
  const [reloadTick, setReloadTick] = useState(0);
  const reqIdRef = useRef(0);

  const skusKey = args.skus ? [...args.skus].join(",") : "";

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    (async () => {
      setList((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const qs = skusKey ? `?skus=${encodeURIComponent(skusKey)}` : "";
        const res = await fetch(`/api/cross-listing/drafts${qs}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as
          | { drafts?: CrossListingDraftRow[]; error?: string }
          | null;
        if (reqId !== reqIdRef.current) return;
        if (!res.ok || !body || body.error) {
          setList({ drafts: [], loading: false, error: body?.error ?? `HTTP ${res.status}` });
          return;
        }
        setList({ drafts: body.drafts ?? [], loading: false, error: null });
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setList({ drafts: [], loading: false, error: err instanceof Error ? err.message : "Netzwerkfehler" });
      }
    })();
  }, [skusKey, reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const createDraft = useCallback(async (input: CreateArgs): Promise<CrossListingDraftRow> => {
    const res = await fetch("/api/cross-listing/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: input.sku,
        ean: input.ean,
        target_marketplace_slug: input.targetMarketplaceSlug,
        source_marketplace_slug: input.sourceMarketplaceSlug,
        source_data: input.sourceData,
        generated_listing: input.generatedListing ?? null,
        user_edits: input.userEdits ?? null,
      }),
    });
    const body = (await res.json().catch(() => null)) as { draft?: CrossListingDraftRow; error?: string } | null;
    if (!res.ok || !body || !body.draft) {
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    setReloadTick((n) => n + 1);
    return body.draft;
  }, []);

  const updateDraft = useCallback(async (input: UpdateArgs): Promise<CrossListingDraftRow> => {
    const res = await fetch("/api/cross-listing/drafts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        user_edits: input.userEdits,
        status: input.status,
        error_message: input.errorMessage,
      }),
    });
    const body = (await res.json().catch(() => null)) as { draft?: CrossListingDraftRow; error?: string } | null;
    if (!res.ok || !body || !body.draft) {
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    setReloadTick((n) => n + 1);
    return body.draft;
  }, []);

  return { list, reload, createDraft, updateDraft };
}
