"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ListRestart, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeveloperUiVisible } from "@/shared/hooks/useDeveloperUiVisible";
import { subscribeDevFetchLog } from "@/shared/dev/subscribeDevFetchLog";
import { cn } from "@/shared/lib/utils";

const STORAGE_EXPANDED = "dev-live-log-expanded";
const MAX_ENTRIES = 200;

export type DevLiveLogKind = "nav" | "fetch" | "info";

export type DevLiveLogEntry = {
  id: string;
  ts: number;
  kind: DevLiveLogKind;
  title: string;
  detail?: string;
};

type DevLiveLogContextValue = {
  log: (title: string, detail?: string) => void;
};

const DevLiveLogContext = createContext<DevLiveLogContextValue | null>(null);

export function useDevLiveLog(): DevLiveLogContextValue {
  const ctx = useContext(DevLiveLogContext);
  return ctx ?? { log: () => {} };
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DevLiveLogRouteTracker(props: { push: (entry: DevLiveLogEntry) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const prev = useRef("");
  const { push } = props;

  useEffect(() => {
    const full = qs ? `${pathname}?${qs}` : pathname;
    if (full === prev.current) return;
    prev.current = full;
    push({
      id: newId(),
      ts: Date.now(),
      kind: "nav",
      title: "Seitenwechsel",
      detail: full,
    });
  }, [pathname, qs, push]);

  return null;
}

function DevLiveLogPanel(props: {
  entries: DevLiveLogEntry[];
  expanded: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const { entries, expanded, onToggle, onClear } = props;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-[200] flex flex-col gap-1",
        "pointer-events-auto max-w-[min(22rem,calc(100vw-2rem))]",
      )}
    >
      {!expanded ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 gap-1.5 border border-slate-600/80 bg-slate-900/92 text-slate-100 shadow-lg backdrop-blur-sm hover:bg-slate-800"
          onClick={onToggle}
          aria-expanded={false}
        >
          <Terminal className="h-4 w-4 shrink-0 opacity-90" />
          <span className="text-xs font-medium">Live-Log</span>
          {entries.length > 0 ? (
            <span className="rounded-full bg-amber-500/25 px-1.5 py-0 text-[10px] font-semibold text-amber-200">
              {entries.length > 99 ? "99+" : entries.length}
            </span>
          ) : null}
        </Button>
      ) : (
        <div
          className={cn(
            "flex max-h-[min(40vh,320px)] flex-col overflow-hidden rounded-lg border border-slate-600/90",
            "bg-slate-950/96 text-slate-100 shadow-2xl backdrop-blur-md",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-xs font-semibold tracking-tight text-slate-200">
                Entwickler · Live-Log
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                onClick={onClear}
                title="Log leeren"
              >
                <ListRestart className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                onClick={onToggle}
                title="Einklappen"
                aria-expanded
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
            {entries.length === 0 ? (
              <p className="px-1 py-3 text-center text-[11px] leading-relaxed text-slate-500">
                Noch keine Einträge. API-Aufrufe unter <code className="text-slate-400">/api/*</code> und
                Seitenwechsel erscheinen hier.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {[...entries].reverse().map((e) => (
                  <li
                    key={e.id}
                    className="rounded border border-slate-800/80 bg-slate-900/50 px-2 py-1.5 text-[11px] leading-snug"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-[10px] text-slate-500">{formatTime(e.ts)}</span>
                      <span
                        className={cn(
                          "rounded px-1 py-0 text-[9px] font-bold uppercase tracking-wide",
                          e.kind === "nav" && "bg-sky-500/20 text-sky-200",
                          e.kind === "fetch" && "bg-emerald-500/15 text-emerald-200",
                          e.kind === "info" && "bg-violet-500/15 text-violet-200",
                        )}
                      >
                        {e.kind === "nav" ? "Route" : e.kind === "fetch" ? "API" : "Info"}
                      </span>
                      <span className="min-w-0 flex-1 font-medium text-slate-200">{e.title}</span>
                    </div>
                    {e.detail ? (
                      <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-400">
                        {e.detail}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DevLiveLogProvider({ children }: { children: ReactNode }) {
  const enabled = useDeveloperUiVisible();
  const [entries, setEntries] = useState<DevLiveLogEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(STORAGE_EXPANDED);
      if (v === "1") setExpanded(true);
    } catch {
      // ignore
    }
  }, []);

  const setExpandedPersist = useCallback((next: boolean) => {
    setExpanded(next);
    try {
      window.localStorage.setItem(STORAGE_EXPANDED, next ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const push = useCallback((entry: DevLiveLogEntry) => {
    setEntries((prev) => [...prev.slice(-(MAX_ENTRIES - 1)), entry]);
  }, []);

  const log = useCallback(
    (title: string, detail?: string) => {
      if (!enabled) return;
      push({
        id: newId(),
        ts: Date.now(),
        kind: "info",
        title,
        detail,
      });
    },
    [enabled, push],
  );

  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!enabled) return;
    return subscribeDevFetchLog((payload) => {
      const { method, pathWithQuery, status, ok, ms, error } = payload;
      let title: string;
      if (error) {
        title = `${method} ${pathWithQuery} · Fehler · ${ms}ms`;
      } else {
        const st = status ?? "—";
        const flag = ok === false ? " (Hinweis)" : "";
        title = `${method} ${pathWithQuery} · ${st} · ${ms}ms${flag}`;
      }
      pushRef.current({
        id: newId(),
        ts: Date.now(),
        kind: "fetch",
        title,
        detail: error,
      });
    });
  }, [enabled]);

  const onClear = useCallback(() => setEntries([]), []);

  const ctx = useMemo(() => ({ log }), [log]);

  return (
    <DevLiveLogContext.Provider value={ctx}>
      {children}
      {enabled ? (
        <>
          <Suspense fallback={null}>
            <DevLiveLogRouteTracker push={push} />
          </Suspense>
          <DevLiveLogPanel
            entries={entries}
            expanded={expanded}
            onToggle={() => setExpandedPersist(!expanded)}
            onClear={onClear}
          />
        </>
      ) : null}
    </DevLiveLogContext.Provider>
  );
}
