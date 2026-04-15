"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { defaultArticleForecastFromToYmd } from "@/shared/lib/xentralArticleForecastProject";
import {
  ARTICLE_FORECAST_CACHE_KEY,
  XENTRAL_ARTICLES_SEED_CACHE_KEY,
  type ArticleForecastCachedPayload,
  type ArticleForecastRow,
  type ArticlesResponseMeta,
  type ProcurementLine,
  type XentralArticlesSeedPayload,
} from "@/shared/lib/article-forecast-utils";

export type UseArticleForecastLoaderResult = {
  fromYmd: string;
  toYmd: string;
  setRange: React.Dispatch<React.SetStateAction<{ fromYmd: string; toYmd: string }>>;
  dateManuallySet: boolean;
  setDateManuallySet: React.Dispatch<React.SetStateAction<boolean>>;
  rows: ArticleForecastRow[];
  procurementLines: ProcurementLine[];
  meta: ArticlesResponseMeta | null;
  error: string | null;
  salesAggError: boolean;
  setSalesAggError: React.Dispatch<React.SetStateAction<boolean>>;
  isLoading: boolean;
  isBackgroundSyncing: boolean;
  hasLoadedOnce: boolean;
  hasMounted: boolean;
  load: (forceRefresh?: boolean, silent?: boolean) => Promise<void>;
};

