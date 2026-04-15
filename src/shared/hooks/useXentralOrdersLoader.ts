"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  shouldRunBackgroundSync,
} from "@/shared/lib/dashboardClientCache";
import { mergeXentralOrderLists } from "@/shared/lib/xentralOrderMerge";
import {
  XENTRAL_ORDERS_CACHE_KEY,
  applyAddressDemoMerge,
  defaultBerlinLastTwoDays,
  withNormalizedPrimaryFields,
  type CachedPayload,
  type ImportMode,
  type XentralOrderRow,
  type XentralOrdersLoadOptions,
} from "@/shared/lib/xentral-orders-utils";

export type UseXentralOrdersLoaderResult = {
  data: XentralOrderRow[];
  setData: React.Dispatch<React.SetStateAction<XentralOrderRow[]>>;
  displayedRows: XentralOrderRow[];
  setDisplayedRows: React.Dispatch<React.SetStateAction<XentralOrderRow[]>>;
  displayedRowsRef: React.MutableRefObject<XentralOrderRow[]>;
  dataRef: React.MutableRefObject<XentralOrderRow[]>;
  isLoading: boolean;
  error: string | null;
  totalCount: number | null;
  importMode: ImportMode;
  setImportMode: React.Dispatch<React.SetStateAction<ImportMode>>;
  hasMounted: boolean;
  dateFrom: string;
  setDateFrom: React.Dispatch<React.SetStateAction<string>>;
  dateTo: string;
  setDateTo: React.Dispatch<React.SetStateAction<string>>;
  berlinRangeRef: React.MutableRefObject<{ from: string; to: string }>;
  xentralOrderWebBase: string | null;
  xentralSalesOrderWebPath: string;
  isBackgroundSyncing: boolean;
  load: (options?: XentralOrdersLoadOptions) => Promise<void>;
};

