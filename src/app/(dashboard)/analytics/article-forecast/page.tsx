"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DataTable } from "@/shared/components/DataTable";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import {
  addDaysToYmd,
  defaultArticleForecastFromToYmd,
  parseYmdToUtcNoon,
} from "@/shared/lib/xentralArticleForecastProject";
import { DASHBOARD_PAGE_SHELL } from "@/shared/lib/dashboardUi";
import { usePromotionDeals } from "../marketplaces/usePromotionDeals";
import { ArticleForecastHeader } from "./components/ArticleForecastHeader";
import { ArticleForecastAlerts } from "./components/ArticleForecastAlerts";
import { ArticleForecastMetaBanner } from "./components/ArticleForecastMetaBanner";
import {
  ArticleForecastDateRangePicker,
  ArticleForecastToolbarBetween,
} from "./components/ArticleForecastToolbar";
import useColumnVisibility from "@/shared/hooks/useColumnVisibility";
import useArticleForecastRules from "@/shared/hooks/useArticleForecastRules";
import { useArticleForecastColumns } from "./components/useArticleForecastColumns";
import useArticleForecastComputed from "@/shared/hooks/useArticleForecastComputed";
import {
  ARTICLE_FORECAST_CACHE_KEY,
  MARKETPLACE_COLUMN_VISIBILITY_KEY,
  WAREHOUSE_COLUMN_VISIBILITY_KEY,
  XENTRAL_ARTICLES_SEED_CACHE_KEY,
  normalizeSkuKey,
  readStoredMarketplaceVisibility,
  readStoredWarehouseVisibility,
  type ArticleForecastCachedPayload,
  type ArticleForecastRow,
  type ArticlesResponseMeta,
  type ProcurementLine,
  type XentralArticlesSeedPayload,
} from "@/shared/lib/article-forecast-utils";

export type { ArticleForecastRow } from "@/shared/lib/article-forecast-utils";

