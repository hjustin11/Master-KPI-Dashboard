"use client";

import { useEffect, useMemo, useState } from "react";

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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AmazonPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AmazonSalesSummary | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/amazon/sales?days=7");
        const payload = (await res.json()) as AmazonSalesResponse;
        if (!res.ok) {
          throw new Error(payload.error ?? "Amazon Verkaufsdaten konnten nicht geladen werden.");
        }
        setSummary(payload.summary ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const salesLabel = useMemo(() => {
    if (!summary) return "0,00 EUR";
    return formatCurrency(summary.salesAmount, summary.currency);
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Amazon Übersicht</h1>
        <p className="text-sm text-muted-foreground">Verkaufsdaten der letzten 7 Tage.</p>
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
            <p className="mt-1 text-2xl font-semibold">{salesLabel}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Bestellungen (7 Tage)</p>
            <p className="mt-1 text-2xl font-semibold">{summary?.orderCount ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Einheiten (7 Tage)</p>
            <p className="mt-1 text-2xl font-semibold">{summary?.units ?? 0}</p>
          </div>
        </div>
      )}
    </div>
  );
}
