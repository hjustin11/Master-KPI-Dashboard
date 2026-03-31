"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, PlayCircle, Send } from "lucide-react";
import { useUser } from "@/shared/hooks/useUser";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import { dispatchStartTutorialEvent } from "@/shared/components/tutorial/TutorialRuntimeController";
import { usePermissions } from "@/shared/hooks/usePermissions";

type FeedbackAttachmentMeta = {
  path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
};

type FeatureRequestItem = {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string;
  title: string;
  message: string;
  status: "open" | "in_progress" | "done";
  owner_reply: string | null;
  page_path: string | null;
  attachments: FeedbackAttachmentMeta[];
};

const FEEDBACK_OWNER_INBOX_CACHE_KEY = "dashboard_feedback_inbox_owner_v2";

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

type ChangelogEntry = {
  date: string;
  title: string;
  text: string;
  /** Entspricht `release_key` eines veröffentlichten Update-Tutorials (optional). */
  releaseKey?: string;
};

/** Kuratierte Dashboard-Pfade für „Bezug“ (API validiert weiterhin nur sichere Pfade). */
const FEEDBACK_PAGE_OPTIONS: Array<{ path: string; label: string; group: string }> = [
  { group: "Allgemein", path: "/", label: "Start" },
  { group: "Allgemein", path: "/updates", label: "Update & Feedback" },
  { group: "Administration", path: "/settings/users", label: "Benutzerverwaltung" },
  { group: "Administration", path: "/settings/profile", label: "Profil" },
  { group: "Administration", path: "/settings/tutorials", label: "Tutorial-Editor" },
  { group: "Analytics", path: "/analytics/marketplaces", label: "Analytics · Marktplätze" },
  { group: "Analytics", path: "/analytics/article-forecast", label: "Analytics · Bedarfsprognose" },
  { group: "Analytics", path: "/analytics/procurement", label: "Analytics · Beschaffung" },
  { group: "Werbung", path: "/advertising/campaigns", label: "Werbung · Kampagnen" },
  { group: "Werbung", path: "/advertising/performance", label: "Werbung · Performance" },
  { group: "Xentral", path: "/xentral/products", label: "Xentral · Artikel" },
  { group: "Xentral", path: "/xentral/orders", label: "Xentral · Aufträge" },
  { group: "Marktplätze", path: "/amazon/orders", label: "Amazon · Bestellungen" },
  { group: "Marktplätze", path: "/amazon/products", label: "Amazon · Produkte" },
  { group: "Marktplätze", path: "/ebay/orders", label: "eBay · Bestellungen" },
  { group: "Marktplätze", path: "/ebay/products", label: "eBay · Produkte" },
  { group: "Marktplätze", path: "/otto/orders", label: "Otto · Bestellungen" },
  { group: "Marktplätze", path: "/otto/products", label: "Otto · Produkte" },
  { group: "Marktplätze", path: "/kaufland/orders", label: "Kaufland · Bestellungen" },
  { group: "Marktplätze", path: "/kaufland/products", label: "Kaufland · Produkte" },
  { group: "Marktplätze", path: "/fressnapf/orders", label: "Fressnapf · Bestellungen" },
  { group: "Marktplätze", path: "/fressnapf/products", label: "Fressnapf · Produkte" },
  { group: "Marktplätze", path: "/mediamarkt-saturn/orders", label: "MediaMarkt & Saturn · Bestellungen" },
  { group: "Marktplätze", path: "/mediamarkt-saturn/products", label: "MediaMarkt & Saturn · Produkte" },
  { group: "Marktplätze", path: "/zooplus/orders", label: "ZooPlus · Bestellungen" },
  { group: "Marktplätze", path: "/zooplus/products", label: "ZooPlus · Produkte" },
  { group: "Marktplätze", path: "/tiktok/orders", label: "TikTok · Bestellungen" },
  { group: "Marktplätze", path: "/tiktok/products", label: "TikTok · Produkte" },
  { group: "Marktplätze", path: "/shopify/orders", label: "Shopify · Bestellungen" },
  { group: "Marktplätze", path: "/shopify/products", label: "Shopify · Produkte" },
];

const FEEDBACK_PAGE_PATH_SET = new Set(FEEDBACK_PAGE_OPTIONS.map((o) => o.path));

async function parseJsonFromResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
    throw new Error(
      res.ok
        ? "Ungültige Server-Antwort."
        : `Serverfehler (${res.status}): ${snippet}`
    );
  }
}

const FEEDBACK_PAGE_GROUPS = (() => {
  const map = new Map<string, Array<{ path: string; label: string; group: string }>>();
  for (const opt of FEEDBACK_PAGE_OPTIONS) {
    if (!map.has(opt.group)) map.set(opt.group, []);
    map.get(opt.group)!.push(opt);
  }
  return Array.from(map.entries());
})();

