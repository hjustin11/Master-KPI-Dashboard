"use client";

import { useCallback, useState } from "react";

export type CrossListingSubmissionIssue = {
  code?: string;
  message: string;
  severity: string;
  attributeNames?: string[];
};

export type CrossListingSubmitResult = {
  ok: boolean;
  submissionId: string | null;
  status: string;
  issues: CrossListingSubmissionIssue[];
  httpStatus: number;
  sandbox?: boolean;
  endpointUsed?: string;
  warnings?: { field: string; message: string }[];
};

type State = {
  loading: boolean;
  error: string | null;
  result: CrossListingSubmitResult | null;
};

const INITIAL: State = { loading: false, error: null, result: null };

export default function useCrossListingSubmit(): {
  state: State;
  submit: (args: {
    draftId: string;
    targetMarketplaceSlug: string;
    productType?: string;
  }) => Promise<CrossListingSubmitResult | null>;
  reset: () => void;
} {
  const [state, setState] = useState<State>(INITIAL);

  const submit = useCallback(
    async (args: { draftId: string; targetMarketplaceSlug: string; productType?: string }) => {
      setState({ loading: true, error: null, result: null });
      try {
        const res = await fetch("/api/cross-listing/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        const body = (await res.json().catch(() => null)) as
          | (CrossListingSubmitResult & { error?: string; validation?: unknown })
          | null;
        if (!res.ok || !body) {
          const message = body?.error ?? `HTTP ${res.status}`;
          setState({ loading: false, error: message, result: null });
          return null;
        }
        setState({ loading: false, error: null, result: body });
        return body;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Netzwerkfehler";
        setState({ loading: false, error: message, result: null });
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => setState(INITIAL), []);

  return { state, submit, reset };
}