export default function AnalyticsArticleForecastPage() {
  const { t, locale } = useTranslation();
  const qtyFmt = useMemo(
    () => new Intl.NumberFormat(intlLocaleTag(locale), { maximumFractionDigits: 0 }),
    [locale]
  );

  const formatQty = useCallback(
    (n: number | undefined): ReactNode => {
      if (n == null || !Number.isFinite(n) || n === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return <span className="tabular-nums">{qtyFmt.format(n)}</span>;
    },
    [qtyFmt]
  );

  const formatTotalSold = useCallback(
    (n: number): ReactNode => {
      if (!Number.isFinite(n)) {
        return <span className="text-muted-foreground">—</span>;
      }
      return <span className="tabular-nums">{qtyFmt.format(n)}</span>;
    },
    [qtyFmt]
  );

  const formatStock = useCallback(
    (n: number): ReactNode => {
      if (!Number.isFinite(n)) {
        return <span className="text-muted-foreground">—</span>;
      }
      return <span className="tabular-nums">{qtyFmt.format(n)}</span>;
    },
    [qtyFmt]
  );

  const [{ fromYmd, toYmd }, setRange] = useState(() => defaultArticleForecastFromToYmd());
  const [dateManuallySet, setDateManuallySet] = useState(false);
  const [rows, setRows] = useState<ArticleForecastRow[]>([]);
  const [procurementLines, setProcurementLines] = useState<ProcurementLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  const {
    ruleScope,
    setRuleScope,
    setRulesByScope,
    activeRules,
    rulesLoading,
    rulesSaving,
    rulesError,
    rulesNotice,
    saveRules,
  } = useArticleForecastRules({ hasMounted, t });

  const { deals: promotionDeals } = usePromotionDeals();
  const relevantDeals = useMemo(
    () => promotionDeals.filter((d) => d.from <= toYmd && d.to >= fromYmd),
    [promotionDeals, fromYmd, toYmd]
  );
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
        // WICHTIG: isLoading IMMER zurücksetzen, auch wenn die Generation veraltet ist.
        // Vorher: generation-check + return → isLoading blieb true bei schneller Regeländerung.
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


  const windowWarning = useMemo(() => {
    const sw = meta?.salesWindow;
    if (!sw || !sw.listOk) {
      if (sw && sw.listOk === false && sw.listStatus) {
        return t("articleForecast.windowListFailed", { status: String(sw.listStatus) });
      }
      return null;
    }
    if (sw.deliveryNotesInWindow > 0 && sw.lineItemsParsed === 0) {
      return t("articleForecast.windowNoLines", { notes: String(sw.deliveryNotesInWindow) });
    }
    if (sw.hitSalesPageCap) {
      return t("articleForecast.salesPageCapDetailed", {
        pages: String(sw.pagesFetched ?? 0),
        notes: String(sw.deliveryNotesInWindow ?? 0),
      });
    }
    if (sw.stoppedEarly) {
      return t("articleForecast.paginationStopped");
    }
    // Cache-Lücken: historische Daten unvollständig wenn 0 Cache-Tage aber Zeitraum > Live-Fenster
    if (sw.cacheDaysUsed === 0 && sw.liveWindowFromYmd) {
      const fromTs = parseYmdToUtcNoon(fromYmd);
      const liveTs = parseYmdToUtcNoon(sw.liveWindowFromYmd);
      if (fromTs != null && liveTs != null && fromTs < liveTs) {
        const liveDays = sw.liveWindowToYmd && sw.liveWindowFromYmd
          ? Math.round(
              ((parseYmdToUtcNoon(sw.liveWindowToYmd) ?? 0) - (parseYmdToUtcNoon(sw.liveWindowFromYmd) ?? 0)) / 86400000
            ) + 1
          : 60;
        return t("articleForecast.cacheIncomplete", { days: String(liveDays) });
      }
    }
    return null;
  }, [meta, fromYmd, t]);

  const projectColumns = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      if (r.projectDisplay && r.projectDisplay !== "—") {
        names.add(r.projectDisplay);
      }
      for (const k of Object.keys(r.soldByProject ?? {})) {
        const t = k.trim();
        if (t && t !== "—") names.add(t);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "de"));
  }, [rows]);

  const warehouseColumns = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.stockByLocation ?? {})) {
        const trimmed = k.trim();
        if (trimmed) names.add(trimmed);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "de"));
  }, [rows]);

  const {
    visibility: marketplaceColumnVisibility,
    setVisibility: setMarketplaceColumnVisibility,
  } = useColumnVisibility({
    storageKey: MARKETPLACE_COLUMN_VISIBILITY_KEY,
    columns: projectColumns,
    defaultVisible: false,
    readStored: readStoredMarketplaceVisibility,
  });
  const {
    visibility: warehouseColumnVisibility,
    setVisibility: setWarehouseColumnVisibility,
  } = useColumnVisibility({
    storageKey: WAREHOUSE_COLUMN_VISIBILITY_KEY,
    columns: warehouseColumns,
    defaultVisible: true,
    readStored: readStoredWarehouseVisibility,
  });

  const visibleProjectColumns = useMemo(
    () => projectColumns.filter((p) => marketplaceColumnVisibility[p] !== false),
    [projectColumns, marketplaceColumnVisibility]
  );

  const visibleWarehouseColumns = useMemo(
    () => warehouseColumns.filter((w) => warehouseColumnVisibility[w] !== false),
    [warehouseColumns, warehouseColumnVisibility]
  );

  // Regel → Datum: Wenn salesWindowDays in den Regeln geändert wird, fromYmd automatisch berechnen.
  const salesWindowDaysRef = useRef(activeRules.salesWindowDays);
  useEffect(() => {
    if (!hasMounted) return;
    if (salesWindowDaysRef.current === activeRules.salesWindowDays) return;
    salesWindowDaysRef.current = activeRules.salesWindowDays;
    const days = Math.max(1, Math.round(activeRules.salesWindowDays));
    const expectedFrom = addDaysToYmd(toYmd, -(days - 1));
    setRange((prev) => (prev.fromYmd === expectedFrom ? prev : { ...prev, fromYmd: expectedFrom }));
  }, [activeRules.salesWindowDays, toYmd, hasMounted]);

  // Datum → Regel: Wenn der User fromYmd manuell ändert, salesWindowDays synchronisieren.
  useEffect(() => {
    if (!dateManuallySet) return;
    const from = parseYmdToUtcNoon(fromYmd);
    const to = parseYmdToUtcNoon(toYmd);
    if (from == null || to == null || from > to) return;
    const days = Math.round((to - from) / 86400000) + 1;
    const clamped = Math.max(1, Math.min(366, days));
    salesWindowDaysRef.current = clamped;
    setRulesByScope((prev) => ({
      ...prev,
      [ruleScope]: { ...prev[ruleScope], salesWindowDays: clamped },
    }));
    setDateManuallySet(false);
  }, [dateManuallySet, fromYmd, toYmd, ruleScope, setRulesByScope]);

  const { forecastBySku, rowClassBySku } = useArticleForecastComputed({
    rows,
    procurementLines,
    activeRules,
    fromYmd,
    toYmd,
    visibleWarehouseColumns,
    warehouseColumns,
  });

  const columns = useArticleForecastColumns({
    rows,
    visibleProjectColumns,
    visibleWarehouseColumns,
    warehouseColumns,
    forecastBySku,
    activeRules,
    toYmd,
    qtyFmt,
    t,
    formatQty,
    formatTotalSold,
    formatStock,
  });

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <ArticleForecastHeader
        hasMounted={hasMounted}
        isBackgroundSyncing={isBackgroundSyncing}
        onRefresh={() => void load(true)}
      />
      <ArticleForecastAlerts
        error={error}
        salesAggError={salesAggError}
        isLoading={isLoading}
        windowWarning={windowWarning}
        onRetrySalesAgg={() => {
          setSalesAggError(false);
          void load(true);
        }}
      />

      <div className="relative min-h-[360px] w-full min-w-0 flex-1">
        <DataTable
          columns={columns}
          data={rows}
          filterColumn={t("filters.skuOrArticleName")}
          paginate={false}
          compact
          tableClassName="w-max min-w-full table-auto"
          className="relative z-0 min-h-0 w-full min-w-0 max-w-full flex-1 text-xs"
          tableWrapClassName="min-h-0 max-w-full overflow-x-auto"
          getRowClassName={(row) => rowClassBySku.get(normalizeSkuKey(row.original.sku))}
          toolbarBetween={
            <ArticleForecastToolbarBetween
              isLoading={isLoading}
              hasLoadedOnce={hasLoadedOnce}
              projectColumns={projectColumns}
              marketplaceColumnVisibility={marketplaceColumnVisibility}
              setMarketplaceColumnVisibility={setMarketplaceColumnVisibility}
              warehouseColumns={warehouseColumns}
              warehouseColumnVisibility={warehouseColumnVisibility}
              setWarehouseColumnVisibility={setWarehouseColumnVisibility}
              ruleScope={ruleScope}
              setRuleScope={setRuleScope}
              activeRules={activeRules}
              setRulesByScope={setRulesByScope}
              saveRules={saveRules}
              rulesSaving={rulesSaving}
              rulesLoading={rulesLoading}
              rulesError={rulesError}
              rulesNotice={rulesNotice}
            />
          }
          toolbarEnd={
            <ArticleForecastDateRangePicker
              fromYmd={fromYmd}
              toYmd={toYmd}
              onFromChange={(v) => {
                setRange((prev) => ({ ...prev, fromYmd: v }));
                setDateManuallySet(true);
              }}
              onToChange={(v) => setRange((prev) => ({ ...prev, toYmd: v }))}
            />
          }
        />
      </div>

      <ArticleForecastMetaBanner
        meta={meta}
        isLoading={isLoading}
        fromYmd={fromYmd}
        toYmd={toYmd}
        relevantDeals={relevantDeals}
      />
    </div>
  );
}