export default function useArticleForecastLoader(params: {
  t: (key: string, params?: Record<string, string | number>) => string;
}): UseArticleForecastLoaderResult {
  const { t } = params;

  const [{ fromYmd, toYmd }, setRange] = useState(() => defaultArticleForecastFromToYmd());
  const [dateManuallySet, setDateManuallySet] = useState(false);
  const [rows, setRows] = useState<ArticleForecastRow[]>([]);
  const [procurementLines, setProcurementLines] = useState<ProcurementLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salesAggError, setSalesAggError] = useState(false);
  const [meta, setMeta] = useState<ArticlesResponseMeta | null>(null);
  const fetchGenerationRef = useRef(0);

  const load = useCallback(
    async (forceRefresh = false, silent = false) => {
      const generation = ++fetchGenerationRef.current;
      let hadCache = false;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<ArticleForecastCachedPayload>(ARTICLE_FORECAST_CACHE_KEY);
        if (
          parsed &&
          typeof parsed.fromYmd === "string" &&
          typeof parsed.toYmd === "string" &&
          parsed.fromYmd === fromYmd &&
          parsed.toYmd === toYmd &&
          Array.isArray(parsed.items)
        ) {
          const items = parsed.items.map((r) => ({
            ...r,
            stockByLocation: r.stockByLocation ?? {},
          }));
          setRows(items);
          setProcurementLines(parsed.procurementLines ?? []);
          setMeta(parsed.meta ?? null);
          hadCache = true;
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      }

      if (!forceRefresh && !silent && !hadCache) {
        // Fallback: sofort denselben Artikel/Bestands-Stand wie "Xentral -> Artikel" anzeigen.
        const seed = readLocalJsonCache<XentralArticlesSeedPayload>(XENTRAL_ARTICLES_SEED_CACHE_KEY);
        if (seed && Array.isArray(seed.items) && seed.items.length > 0) {
          const seededRows: ArticleForecastRow[] = seed.items.map((r) => ({
            sku: r.sku ?? "",
            name: r.name ?? "",
            stock: Number.isFinite(r.stock) ? r.stock : 0,
            stockByLocation: r.stockByLocation ?? {},
            price: typeof r.price === "number" && Number.isFinite(r.price) ? r.price : null,
            projectId: r.projectId ?? null,
            projectDisplay: r.projectDisplay ?? "—",
            totalSold: 0,
            soldByProject: {},
          }));
          setRows(seededRows);
          setProcurementLines([]);
          setMeta(null);
          hadCache = true;
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      }

      if (forceRefresh && !silent) {
        setIsLoading(true);
      } else if (!hadCache && !silent) {
        setIsLoading(true);
      }

      if (!silent && !hadCache && !forceRefresh) {
        setRows([]);
        setProcurementLines([]);
        setMeta(null);
      }

      const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(true);
      }

      if (!silent) {
        setError(null);
        setSalesAggError(false);
      }

      try {
        const baseQs = new URLSearchParams({
          all: "1",
          limit: "150",
          includePrices: "0",
          includeSales: "0",
        });

        const salesQs = new URLSearchParams({
          all: "1",
          limit: "150",
          includePrices: "0",
          includeSales: "1",
          fromYmd,
          toYmd,
        });

        // Phase 1: Basisdaten wie "Xentral -> Artikel" laden (schnell, ohne Sales-Aggregation).
        const baseRes = await fetch(`/api/xentral/articles?${baseQs.toString()}`, {
          cache: "no-store",
        });
        const basePayload = (await baseRes.json()) as {
          items?: ArticleForecastRow[];
          error?: string;
          meta?: ArticlesResponseMeta;
        };
        if (!baseRes.ok) {
          throw new Error(basePayload.error ?? t("articleForecast.loadError"));
        }

        if (generation !== fetchGenerationRef.current) return;
        const baseItems = (basePayload.items ?? []).map((r) => ({
          ...r,
          stockByLocation: r.stockByLocation ?? {},
          soldByProject: {},
          totalSold: 0,
        }));
        setRows(baseItems);
        setMeta(basePayload.meta ?? null);
        if (!silent) {
          setIsLoading(false);
          setHasLoadedOnce(true);
        }

        // Phase 2: Verkaufsfenster + Beschaffung im Hintergrund nachziehen.
        if (!silent) {
          setIsBackgroundSyncing(true);
        }

        let procurement: ProcurementLine[] = [];
        let salesItems: ArticleForecastRow[] = baseItems;
        let salesMeta: ArticlesResponseMeta | null = basePayload.meta ?? null;

        try {
          const salesRes = await fetch(`/api/xentral/articles?${salesQs.toString()}`, {
            cache: "no-store",
          });
          const salesPayload = (await salesRes.json()) as {
            items?: ArticleForecastRow[];
            error?: string;
            meta?: ArticlesResponseMeta;
          };
          if (salesRes.ok && Array.isArray(salesPayload.items)) {
            salesItems = salesPayload.items.map((r) => ({
              ...r,
              stockByLocation: r.stockByLocation ?? {},
            }));
            salesMeta = salesPayload.meta ?? null;
          }
        } catch (salesErr) {
          console.warn("[Bedarfsprognose] Sales-Aggregation fehlgeschlagen:", salesErr);
          setSalesAggError(true);
        }

        try {
          const ac = new AbortController();
          const timeoutMs = 12_000;
          const tId = window.setTimeout(() => ac.abort(), timeoutMs);
          try {
            const procurementRes = await fetch("/api/procurement/lines", {
              cache: "no-store",
              signal: ac.signal,
            });
            const procurementPayload = (await procurementRes.json().catch(() => ({}))) as {
              lines?: ProcurementLine[];
            };
            if (procurementRes.ok && Array.isArray(procurementPayload.lines)) {
              procurement = procurementPayload.lines.map((line) => ({
                sku: String(line.sku ?? ""),
                productName: String(line.productName ?? ""),
                amount: Number(line.amount ?? 0),
                arrivalAtPort: String(line.arrivalAtPort ?? ""),
                notes: String(line.notes ?? ""),
              }));
            }
          } finally {
            window.clearTimeout(tId);
          }
        } catch {
          /* Beschaffung optional */
        }

        if (generation !== fetchGenerationRef.current) return;
        setRows(salesItems);
        setMeta(salesMeta);
        setProcurementLines(procurement);
        writeLocalJsonCache(ARTICLE_FORECAST_CACHE_KEY, {
          savedAt: Date.now(),
          fromYmd,
          toYmd,
          items: salesItems,
          procurementLines: procurement,
          meta: salesMeta,
        } satisfies ArticleForecastCachedPayload);
      } catch (e) {
        if (generation !== fetchGenerationRef.current) return;
        if (silent) {
          console.warn("[Bedarfsprognose] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
          setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
          setHasLoadedOnce(true);
          setIsBackgroundSyncing(false);
        }
        if (showBackgroundIndicator) {
          setIsBackgroundSyncing(false);
        }
      }
    },
    [fromYmd, toYmd, t]
  );

  useEffect(() => {
    setHasMounted(true);
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  return {
    fromYmd,
    toYmd,
    setRange,
    dateManuallySet,
    setDateManuallySet,
    rows,
    procurementLines,
    meta,
    error,
    salesAggError,
    setSalesAggError,
    isLoading,
    isBackgroundSyncing,
    hasLoadedOnce,
    hasMounted,
    load,
  };
}
