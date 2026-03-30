"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";

type AmazonSalesSummary = {
  orderCount: number;
  salesAmount: number;
  units: number;
  currency: string;
};

type AmazonSalesResponse = {
  summary?: AmazonSalesSummary;
  error?: string;
};

const AMAZON_SUMMARY_7D_CACHE_KEY = "amazon_sales_summary_7d_v1";

type CachedAmazonSummaryPayload = {
  savedAt: number;
  summary: AmazonSalesSummary | null;
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AmazonPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AmazonSalesSummary | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const summaryRef = useRef<AmazonSalesSummary | null>(null);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedAmazonSummaryPayload>(AMAZON_SUMMARY_7D_CACHE_KEY);
      if (parsed?.summary) {
        setSummary(parsed.summary);
        hadCache = true;
        setIsLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setIsLoading(true);
    } else if (!hadCache && !silent) {
      setIsLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      const res = await fetch("/api/amazon/sales?days=7", { cache: "no-store" });
      const payload = (await res.json()) as AmazonSalesResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? "Amazon Verkaufsdaten konnten nicht geladen werden.");
      }
      const next = payload.summary ?? null;
      setSummary(next);
      writeLocalJsonCache(AMAZON_SUMMARY_7D_CACHE_KEY, {
        savedAt: Date.now(),
        summary: next,
      } satisfies CachedAmazonSummaryPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Amazon Übersicht] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
        if (!summaryRef.current) {
          setSummary(null);
        }
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(false);
      }
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    void load(false, false);
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  const salesLabel = useMemo(() => {
    if (!summary) return "0,00 EUR";
    return formatCurrency(summary.salesAmount, summary.currency);
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className={DASHBOARD_PAGE_TITLE}>Amazon Übersicht</h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Verkaufsdaten der letzten 7 Tage.</p>
          {isBackgroundSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Abgleich…
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          Lade Amazon Verkaufsdaten...
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Umsatz (7 Tage)</p>
            <p className="mt-1 text-xl font-semibold">{salesLabel}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Bestellungen (7 Tage)</p>
            <p className="mt-1 text-xl font-semibold">{summary?.orderCount ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Einheiten (7 Tage)</p>
            <p className="mt-1 text-xl font-semibold">{summary?.units ?? 0}</p>
          </div>
        </div>
      )}
    </div>
  );
}
