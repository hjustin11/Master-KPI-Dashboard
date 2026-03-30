"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useUser } from "@/shared/hooks/useUser";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import { dispatchStartTutorialEvent } from "@/shared/components/tutorial/TutorialRuntimeController";

type FeatureRequestItem = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string;
  title: string;
  message: string;
  status: "open" | "in_progress" | "done";
  owner_reply: string | null;
};

const FEEDBACK_OWNER_INBOX_CACHE_KEY = "dashboard_feedback_inbox_owner_v1";

type CachedFeedbackInboxPayload = {
  savedAt: number;
  items: FeatureRequestItem[];
};

type UpdateTutorialItem = {
  tour: {
    id: string;
    title: string;
    summary: string;
    release_key: string | null;
    scenes: Array<{ id: string }>;
  };
  completed: boolean;
  dismissed: boolean;
};

export default function UpdatesPage() {
  const user = useUser();
  const isOwner = user.roleKey?.toLowerCase() === "owner";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [items, setItems] = useState<FeatureRequestItem[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [inboxBackgroundSyncing, setInboxBackgroundSyncing] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [ownerInboxMounted, setOwnerInboxMounted] = useState(false);
  const [updateTutorials, setUpdateTutorials] = useState<UpdateTutorialItem[]>([]);
  const [tutorialsLoading, setTutorialsLoading] = useState(false);

  const updates = useMemo(
    () => [
      {
        date: "2026-03-27",
        title: "Update & Feedback gestartet",
        text: "Updates & Vorschläge sind jetzt zentral gebündelt.",
      },
      {
        date: "2026-03-26",
        title: "Einladungs-Flow verbessert",
        text: "Einladung akzeptieren, Passwort setzen und Rolle übernehmen.",
      },
    ],
    []
  );

  const loadOwnerInbox = useCallback(async (silent = false) => {
    let hadCache = false;

    if (!silent) {
      const parsed = readLocalJsonCache<CachedFeedbackInboxPayload>(FEEDBACK_OWNER_INBOX_CACHE_KEY);
      if (parsed && Array.isArray(parsed.items)) {
        setItems(parsed.items);
        hadCache = true;
        setIsLoadingInbox(false);
      }
    }

    if (!hadCache && !silent) {
      setIsLoadingInbox(true);
    }

    const showBackgroundIndicator = silent || hadCache;
    if (showBackgroundIndicator) {
      setInboxBackgroundSyncing(true);
    }

    if (!silent) {
      setInboxError(null);
    }

    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const payload = (await res.json()) as { items?: FeatureRequestItem[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Liste konnte nicht geladen werden.");
      const nextItems = payload.items ?? [];
      setItems(nextItems);
      writeLocalJsonCache(FEEDBACK_OWNER_INBOX_CACHE_KEY, {
        savedAt: Date.now(),
        items: nextItems,
      } satisfies CachedFeedbackInboxPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Feedback-Inbox] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setInboxError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      }
    } finally {
      if (!silent) {
        setIsLoadingInbox(false);
      }
      if (showBackgroundIndicator) {
        setInboxBackgroundSyncing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    void loadOwnerInbox(false);
  }, [isOwner, loadOwnerInbox]);

  useEffect(() => {
    if (!isOwner) return;
    setOwnerInboxMounted(true);
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner || !ownerInboxMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadOwnerInbox(true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [isOwner, ownerInboxMounted, loadOwnerInbox]);

  const loadUpdateTutorials = useCallback(async () => {
    if (!user.id) return;
    setTutorialsLoading(true);
    try {
      const res = await fetch("/api/tutorials/runtime", { cache: "no-store" });
      const payload = (await res.json()) as { updates?: UpdateTutorialItem[]; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Tutorials konnten nicht geladen werden.");
      setUpdateTutorials(payload.updates ?? []);
    } catch (error) {
      console.warn("[Tutorial] Updates konnten nicht geladen werden:", error);
    } finally {
      setTutorialsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    if (!user.id) return;
    void loadUpdateTutorials();
  }, [user.id, loadUpdateTutorials]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message }),
      });
      const payload = (await res.json()) as { item?: FeatureRequestItem; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Vorschlag konnte nicht gesendet werden.");
      setSubmitMessage("Danke! Dein Vorschlag wurde an den Owner weitergeleitet.");
      setTitle("");
      setMessage("");
      if (isOwner && payload.item) {
        setItems((prev) => {
          const next = [payload.item as FeatureRequestItem, ...prev];
          writeLocalJsonCache(FEEDBACK_OWNER_INBOX_CACHE_KEY, {
            savedAt: Date.now(),
            items: next,
          } satisfies CachedFeedbackInboxPayload);
          return next;
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateItem = async (
    id: string,
    patch: Partial<Pick<FeatureRequestItem, "status" | "owner_reply">>
  ) => {
    if (!isOwner) return;
    const res = await fetch("/api/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status: patch.status,
        ownerReply: patch.owner_reply,
      }),
    });
    const payload = (await res.json()) as { item?: FeatureRequestItem; error?: string };
    if (!res.ok || !payload.item) throw new Error(payload.error ?? "Update fehlgeschlagen.");
    setItems((prev) => {
      const next = prev.map((x) => (x.id === id ? (payload.item as FeatureRequestItem) : x));
      writeLocalJsonCache(FEEDBACK_OWNER_INBOX_CACHE_KEY, {
        savedAt: Date.now(),
        items: next,
      } satisfies CachedFeedbackInboxPayload);
      return next;
    });
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-6">
      <div className="space-y-1">
        <h1 className={DASHBOARD_PAGE_TITLE}>Update & Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Updates, Neuerungen und Vorschläge für Verbesserungen.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
        <h2 className="text-base font-semibold">Updates</h2>
        <div className="space-y-3">
          {updates.map((u) => (
            <div
              key={u.date + u.title}
              className="flex overflow-hidden rounded-lg border border-border/60 bg-muted/20 shadow-sm dark:bg-muted/15"
            >
              <div
                className="w-1 shrink-0 bg-amber-400/50 dark:bg-amber-500/35"
                aria-hidden
              />
              <div className="min-w-0 flex-1 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{u.title}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{u.date}</p>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{u.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        data-tutorial-target="updates-card"
        className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Update-Tutorials</h2>
          <button
            type="button"
            onClick={() => void loadUpdateTutorials()}
            className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40"
          >
            Neu laden
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Bei Releases kannst du hier das passende Tutorial starten oder erneut ansehen.
        </p>
        {tutorialsLoading ? (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Tutorials werden geladen...
          </div>
        ) : null}
        {!tutorialsLoading && updateTutorials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aktuell keine Update-Tutorials verfuegbar.</p>
        ) : null}
        <div className="space-y-2">
          {updateTutorials.map((item) => (
            <div
              key={item.tour.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/70 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.tour.title}</p>
                <p className="text-xs text-muted-foreground">{item.tour.summary}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Release: {item.tour.release_key ?? "manual-release"} · Szenen: {item.tour.scenes.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {item.completed ? "Abgeschlossen" : item.dismissed ? "Abgebrochen" : "Neu"}
                </span>
                <button
                  type="button"
                  onClick={() => dispatchStartTutorialEvent(item.tour.id)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  {item.completed ? "Erneut ansehen" : "Starten"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
        <h2 className="text-base font-semibold">Vorschlag / Wunschfunktion</h2>
        <p className="text-sm text-muted-foreground">
          Sende Verbesserungen oder Feature-Wünsche. Nur die Rolle <span className="font-medium">Owner</span> kann
          alle Eingaben unter „Verbesserung und Wünsche“ einsehen und bearbeiten.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="title">
                Titel
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="z.B. Export als CSV pro Zeitraum"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="who">
                Von
              </label>
              <input
                id="who"
                value={user.email || "—"}
                disabled
                className="w-full rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="message">
              Beschreibung
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[110px] w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Was soll verbessert werden und warum?"
              required
            />
          </div>

          {submitMessage ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              {submitMessage}
            </p>
          ) : null}
          {submitError ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Vorschlag senden
          </button>
        </form>
      </section>

      {isOwner && !user.isLoading ? (
        <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Verbesserung und Wünsche</h2>
              {inboxBackgroundSyncing ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Abgleich…
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void loadOwnerInbox(false)}
              disabled={isLoadingInbox}
              className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40 disabled:opacity-50"
            >
              Aktualisieren
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Nur sichtbar für die Rolle Owner: alle eingereichten Vorschläge, Status setzen und antworten.
          </p>

          {inboxError ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
              {inboxError}
            </p>
          ) : null}

          {isLoadingInbox ? (
            <p className="text-sm text-muted-foreground">Lade Vorschläge…</p>
          ) : items.length ? (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/40 bg-background/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.user_email} · {new Date(item.created_at).toLocaleString("de-DE")}
                      </p>
                    </div>
                    <select
                      value={item.status}
                      onChange={(e) => {
                        void updateItem(item.id, { status: e.target.value as FeatureRequestItem["status"] }).catch(
                          (err) => setInboxError(err instanceof Error ? err.message : "Unbekannter Fehler.")
                        );
                      }}
                      className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                    >
                      <option value="open">open</option>
                      <option value="in_progress">in_progress</option>
                      <option value="done">done</option>
                    </select>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>

                  <div className="mt-3 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Owner Antwort</label>
                    <textarea
                      value={item.owner_reply ?? ""}
                      onChange={(e) => {
                        const next = e.target.value;
                        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, owner_reply: next } : x)));
                      }}
                      className="min-h-[70px] w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      placeholder="Antwort an den Nutzer..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void updateItem(item.id, { owner_reply: item.owner_reply ?? "" }).catch((err) =>
                          setInboxError(err instanceof Error ? err.message : "Unbekannter Fehler.")
                        );
                      }}
                      className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40"
                    >
                      Antwort speichern
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Vorschlaege eingegangen.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
