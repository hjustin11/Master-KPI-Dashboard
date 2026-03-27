"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useUser } from "@/shared/hooks/useUser";

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

export default function UpdatesPage() {
  const user = useUser();
  const isOwner = user.roleKey === "owner";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [items, setItems] = useState<FeatureRequestItem[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOwner) return;
    const load = async () => {
      setIsLoadingInbox(true);
      setInboxError(null);
      try {
        const res = await fetch("/api/feedback");
        const payload = (await res.json()) as { items?: FeatureRequestItem[]; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Inbox konnte nicht geladen werden.");
        setItems(payload.items ?? []);
      } catch (e) {
        setInboxError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      } finally {
        setIsLoadingInbox(false);
      }
    };
    void load();
  }, [isOwner]);

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
        setItems((prev) => [payload.item as FeatureRequestItem, ...prev]);
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
    setItems((prev) => prev.map((x) => (x.id === id ? (payload.item as FeatureRequestItem) : x)));
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Update & Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Updates, Neuerungen und Vorschläge für Verbesserungen.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
        <h2 className="text-base font-semibold">Updates</h2>
        <div className="space-y-3">
          {updates.map((u) => (
            <div key={u.date + u.title} className="rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{u.title}</p>
                <p className="text-xs text-muted-foreground">{u.date}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{u.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
        <h2 className="text-base font-semibold">Vorschlag / Wunschfunktion</h2>
        <p className="text-sm text-muted-foreground">
          Sende Verbesserungen oder Feature-Wünsche. Der Owner sieht sie in seiner Inbox.
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

      {isOwner ? (
        <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Owner Inbox (Chat-Bereich)</h2>
            <button
              type="button"
              onClick={() => {
                setIsLoadingInbox(true);
                setInboxError(null);
                void fetch("/api/feedback")
                  .then(async (res) => {
                    const payload = (await res.json()) as { items?: FeatureRequestItem[]; error?: string };
                    if (!res.ok) throw new Error(payload.error ?? "Inbox konnte nicht geladen werden.");
                    setItems(payload.items ?? []);
                  })
                  .catch((e) => setInboxError(e instanceof Error ? e.message : "Unbekannter Fehler."))
                  .finally(() => setIsLoadingInbox(false));
              }}
              className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40"
            >
              Aktualisieren
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Hier siehst du alle eingereichten Vorschlaege. Du kannst Status setzen und antworten.
          </p>

          {inboxError ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
              {inboxError}
            </p>
          ) : null}

          {isLoadingInbox ? (
            <p className="text-sm text-muted-foreground">Lade Inbox...</p>
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
