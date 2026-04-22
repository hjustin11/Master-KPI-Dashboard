"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, NotebookPen } from "lucide-react";
import { useTranslation } from "@/i18n/I18nProvider";

type SaveState = "idle" | "saving" | "saved" | "error";

export type WeeklyReportNoteEditorProps = {
  marketplaceSlug: string;
  isoYear: number;
  isoWeek: number;
};

export function WeeklyReportNoteEditor({
  marketplaceSlug,
  isoYear,
  isoWeek,
}: WeeklyReportNoteEditorProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [initialValue, setInitialValue] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initial-Load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/weekly-report/notes?year=${isoYear}&week=${isoWeek}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: { notes?: Record<string, { note?: string; updatedAt?: string }> }) => {
        if (cancelled) return;
        const entry = json?.notes?.[marketplaceSlug];
        const note = entry?.note ?? "";
        setValue(note);
        setInitialValue(note);
        setUpdatedAt(entry?.updatedAt ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isoYear, isoWeek, marketplaceSlug]);

  const persist = useCallback(
    async (next: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSaveState("saving");
      setError(null);
      try {
        const res = await fetch("/api/analytics/weekly-report/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: isoYear,
            week: isoWeek,
            marketplaceSlug,
            note: next,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { note?: string; updatedAt?: string };
        setInitialValue(json.note ?? next);
        setUpdatedAt(json.updatedAt ?? new Date().toISOString());
        setSaveState("saved");
        setTimeout(() => {
          setSaveState((s) => (s === "saved" ? "idle" : s));
        }, 1500);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setSaveState("error");
      }
    },
    [isoYear, isoWeek, marketplaceSlug]
  );

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (next !== initialValue) void persist(next);
      }, 800);
    },
    [initialValue, persist]
  );

  const dirty = value !== initialValue;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <NotebookPen className="h-3 w-3" aria-hidden />
          {t("weeklyReport.notes.heading")}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {saveState === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              {t("weeklyReport.notes.saving")}
            </span>
          ) : saveState === "saved" ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" aria-hidden />
              {t("weeklyReport.notes.saved")}
            </span>
          ) : saveState === "error" ? (
            <span className="text-red-600 dark:text-red-400">
              {t("weeklyReport.notes.error")}
            </span>
          ) : updatedAt ? (
            <span>
              {t("weeklyReport.notes.updatedAt", {
                date: new Date(updatedAt).toLocaleString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </span>
          ) : null}
        </div>
      </div>
      <div className="rounded-md border bg-card shadow-sm">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (dirty) {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              void persist(value);
            }
          }}
          disabled={loading}
          rows={4}
          maxLength={10_000}
          placeholder={t("weeklyReport.notes.placeholder")}
          className="block w-full resize-y rounded-md bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {error ? (
        <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>
      ) : null}
    </div>
  );
}