function normalizeInboxItem(raw: Record<string, unknown>): FeatureRequestItem {
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  return {
    id: String(raw.id ?? ""),
    created_at: String(raw.created_at ?? ""),
    user_id: String(raw.user_id ?? ""),
    user_email: String(raw.user_email ?? ""),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? ""),
    status: (raw.status as FeatureRequestItem["status"]) ?? "open",
    owner_reply: raw.owner_reply == null ? null : String(raw.owner_reply),
    page_path: raw.page_path == null || raw.page_path === "" ? null : String(raw.page_path),
    attachments: attachments as FeedbackAttachmentMeta[],
  };
}

export default function UpdatesPage() {
  const user = useUser();
  const { canViewWidget, canUseAction } = usePermissions();
  const isOwner = user.roleKey?.toLowerCase() === "owner";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [files, setFiles] = useState<File[]>([]);
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

  const updates = useMemo<ChangelogEntry[]>(
    () => [
      {
        date: "2026-03-27",
        title: "Update & Feedback gestartet",
        text: "Updates & Vorschläge sind jetzt zentral gebündelt. Wo nötig, kannst du ein passendes Release-Tutorial direkt hier starten.",
        releaseKey: "2026-04-release-1",
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      try {
        const decoded = decodeURIComponent(ref);
        if (decoded.startsWith("/") && !decoded.includes("..") && FEEDBACK_PAGE_PATH_SET.has(decoded)) {
          setPagePath(decoded);
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const loadOwnerInbox = useCallback(async (silent = false) => {
    let hadCache = false;

    if (!silent) {
      const parsed = readLocalJsonCache<CachedFeedbackInboxPayload>(FEEDBACK_OWNER_INBOX_CACHE_KEY);
      if (parsed && Array.isArray(parsed.items)) {
        setItems(parsed.items.map((x) => normalizeInboxItem(x as unknown as Record<string, unknown>)));
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
      const payload = await parseJsonFromResponse<{ items?: FeatureRequestItem[]; error?: string }>(
        res
      );
      if (!res.ok) throw new Error(payload.error ?? "Liste konnte nicht geladen werden.");
      const nextItems = (payload.items ?? []).map((row) =>
        normalizeInboxItem(row as unknown as Record<string, unknown>)
      );
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

  const resolveTutorialForChangelog = useCallback(
    (releaseKey: string | undefined) => {
      if (!releaseKey) return undefined;
      return updateTutorials.find((t) => t.tour.release_key === releaseKey);
    },
    [updateTutorials]
  );

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUseAction("updates.feedback.submit")) {
      setSubmitError("Du hast keine Berechtigung zum Absenden.");
      return;
    }
    setSubmitError(null);
    setSubmitMessage(null);
    setIsSubmitting(true);
    try {
      const hasFiles = files.length > 0;
      const res = hasFiles
        ? await submitFeedbackMultipart({ title, message, pagePath, files })
        : await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              message,
              page_path: pagePath.trim() || undefined,
            }),
          });
      const payload = await parseJsonFromResponse<{ item?: FeatureRequestItem; error?: string }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Vorschlag konnte nicht gesendet werden.");
      setSubmitMessage("Danke! Dein Vorschlag wurde an den Owner weitergeleitet.");
      setTitle("");
      setMessage("");
      setPagePath("");
      setFiles([]);
      if (isOwner && payload.item) {
        const normalized = normalizeInboxItem(payload.item as unknown as Record<string, unknown>);
        setItems((prev) => {
          const next = [normalized, ...prev];
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
    const payload = await parseJsonFromResponse<{ item?: FeatureRequestItem; error?: string }>(res);
    if (!res.ok || !payload.item) throw new Error(payload.error ?? "Update fehlgeschlagen.");
    const normalized = normalizeInboxItem(payload.item as unknown as Record<string, unknown>);
    setItems((prev) => {
      const next = prev.map((x) => (x.id === id ? normalized : x));
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

      {canViewWidget("updates.changelog") ? (
      <section
        data-tutorial-target="updates-card"
        className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Updates</h2>
          <button
            type="button"
            onClick={() => void loadUpdateTutorials()}
            className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40"
          >
            Tutorials neu laden
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Neuigkeiten zum Produkt. Ist zu einem Eintrag ein Tutorial hinterlegt (gleicher Release wie in den
          Einstellungen), erscheint ein Button zum Starten – nur wenn für deine Rolle ein Tutorial existiert.
        </p>
        {tutorialsLoading ? (
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Tutorials werden geladen…
          </div>
        ) : null}

        <div className="space-y-3">
          {updates.map((u) => {
            const tutorial = u.releaseKey ? resolveTutorialForChangelog(u.releaseKey) : undefined;
            return (
              <div
                key={u.date + u.title}
                className="flex overflow-hidden rounded-lg border border-border/60 bg-muted/20 shadow-sm dark:bg-muted/15"
              >
                <div className="w-1 shrink-0 bg-amber-400/50 dark:bg-amber-500/35" aria-hidden />
                <div className="min-w-0 flex-1 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{u.title}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{u.date}</p>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{u.text}</p>
                  {tutorial ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => dispatchStartTutorialEvent(tutorial.tour.id)}
                        disabled={!canUseAction("updates.tutorial.start")}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                      >
                        <PlayCircle className="h-4 w-4 shrink-0" aria-hidden />
                        {tutorial.completed ? "Tutorial erneut ansehen" : "Zum Tutorial"}
                      </button>
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {tutorial.completed ? "Abgeschlossen" : tutorial.dismissed ? "Abgebrochen" : "Neu"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      ) : null}

      {canViewWidget("updates.feedbackForm") ? (
      <section className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5">
        <h2 className="text-base font-semibold">Vorschlag / Wunschfunktion</h2>
        <p className="text-sm text-muted-foreground">
          Sende Verbesserungen oder Feature-Wünsche.
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
            <label className="text-sm font-medium" htmlFor="page_path">
              Bezug (optional)
            </label>
            <select
              id="page_path"
              value={pagePath}
              onChange={(e) => setPagePath(e.target.value)}
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Kein Bezug</option>
              {FEEDBACK_PAGE_GROUPS.map(([group, opts]) => (
                <optgroup key={group} label={group}>
                  {opts.map((opt) => (
                    <option key={opt.path} value={opt.path}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
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

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="files">
              Anhänge (optional)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent/40">
                <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
                Dateien wählen
                <input
                  id="files"
                  type="file"
                  className="sr-only"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              <span className="text-xs text-muted-foreground">Max. 8 Dateien, je 5 MB.</span>
            </div>
            {files.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {files.map((f) => (
                  <li key={f.name + f.size} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{f.name}</span>
                    <span className="shrink-0 tabular-nums">{(f.size / 1024).toFixed(0)} KB</span>
                  </li>
                ))}
              </ul>
            ) : null}
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
            disabled={isSubmitting || !canUseAction("updates.feedback.submit")}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Vorschlag senden
          </button>
        </form>
      </section>
      ) : null}

      {isOwner && !user.isLoading && canViewWidget("updates.ownerInbox") ? (
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
                      disabled={!canUseAction("updates.ownerInbox.status")}
                      onChange={(e) => {
                        void updateItem(item.id, {
                          status: e.target.value as FeatureRequestItem["status"],
                        }).catch((err) =>
                          setInboxError(err instanceof Error ? err.message : "Unbekannter Fehler.")
                        );
                      }}
                      className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                    >
                      <option value="open">open</option>
                      <option value="in_progress">in_progress</option>
                      <option value="done">done</option>
                    </select>
                  </div>

                  {item.page_path ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Bezug: </span>
                      <code className="rounded bg-muted/50 px-1 py-0.5 text-foreground">{item.page_path}</code>
                    </p>
                  ) : null}

                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>

                  {item.attachments?.length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {item.attachments.map((att, idx) => (
                        <li key={att.path}>
                          <a
                            href={`/api/feedback/download?requestId=${encodeURIComponent(item.id)}&fileIndex=${idx}`}
                            className="text-primary underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {att.filename}
                          </a>
                          <span className="ml-2 text-muted-foreground">
                            ({Math.max(1, Math.round(att.size_bytes / 1024))} KB)
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

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
                      disabled={!canUseAction("updates.ownerInbox.reply")}
                      onClick={() => {
                        void updateItem(item.id, { owner_reply: item.owner_reply ?? "" }).catch((err) =>
                          setInboxError(err instanceof Error ? err.message : "Unbekannter Fehler.")
                        );
                      }}
                      className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40 disabled:opacity-40"
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

async function submitFeedbackMultipart(args: {
  title: string;
  message: string;
  pagePath: string;
  files: File[];
}) {
  const fd = new FormData();
  fd.append("title", args.title);
  fd.append("message", args.message);
  if (args.pagePath.trim()) {
    fd.append("page_path", args.pagePath.trim());
  }
  for (const f of args.files) {
    fd.append("files", f);
  }
  return fetch("/api/feedback", {
    method: "POST",
    body: fd,
  });
}