export default function useXentralOrdersLoader(params: {
  t: (key: string, params?: Record<string, string | number>) => string;
}): UseXentralOrdersLoaderResult {
  const { t } = params;

  const [data, setData] = useState<XentralOrderRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("recent");
  const [hasMounted, setHasMounted] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [xentralOrderWebBase, setXentralOrderWebBase] = useState<string | null>(null);
  const [xentralSalesOrderWebPath, setXentralSalesOrderWebPath] = useState("/sales-orders");
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const dataRef = useRef<XentralOrderRow[]>([]);
  const displayedRowsRef = useRef<XentralOrderRow[]>([]);
  const importModeRef = useRef<ImportMode>("recent");
  const berlinRangeRef = useRef({ from: "", to: "" });
  const dateFromRef = useRef("");
  const dateToRef = useRef("");
  const prevDateFilterRef = useRef<{ from: string; to: string } | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    displayedRowsRef.current = displayedRows;
  }, [displayedRows]);
  useEffect(() => {
    importModeRef.current = importMode;
  }, [importMode]);

  const load = useCallback(
    async (options?: XentralOrdersLoadOptions) => {
      const bustServerCache = options?.bustServerCache ?? false;
      const silent = options?.silent ?? false;
      const mode = options?.mode;
      let fetchMode: ImportMode = mode ?? importModeRef.current;
      let hadCache = false;

      if (!bustServerCache && !silent) {
        const raw = localStorage.getItem(XENTRAL_ORDERS_CACHE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CachedPayload;
            if (
              Array.isArray(parsed.items) &&
              (parsed.importMode === "recent" || parsed.importMode === "all")
            ) {
              const normalized = withNormalizedPrimaryFields(parsed.items);
              const forUi = applyAddressDemoMerge(normalized);
              dataRef.current = forUi;
              setData(forUi);
              setDisplayedRows(forUi);
              setTotalCount(
                typeof parsed.xentralTotalCount === "number"
                  ? parsed.xentralTotalCount
                  : parsed.items.length
              );
              setImportMode(parsed.importMode);
              importModeRef.current = parsed.importMode;
              fetchMode = parsed.importMode;
              setXentralOrderWebBase(parsed.xentralOrderWebBase ?? null);
              setXentralSalesOrderWebPath(parsed.xentralSalesOrderWebPath ?? "/sales-orders");
              hadCache = true;
              setIsLoading(false);
            }
          } catch {
            /* Cache ungültig */
          }
        }
      }

      const retainVisual = hadCache || dataRef.current.length > 0;
      if (!silent && !retainVisual && !hadCache) {
        setIsLoading(true);
      }
      if (silent || retainVisual) {
        setIsBackgroundSyncing(true);
      }

      if (!silent) {
        setError(null);
      }

      try {
        let qs: URLSearchParams;
        if (fetchMode === "all") {
          qs = new URLSearchParams({ all: "1", limit: "50" });
        } else {
          qs = new URLSearchParams({ recentDays: "2", limit: "50" });
          const f = dateFromRef.current.trim();
          const to = dateToRef.current.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
            qs.set("fromYmd", f);
            qs.set("toYmd", to);
          }
        }
        if (bustServerCache) {
          qs.set("refresh", "1");
        }
        const res = await fetch(`/api/xentral/orders?${qs.toString()}`, {
          cache: "no-store",
        });

        const payload = (await res.json()) as {
          items?: XentralOrderRow[];
          totalCount?: number;
          error?: string;
          meta?: {
            mode?: string;
            stoppedEarly?: boolean;
            fromYmd?: string;
            toYmd?: string;
            xentralOrderWebBase?: string | null;
            xentralSalesOrderWebPath?: string;
          };
        };

        if (!res.ok) {
          throw new Error(payload.error ?? t("xentralOrders.loadFailed"));
        }

        const normalized = withNormalizedPrimaryFields(payload.items ?? []);
        const nextItems = applyAddressDemoMerge(normalized);
        const apiTotal =
          typeof payload.totalCount === "number" ? payload.totalCount : normalized.length;

        const linkBase = payload.meta?.xentralOrderWebBase ?? null;
        const linkPath = payload.meta?.xentralSalesOrderWebPath ?? "/sales-orders";
        setXentralOrderWebBase(linkBase);
        setXentralSalesOrderWebPath(linkPath);

        const merged = mergeXentralOrderLists(dataRef.current, nextItems, {
          dropMissingFromPrevious: false,
        });
        const stored = merged;
        dataRef.current = merged;
        setData(merged);

        setTotalCount(apiTotal);
        setImportMode(fetchMode);
        importModeRef.current = fetchMode;

        if (
          fetchMode === "recent" &&
          (payload.meta?.mode === "recentDays" || payload.meta?.mode === "dateRange") &&
          typeof payload.meta.fromYmd === "string" &&
          typeof payload.meta.toYmd === "string"
        ) {
          berlinRangeRef.current = {
            from: payload.meta.fromYmd,
            to: payload.meta.toYmd,
          };
          setDateFrom(payload.meta.fromYmd);
          setDateTo(payload.meta.toYmd);
          dateFromRef.current = payload.meta.fromYmd;
          dateToRef.current = payload.meta.toYmd;
        }

        if (
          fetchMode === "recent" &&
          (payload.meta?.mode === "recentDays" || payload.meta?.mode === "dateRange") &&
          payload.meta?.stoppedEarly
        ) {
          console.warn(
            "[Xentral] Datumsimport vorzeitig beendet (leere Seiten). Bei fehlenden Aufträgen: „Alle laden\"."
          );
        }

        const savedAt = Date.now();
        localStorage.setItem(
          XENTRAL_ORDERS_CACHE_KEY,
          JSON.stringify({
            savedAt,
            items: stored,
            importMode: fetchMode,
            xentralTotalCount: apiTotal,
            xentralOrderWebBase: linkBase,
            xentralSalesOrderWebPath: linkPath,
          } satisfies CachedPayload)
        );
      } catch (e) {
        if (silent) {
          console.warn("[Xentral] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
          setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
        if (silent || retainVisual) {
          setIsBackgroundSyncing(false);
        }
      }
    },
    [t]
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setHasMounted(true);
    const d = defaultBerlinLastTwoDays();
    berlinRangeRef.current = { from: d.from, to: d.to };
    dateFromRef.current = d.from;
    dateToRef.current = d.to;
    setDateFrom(d.from);
    setDateTo(d.to);
    void loadRef.current();
  }, []);

  useEffect(() => {
    dateFromRef.current = dateFrom;
    dateToRef.current = dateTo;
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!hasMounted || importMode !== "recent") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return;
    const prev = prevDateFilterRef.current;
    prevDateFilterRef.current = { from: dateFrom, to: dateTo };
    if (!prev || (prev.from === dateFrom && prev.to === dateTo)) return;
    const id = window.setTimeout(() => {
      void loadRef.current({ mode: "recent" });
    }, 450);
    return () => window.clearTimeout(id);
  }, [dateFrom, dateTo, hasMounted, importMode]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadRef.current({ silent: true });
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted]);

  return {
    data,
    setData,
    displayedRows,
    setDisplayedRows,
    displayedRowsRef,
    dataRef,
    isLoading,
    error,
    totalCount,
    importMode,
    setImportMode,
    hasMounted,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    berlinRangeRef,
    xentralOrderWebBase,
    xentralSalesOrderWebPath,
    isBackgroundSyncing,
    load,
  };
}
