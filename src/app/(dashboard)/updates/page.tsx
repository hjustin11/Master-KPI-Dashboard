"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Lightbulb, Loader2, Paperclip, PlayCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/shared/hooks/useUser";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { dispatchStartTutorialEvent } from "@/shared/components/tutorial/TutorialRuntimeController";
import { usePermissions } from "@/shared/hooks/usePermissions";
import {
  getFeedbackInboxSignature,
  getUpdatesSignature,
  markFeedbackInboxAsSeen,
  markUpdatesAsSeen,
  type ChangelogEntry,
} from "@/shared/lib/updatesFeed";

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
const SECTION_CARD_CLASS =
  "space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 shadow-sm backdrop-blur-sm md:p-5";
const SECTION_HEAD_ACCENT_CLASS =
  "border-b border-border/50 bg-gradient-to-r from-primary/[0.08] via-transparent to-accent/[0.06]";

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

type ManagedUpdateItem = {
  id: string;
  date: string;
  title: string;
  text: string;
  release_key: string | null;
  created_at: string;
};

type UpdateDisplayEntry = ChangelogEntry & { id?: string };

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
  const pathname = usePathname();
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
  const [managedUpdates, setManagedUpdates] = useState<ManagedUpdateItem[]>([]);
  const [managedLoading, setManagedLoading] = useState(false);
  const [managedError, setManagedError] = useState<string | null>(null);
  const [newUpdateDate, setNewUpdateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newUpdateTitle, setNewUpdateTitle] = useState("");
  const [newUpdateText, setNewUpdateText] = useState("");
  const [newUpdateReleaseKey, setNewUpdateReleaseKey] = useState("");
  const [isSavingManagedUpdate, setIsSavingManagedUpdate] = useState(false);
  const [isAddUpdateOpen, setIsAddUpdateOpen] = useState(false);

  const updates = useMemo<UpdateDisplayEntry[]>(
    () =>
      managedUpdates.map((item) => ({
        id: item.id,
        date: item.date,
        title: item.title,
        text: item.text,
        releaseKey: item.release_key ?? undefined,
      })).sort((a, b) => b.date.localeCompare(a.date)),
    [managedUpdates]
  );

  /** Gleiche Reihenfolge wie im Changelog, gruppiert nach Datum für eine kompakte Übersicht. */
  const changelogByDate = useMemo(() => {
    const byDate = new Map<string, UpdateDisplayEntry[]>();
    const dateOrder: string[] = [];
    for (const u of updates) {
      if (!byDate.has(u.date)) {
        byDate.set(u.date, []);
        dateOrder.push(u.date);
      }
      byDate.get(u.date)!.push(u);
    }
    return dateOrder.map((date) => ({ date, items: byDate.get(date)! }));
  }, [updates]);

  const loadManagedUpdates = useCallback(async () => {
    setManagedLoading(true);
    setManagedError(null);
    try {
      const res = await fetch("/api/updates", { cache: "no-store" });
      const payload = await parseJsonFromResponse<{
        items?: ManagedUpdateItem[];
        error?: string;
        tableMissing?: boolean;
      }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Updates konnten nicht geladen werden.");
      setManagedUpdates(payload.items ?? []);
      if (payload.tableMissing && isOwner) {
        setManagedError("Update-Tabelle fehlt noch. Bitte DB-Migration ausführen.");
      }
    } catch (e) {
      setManagedError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setManagedLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    void loadManagedUpdates();
  }, [loadManagedUpdates]);

  useEffect(() => {
    const signature = getUpdatesSignature(updates);
    markUpdatesAsSeen(signature);
  }, [updates]);

  /** Auf dieser Seite: Changelog + offene Vorschläge (Owner) als „gelesen“ für die Seitenleiste. */
  useEffect(() => {
    if (pathname !== "/updates" || !isOwner) return;
    markFeedbackInboxAsSeen(getFeedbackInboxSignature(items));
  }, [pathname, isOwner, items]);

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
      const payload = await parseJsonFromResponse<{
        item?: FeatureRequestItem;
        error?: string;
        attachments_skipped?: boolean;
      }>(res);
      if (!res.ok) throw new Error(payload.error ?? "Vorschlag konnte nicht gesendet werden.");
      setSubmitMessage(
        payload.attachments_skipped
          ? "Danke! Dein Text wurde gespeichert. Dateianhänge konnten in diesem Fall nicht mitgeschickt werden – versuche es ggf. ohne Anhänge oder melde dich beim Support."
          : "Danke! Dein Vorschlag wurde an den Owner weitergeleitet."
      );
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

  const deleteItem = async (id: string) => {
    if (!isOwner) return;
    const res = await fetch(`/api/feedback?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const payload = await parseJsonFromResponse<{ ok?: boolean; error?: string }>(res);
    if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Löschen fehlgeschlagen.");
    setItems((prev) => {
      const next = prev.filter((x) => x.id !== id);
      writeLocalJsonCache(FEEDBACK_OWNER_INBOX_CACHE_KEY, {
        savedAt: Date.now(),
        items: next,
      } satisfies CachedFeedbackInboxPayload);
      return next;
    });
  };

  const createManagedUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwner) return;
    setIsSavingManagedUpdate(true);
    setManagedError(null);
    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: newUpdateDate,
          title: newUpdateTitle.trim(),
          text: newUpdateText.trim(),
          releaseKey: newUpdateReleaseKey.trim() || null,
        }),
      });
      const payload = await parseJsonFromResponse<{ item?: ManagedUpdateItem; error?: string }>(res);
      if (!res.ok || !payload.item) throw new Error(payload.error ?? "Update konnte nicht gespeichert werden.");
      setManagedUpdates((prev) => [payload.item!, ...prev]);
      setNewUpdateTitle("");
      setNewUpdateText("");
      setNewUpdateReleaseKey("");
      setIsAddUpdateOpen(false);
    } catch (e) {
      setManagedError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setIsSavingManagedUpdate(false);
    }
  };

  const deleteManagedUpdate = async (id: string) => {
    if (!isOwner) return;
    try {
      const res = await fetch(`/api/updates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await parseJsonFromResponse<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Update konnte nicht gelöscht werden.");
      setManagedUpdates((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      setManagedError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    }
  };

  return (
    <div className="flex w-full max-w-none flex-col gap-6">
      {canViewWidget("updates.changelog") ? (
      /* Texte: UPDATE_CHANGELOG in updatesFeed.ts — nur endnutzerrelevante Funktionsneuerungen (Redaktionsregeln dort). */
      <section
        data-tutorial-target="updates-card"
        className="overflow-hidden rounded-xl border border-border/50 bg-card/80 shadow-sm backdrop-blur-sm"
      >
        <div className={cn(SECTION_HEAD_ACCENT_CLASS, "px-4 py-3 md:px-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Updates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {updates.length} {updates.length === 1 ? "Eintrag" : "Einträge"} · nach Datum gruppiert
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => setIsAddUpdateOpen(true)}
                  className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
                >
                  Update Hinzufügen
                </button>
              ) : null}
              {canUseAction("updates.tutorial.start") ? (
                <button
                  type="button"
                  onClick={() => void loadUpdateTutorials()}
                  className="shrink-0 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  Tutorials neu laden
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-0 px-4 py-3 md:px-5 md:py-4">
          {managedLoading ? (
            <div className="mb-2 text-xs text-muted-foreground">Lade gespeicherte Updates…</div>
          ) : null}
          {managedError ? (
            <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700">
              {managedError}
            </div>
          ) : null}
          {tutorialsLoading ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Tutorials werden geladen…
            </div>
          ) : null}

          <div className="space-y-4">
            {changelogByDate.map(({ date, items }) => (
              <div key={date}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
                    {date}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {items.length} {items.length === 1 ? "Neuerung" : "Neuerungen"}
                  </span>
                </div>
                <ul className="m-0 list-none space-y-2 p-0">
                  {items.map((u) => {
                    const tutorial = u.releaseKey
                      ? resolveTutorialForChangelog(u.releaseKey)
                      : undefined;
                    return (
                      <li
                        key={u.id ?? `${u.date}-${u.title}`}
                        className="overflow-hidden rounded-lg border border-border/50 bg-background/80 shadow-sm"
                      >
                        <div className="min-w-0 px-3 py-2.5 md:px-3.5 md:py-3">
                            <div className="mb-1.5 flex items-start justify-between gap-2">
                              <span />
                              {isOwner && u.id ? (
                                <button
                                  type="button"
                                  onClick={() => void deleteManagedUpdate(u.id!)}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-red-500/35 bg-red-500/10 text-red-700 hover:bg-red-500/20"
                                  aria-label="Update entfernen"
                                  title="Update entfernen"
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              ) : null}
                            </div>
                            <p className="text-sm font-semibold leading-snug text-foreground">{u.title}</p>
                            {(() => {
                              // Konvention: Text kann nach `\n\n— Details —\n` einen
                              // ausführlichen Block enthalten, der per <details> collapsible
                              // dargestellt wird. Ohne Marker bleibt alles wie bisher.
                              const SPLITTER = "\n\n— Details —\n";
                              const idx = u.text.indexOf(SPLITTER);
                              if (idx < 0) {
                                return (
                                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                    {u.text}
                                  </p>
                                );
                              }
                              const summary = u.text.slice(0, idx);
                              const details = u.text.slice(idx + SPLITTER.length);
                              return (
                                <>
                                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                    {summary}
                                  </p>
                                  <details className="group mt-2 rounded-md border border-border/40 bg-muted/30 px-3 py-2 [&>summary::-webkit-details-marker]:hidden">
                                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80">
                                      <svg
                                        className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden
                                      >
                                        <polyline points="6 4 10 8 6 12" />
                                      </svg>
                                      Details ansehen
                                    </summary>
                                    <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                      {details}
                                    </div>
                                  </details>
                                </>
                              );
                            })()}
                            {tutorial ? (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                                <button
                                  type="button"
                                  onClick={() => dispatchStartTutorialEvent(tutorial.tour.id)}
                                  disabled={!canUseAction("updates.tutorial.start")}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                                >
                                  <PlayCircle className="h-4 w-4 shrink-0" aria-hidden />
                                  {tutorial.completed ? "Tutorial erneut ansehen" : "Zum Tutorial"}
                                </button>
                                <span className="text-[11px] text-muted-foreground">
                                  {tutorial.completed
                                    ? "Abgeschlossen"
                                    : tutorial.dismissed
                                      ? "Abgebrochen"
                                      : "Neu"}
                                </span>
                              </div>
                            ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
      ) : null}
      {isOwner ? (
        <Dialog open={isAddUpdateOpen} onOpenChange={setIsAddUpdateOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Update Hinzufügen</DialogTitle>
            </DialogHeader>
            <form onSubmit={createManagedUpdate} className="grid gap-2 md:grid-cols-[160px_1fr]">
              <input
                type="date"
                value={newUpdateDate}
                onChange={(e) => setNewUpdateDate(e.target.value)}
                className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
              <input
                value={newUpdateTitle}
                onChange={(e) => setNewUpdateTitle(e.target.value)}
                placeholder="Neuer Update-Titel"
                className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                required
              />
              <textarea
                value={newUpdateText}
                onChange={(e) => setNewUpdateText(e.target.value)}
                placeholder="Kurze Beschreibung der Neuerung"
                className="md:col-span-2 min-h-[90px] rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                required
              />
              <input
                value={newUpdateReleaseKey}
                onChange={(e) => setNewUpdateReleaseKey(e.target.value)}
                placeholder="Release-Key (optional)"
                className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={isSavingManagedUpdate}
                className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/15 disabled:opacity-50"
              >
                {isSavingManagedUpdate ? "Speichert..." : "Update eintragen"}
              </button>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {canViewWidget("updates.feedbackForm") ? (
      <section className={SECTION_CARD_CLASS}>
        <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/[0.1] via-background/60 to-accent/[0.06] px-3 py-2.5">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary/90">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden />
            Deine Idee verbessert das Dashboard
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            Vorschlag / Wunschfunktion
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Teile kurz, was dir fehlt oder nervt. Kleine Hinweise helfen oft am meisten.
          </p>
        </div>
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
                placeholder="z.B. Schnellfilter für fehlende Artikel"
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
              placeholder="Was genau sollte besser laufen? (1-3 Saetze reichen)"
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
            Idee jetzt senden
          </button>
        </form>
      </section>
      ) : null}

      {isOwner && !user.isLoading && canViewWidget("updates.ownerInbox") ? (
        <section className={SECTION_CARD_CLASS}>
          <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2", SECTION_HEAD_ACCENT_CLASS)}>
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
                    <div className="flex flex-wrap items-center gap-2">
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
                      <button
                        type="button"
                        disabled={!canUseAction("updates.ownerInbox.status") || item.status === "done"}
                        onClick={() => {
                          void updateItem(item.id, { status: "done" }).catch((err) =>
                            setInboxError(err instanceof Error ? err.message : "Unbekannter Fehler.")
                          );
                        }}
                        className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-900 transition-colors hover:bg-amber-400/20 disabled:opacity-40 dark:text-amber-200"
                      >
                        Archivieren
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            "Diesen Wunsch wirklich löschen? Anhänge werden ebenfalls entfernt."
                          );
                          if (!ok) return;
                          void deleteItem(item.id).catch((err) =>
                            setInboxError(err instanceof Error ? err.message : "Unbekannter Fehler.")
                          );
                        }}
                        className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 transition-colors hover:bg-red-500/20 dark:text-red-300"
                      >
                        Löschen
                      </button>
                    </div>
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
