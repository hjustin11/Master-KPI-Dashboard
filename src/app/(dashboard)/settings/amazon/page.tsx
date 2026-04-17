"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_PAGE_TITLE,
} from "@/shared/lib/dashboardUi";

type RuntimeMarketplace = {
  slug: string;
  marketplaceId: string;
  name: string;
  shortName: string;
  country: string;
  countryFlag: string;
  domain: string;
  languageTag: string;
  currencyCode: string;
  enabledInDb: boolean;
  activatedAt: string | null;
  participationCheckOk: boolean | null;
};

const DE_SLUG = "amazon-de";

function formatDateDe(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export default function AmazonMarketplacesSettingsPage() {
  const [marketplaces, setMarketplaces] = useState<RuntimeMarketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ slug: string; kind: "ok" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/amazon/marketplace-config", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        marketplaces?: RuntimeMarketplace[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMarketplaces(json.marketplaces ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = useCallback(
    async (slug: string) => {
      setBusySlug(slug);
      setFeedback(null);
      try {
        const res = await fetch("/api/amazon/marketplace-config/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setFeedback({ slug, kind: "error", message: json.error ?? `HTTP ${res.status}` });
        } else {
          setFeedback({ slug, kind: "ok", message: "Marktplatz aktiviert." });
          await load();
        }
      } catch (e) {
        setFeedback({
          slug,
          kind: "error",
          message: e instanceof Error ? e.message : "Fehler beim Aktivieren.",
        });
      } finally {
        setBusySlug(null);
      }
    },
    [load]
  );

  const deactivate = useCallback(
    async (slug: string) => {
      setBusySlug(slug);
      setFeedback(null);
      try {
        const res = await fetch("/api/amazon/marketplace-config/deactivate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setFeedback({ slug, kind: "error", message: json.error ?? `HTTP ${res.status}` });
        } else {
          setFeedback({ slug, kind: "ok", message: "Marktplatz deaktiviert." });
          await load();
        }
      } catch (e) {
        setFeedback({
          slug,
          kind: "error",
          message: e instanceof Error ? e.message : "Fehler beim Deaktivieren.",
        });
      } finally {
        setBusySlug(null);
      }
    },
    [load]
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className={DASHBOARD_PAGE_TITLE}>Amazon EU-Marktplätze</h1>
        <p className="mt-1 text-sm text-gray-500">
          Jeder EU-Marktplatz nutzt dieselben SP-API-Credentials, liefert aber eigene Bestellungen,
          Listings und Auszahlungen. Du musst auf jedem Land separat im Seller Central registriert sein.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className={cn("space-y-2", DASHBOARD_COMPACT_CARD)}>
        {loading && marketplaces.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lade Marktplatz-Config…
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {marketplaces.map((m) => {
              const busy = busySlug === m.slug;
              const isDe = m.slug === DE_SLUG;
              const isFeedbackForThis = feedback?.slug === m.slug;
              return (
                <li key={m.slug} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-2xl" aria-hidden>{m.countryFlag}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-black dark:text-white">
                          {m.name}
                        </span>
                        {m.enabledInDb ? (
                          <span className="inline-flex items-center gap-1 rounded border border-black px-1.5 py-0 text-[10px] font-semibold text-black dark:border-white dark:text-white">
                            <CheckCircle2 className="h-3 w-3" />
                            aktiv
                          </span>
                        ) : null}
                        {m.participationCheckOk === false ? (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-400 px-1.5 py-0 text-[10px] font-semibold text-rose-700">
                            <AlertTriangle className="h-3 w-3" />
                            nicht registriert
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {m.domain} · {m.languageTag} · {m.currencyCode}
                        {m.activatedAt ? ` · aktiviert ${formatDateDe(m.activatedAt)}` : ""}
                      </div>
                      {isFeedbackForThis ? (
                        <div
                          className={cn(
                            "mt-1 text-xs",
                            feedback?.kind === "ok" ? "text-green-700" : "text-rose-700"
                          )}
                        >
                          {feedback?.message}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {m.enabledInDb ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isDe || busy}
                        onClick={() => void deactivate(m.slug)}
                        className="h-7 text-xs"
                        title={isDe ? "Amazon DE kann nicht deaktiviert werden." : undefined}
                      >
                        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}
                        Deaktivieren
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void activate(m.slug)}
                        className="h-7 text-xs"
                      >
                        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                        Aktivieren
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500">
        ℹ️ Alle Länder nutzen dieselben API-Credentials. Separate Registrierung auf dem jeweiligen
        Marktplatz im Seller Central erforderlich. Der Aktivierungs-Knopf prüft live über
        SP-API, ob dein Seller-Account auf dem Land registriert ist.
      </p>
    </div>
  );
}
