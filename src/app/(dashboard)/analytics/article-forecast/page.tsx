"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ChevronDown, Loader2, Settings2, Store, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DataTable } from "@/shared/components/DataTable";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { sentenceCaseColumnLabel } from "@/shared/lib/sentenceCaseColumnLabel";
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
import { cn } from "@/lib/utils";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import {
  DEFAULT_ARTICLE_FORECAST_RULES,
  sanitizeArticleForecastRulesByScope,
  type ArticleForecastRuleScope,
  type ArticleForecastRules,
  type ArticleForecastRulesByScope,
} from "@/shared/lib/articleForecastRules";
import { isProcurementProductLine } from "@/shared/lib/procurement/procurementAggregation";
import { usePromotionDeals } from "../marketplaces/usePromotionDeals";

export type ArticleForecastRow = {
  sku: string;
  name: string;
  stock: number;
  /** Bestand je Lagerplatz, falls die API liefert; sonst leeres Objekt. */
  stockByLocation: Record<string, number>;
  price: number | null;
  projectId: string | null;
  projectDisplay: string;
  totalSold: number;
  soldByProject: Record<string, number>;
};

type ArticlesResponseMeta = {
  salesWindow?: {
    fromYmd: string;
    toYmd: string;
    deliveryNotesInWindow: number;
    lineItemsParsed: number;
    pagesFetched: number;
    stoppedEarly: boolean;
    hitSalesPageCap?: boolean;
    listOk: boolean;
    listStatus?: number;
    source?: "v3_delivery_notes" | "v1_delivery_notes";
    cacheDaysUsed?: number;
    liveWindowFromYmd?: string;
    liveWindowToYmd?: string;
  };
};

const MARKETPLACE_COLUMN_VISIBILITY_KEY = "articleForecast.marketplaceColumnVisibility";
const WAREHOUSE_COLUMN_VISIBILITY_KEY = "articleForecast.warehouseColumnVisibility";
const ARTICLE_FORECAST_CACHE_KEY = "article_forecast_cache_v2";
const XENTRAL_ARTICLES_SEED_CACHE_KEY = "xentral_articles_cache_v5";
const ARTICLE_FORECAST_RULE_SCOPE_KEY = "articleForecast.ruleScope";

type ArticleForecastCachedPayload = {
  savedAt: number;
  fromYmd: string;
  toYmd: string;
  items: ArticleForecastRow[];
  meta: ArticlesResponseMeta | null;
  procurementLines?: ProcurementLine[];
};

type XentralArticlesSeedPayload = {
  savedAt: number;
  items: Array<{
    sku: string;
    name: string;
    stock: number;
    stockByLocation?: Record<string, number>;
    price?: number | null;
    projectId?: string | null;
    projectDisplay?: string;
  }>;
};

type ProcurementLine = {
  sku: string;
  productName: string;
  amount: number;
  arrivalAtPort: string;
  notes: string;
};

type ForecastStatus = "ok" | "low" | "critical";

type ForecastResult = {
  dailySold: number;
  horizonYmd: string;
  projectedStockAtHorizon: number;
  inboundUntilHorizon: number;
  status: ForecastStatus;
};

function readStoredMarketplaceVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MARKETPLACE_COLUMN_VISIBILITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    // Migration: "SHOPIFY" → "Shopify" (mapping corrected 2026-04)
    if (out["SHOPIFY"] !== undefined && out["Shopify"] === undefined) {
      out["Shopify"] = out["SHOPIFY"];
      delete out["SHOPIFY"];
    }
    return out;
  } catch {
    return {};
  }
}

function readStoredWarehouseVisibility(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(WAREHOUSE_COLUMN_VISIBILITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function readStoredRuleScope(): ArticleForecastRuleScope {
  if (typeof window === "undefined") return "temporary";
  try {
    const raw = localStorage.getItem(ARTICLE_FORECAST_RULE_SCOPE_KEY);
    if (raw === "fixed" || raw === "temporary") return raw;
  } catch {
    /* ignore */
  }
  return "temporary";
}

function normalizeSkuKey(sku: string): string {
  return sku.trim().toLowerCase();
}

function computeForecast(args: {
  rules: ArticleForecastRules;
  soldInWindow: number;
  stockNow: number;
  fromYmd: string;
  toYmd: string;
  inboundUntilHorizon: number;
}): ForecastResult {
  // Berechne tatsächliche Tage aus Datumsbereich statt Rules — vermeidet Race-Condition
  // zwischen manueller Datums-Änderung und useEffect-Sync der salesWindowDays.
  const fromTs = parseYmdToUtcNoon(args.fromYmd);
  const toTs = parseYmdToUtcNoon(args.toYmd);
  const actualDays =
    fromTs != null && toTs != null && toTs >= fromTs
      ? Math.round((toTs - fromTs) / 86400000) + 1
      : args.rules.salesWindowDays;
  const windowDays = Math.max(1, actualDays);
  const dailySold = Math.max(0, args.soldInWindow) / windowDays;
  const horizonYmd = addDaysToYmd(args.toYmd, args.rules.projectionDays);
  const inbound = args.rules.includeInboundProcurement ? args.inboundUntilHorizon : 0;
  const projectedStockAtHorizon = args.stockNow + inbound - dailySold * args.rules.projectionDays;

  let status: ForecastStatus = "ok";
  if (projectedStockAtHorizon < args.rules.criticalStockThreshold) {
    status = "critical";
  } else if (projectedStockAtHorizon < args.rules.lowStockThreshold) {
    status = "low";
  }

  return {
    dailySold,
    horizonYmd,
    projectedStockAtHorizon,
    inboundUntilHorizon: inbound,
    status,
  };
}

function sumStockForVisibleLocations(
  row: ArticleForecastRow,
  visibleLocationKeys: string[],
  allLocationKeys: string[]
): number {
  const byLoc = row.stockByLocation ?? {};
  if (Object.keys(byLoc).length === 0) {
    return Number.isFinite(row.stock) ? row.stock : 0;
  }
  if (visibleLocationKeys.length === 0 && allLocationKeys.length > 0) {
    return Number.isFinite(row.stock) ? row.stock : 0;
  }
  return visibleLocationKeys.reduce((acc, k) => acc + (byLoc[k] ?? 0), 0);
}

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

  const { deals: promotionDeals } = usePromotionDeals();
  const relevantDeals = useMemo(
    () => promotionDeals.filter((d) => d.from <= toYmd && d.to >= fromYmd),
    [promotionDeals, fromYmd, toYmd]
  );
  const [error, setError] = useState<string | null>(null);
  const [salesAggError, setSalesAggError] = useState(false);
  const [meta, setMeta] = useState<ArticlesResponseMeta | null>(null);
  const [ruleScope, setRuleScope] = useState<ArticleForecastRuleScope>("temporary");
  const [rulesByScope, setRulesByScope] = useState<ArticleForecastRulesByScope>({
    fixed: { ...DEFAULT_ARTICLE_FORECAST_RULES },
    temporary: { ...DEFAULT_ARTICLE_FORECAST_RULES },
  });
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesNotice, setRulesNotice] = useState<string | null>(null);
  const [marketplaceColumnVisibility, setMarketplaceColumnVisibility] = useState<
    Record<string, boolean>
  >({});
  const [warehouseColumnVisibility, setWarehouseColumnVisibility] = useState<Record<string, boolean>>(
    {}
  );
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

  useEffect(() => {
    if (!hasMounted) return;
    setRuleScope(readStoredRuleScope());
  }, [hasMounted]);

  useEffect(() => {
    if (!hasMounted) return;
    try {
      localStorage.setItem(ARTICLE_FORECAST_RULE_SCOPE_KEY, ruleScope);
    } catch {
      /* ignore */
    }
  }, [hasMounted, ruleScope]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setRulesLoading(true);
      setRulesError(null);
      try {
        const res = await fetch("/api/article-forecast/rules", { cache: "no-store" });
        const payload = (await res.json()) as {
          error?: string;
          rules?: Partial<ArticleForecastRulesByScope>;
        };
        if (!res.ok) {
          throw new Error(payload.error ?? t("articleForecast.rulesLoadError"));
        }
        if (!alive) return;
        setRulesByScope(sanitizeArticleForecastRulesByScope(payload.rules ?? null));
      } catch (e) {
        if (!alive) return;
        setRulesError(e instanceof Error ? e.message : t("articleForecast.rulesLoadError"));
      } finally {
        if (!alive) return;
        setRulesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const saveRules = useCallback(
    async (scope: ArticleForecastRuleScope, rules: ArticleForecastRules) => {
      setRulesSaving(true);
      setRulesError(null);
      setRulesNotice(null);
      try {
        const res = await fetch("/api/article-forecast/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, rules }),
        });
        const payload = (await res.json()) as { error?: string; rules?: ArticleForecastRules };
        if (!res.ok) throw new Error(payload.error ?? t("articleForecast.rulesSaveError"));
        setRulesNotice(t("articleForecast.rulesSaved"));
      } catch (e) {
        setRulesError(e instanceof Error ? e.message : t("articleForecast.rulesSaveError"));
      } finally {
        setRulesSaving(false);
      }
    },
    [t]
  );

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

  useEffect(() => {
    const stored = readStoredMarketplaceVisibility();
    setMarketplaceColumnVisibility((prev) => {
      const base = Object.keys(prev).length > 0 ? prev : stored;
      const next: Record<string, boolean> = { ...base };
      for (const p of projectColumns) {
        // Standard: Marktplatz-Spalten initial ausgeblendet, bis sie aktiv eingeblendet werden.
        if (next[p] === undefined) next[p] = false;
      }
      if (projectColumns.length > 0) {
        for (const k of Object.keys(next)) {
          if (!projectColumns.includes(k)) delete next[k];
        }
      }
      return next;
    });
  }, [projectColumns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Object.keys(marketplaceColumnVisibility).length === 0) return;
    try {
      localStorage.setItem(
        MARKETPLACE_COLUMN_VISIBILITY_KEY,
        JSON.stringify(marketplaceColumnVisibility)
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, [marketplaceColumnVisibility]);

  useEffect(() => {
    const stored = readStoredWarehouseVisibility();
    setWarehouseColumnVisibility((prev) => {
      const base = Object.keys(prev).length > 0 ? prev : stored;
      const next: Record<string, boolean> = { ...base };
      for (const w of warehouseColumns) {
        if (next[w] === undefined) next[w] = true;
      }
      if (warehouseColumns.length > 0) {
        for (const k of Object.keys(next)) {
          if (!warehouseColumns.includes(k)) delete next[k];
        }
      }
      return next;
    });
  }, [warehouseColumns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Object.keys(warehouseColumnVisibility).length === 0) return;
    try {
      localStorage.setItem(
        WAREHOUSE_COLUMN_VISIBILITY_KEY,
        JSON.stringify(warehouseColumnVisibility)
      );
    } catch {
      /* ignore */
    }
  }, [warehouseColumnVisibility]);

  const visibleProjectColumns = useMemo(
    () => projectColumns.filter((p) => marketplaceColumnVisibility[p] !== false),
    [projectColumns, marketplaceColumnVisibility]
  );

  const visibleWarehouseColumns = useMemo(
    () => warehouseColumns.filter((w) => warehouseColumnVisibility[w] !== false),
    [warehouseColumns, warehouseColumnVisibility]
  );

  const activeRules = rulesByScope[ruleScope];

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
  }, [dateManuallySet, fromYmd, toYmd, ruleScope]);

  const inboundBySkuUntilHorizon = useMemo(() => {
    const out = new Map<string, number>();
    const horizonTs = parseYmdToUtcNoon(addDaysToYmd(toYmd, activeRules.projectionDays));
    if (horizonTs == null) return out;
    for (const line of procurementLines) {
      if (!isProcurementProductLine(line)) continue;
      if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
      const ts = parseYmdToUtcNoon(line.arrivalAtPort);
      if (ts == null || ts > horizonTs) continue;
      const key = normalizeSkuKey(line.sku);
      if (!key) continue;
      out.set(key, (out.get(key) ?? 0) + line.amount);
    }
    return out;
  }, [activeRules.projectionDays, procurementLines, toYmd]);

  const forecastBySku = useMemo(() => {
    const out = new Map<string, ForecastResult>();
    for (const row of rows) {
      /** Immer Gesamtverkauf im Zeitraum (Spalte „Verkauft“) — unabhängig von Marktplatz-Spalten-Einblendung. */
      const soldInWindow = Number.isFinite(row.totalSold) ? row.totalSold : 0;
      const stockNow = sumStockForVisibleLocations(row, visibleWarehouseColumns, warehouseColumns);
      const inboundUntilHorizon = inboundBySkuUntilHorizon.get(normalizeSkuKey(row.sku)) ?? 0;
      const result = computeForecast({
        rules: activeRules,
        soldInWindow,
        stockNow,
        fromYmd,
        toYmd,
        inboundUntilHorizon,
      });
      /**
       * Keine Ampel nach Bestandsschwellen, wenn im gewählten Verkaufsfenster kein Absatz erkennbar ist:
       * - „0 verkauft, 0 Bestand“ (Ruhe/inaktiv)
       * - „0 verkauft, aber noch Lager“ (z. B. 13 Stück): ohne Nachfrage im Fenster ist eine Orange-Warnung
       *   nach absoluter Schwellenlage irreführend — kein sichtbarer Verbrauch.
       * Negative Bestände (< 0) weiterhin kritisch (Ampel nicht unterdrücken).
       */
      const suppressThresholdAmpel = soldInWindow === 0 && stockNow >= 0;
      out.set(
        normalizeSkuKey(row.sku),
        suppressThresholdAmpel ? { ...result, status: "ok" as const } : result
      );
    }
    return out;
  }, [activeRules, fromYmd, inboundBySkuUntilHorizon, rows, toYmd, visibleWarehouseColumns, warehouseColumns]);

  const rowClassBySku = useMemo(() => {
    const out = new Map<string, string>();
    for (const [sku, forecast] of forecastBySku.entries()) {
      if (forecast.status === "critical") {
        out.set(sku, "bg-red-500/10 hover:!bg-red-500/15");
      } else if (forecast.status === "low") {
        out.set(sku, "bg-orange-500/10 hover:!bg-orange-500/15");
      }
    }
    return out;
  }, [forecastBySku]);

  const columns = useMemo<Array<ColumnDef<ArticleForecastRow>>>(() => {
    /** Kompakte Schrift (DataTable compact); schmale Kennzahlspalten, umbrechende Köpfe. */
    const qtyThClass =
      "w-[4.75rem] min-w-[4.75rem] max-w-[5.25rem] px-1 !whitespace-normal align-top py-1.5 leading-tight";
    const qtyTdClass = "w-[4.75rem] min-w-[4.75rem] max-w-[5.25rem] px-1 py-1.5";
    const totalThClass =
      "w-[7.5rem] min-w-[7.5rem] max-w-[8.5rem] px-1.5 !whitespace-normal align-top py-1.5 leading-tight";
    const totalTdClass = "w-[7.5rem] min-w-[7.5rem] max-w-[8.5rem] whitespace-nowrap px-1.5 py-1.5";

    /** Mehrzeilige Kopfzeilen: Sortier-Icon oben bündig, nicht vertikal zentriert. */
    const headerBtnWrap = "items-start gap-1";

    const base: Array<ColumnDef<ArticleForecastRow>> = [
      {
        accessorKey: "sku",
        meta: {
          thClassName: "w-[5.25rem] min-w-[5.25rem] max-w-[6rem] px-1.5 align-top py-1.5",
          tdClassName: "w-[5.25rem] min-w-[5.25rem] max-w-[6rem] px-1.5 py-1.5",
          headerButtonClassName: headerBtnWrap,
        },
        // Fest "SKU" — vermeidet Hydration-Mismatch, wenn Client-Locale erst nach localStorage von DEFAULT_LOCALE abweicht.
        header: "SKU",
        cell: ({ row }) => (
          <span className="block truncate font-medium" title={row.original.sku || undefined}>
            {row.original.sku || "—"}
          </span>
        ),
      },
      {
        accessorKey: "name",
        meta: {
          thClassName: "min-w-0 w-[9rem] max-w-[12rem] px-1.5 align-top py-1.5",
          tdClassName: "min-w-0 w-[9rem] max-w-[12rem] px-1.5 py-1.5",
          headerButtonClassName: headerBtnWrap,
        },
        header: t("articleForecast.articleName"),
        cell: ({ row }) => {
          const raw = row.original.name ?? "";
          return (
            <span className="block min-w-0 truncate text-muted-foreground" title={raw || undefined}>
              {raw.trim() || "—"}
            </span>
          );
        },
      },
    ];

    const projectCols: Array<ColumnDef<ArticleForecastRow>> = visibleProjectColumns.map((proj) => {
      const label = sentenceCaseColumnLabel(proj);
      return {
        id: `project:${proj}`,
        meta: {
          align: "right" as const,
          thClassName: qtyThClass,
          tdClassName: qtyTdClass,
          headerButtonClassName: headerBtnWrap,
        },
        header: () => (
          <div
            className="block w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case"
            title={label}
          >
            {label}
          </div>
        ),
        accessorFn: (row) => row.soldByProject[proj] ?? 0,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatQty(row.original.soldByProject[proj])}</div>
        ),
      };
    });

    const hasOtherSales = rows.some((row) => {
      const namedSum = visibleProjectColumns.reduce((acc, p) => acc + (row.soldByProject[p] ?? 0), 0);
      return row.totalSold - namedSum > 0;
    });

    const otherSalesCol: ColumnDef<ArticleForecastRow> | null = hasOtherSales
      ? {
          id: "project:__other__",
          meta: {
            align: "right" as const,
            thClassName: qtyThClass,
            tdClassName: qtyTdClass,
            headerButtonClassName: headerBtnWrap,
          },
          header: () => (
            <div className="block w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
              {sentenceCaseColumnLabel(t("articleForecast.otherSales"))}
            </div>
          ),
          accessorFn: (row) => {
            const namedSum = visibleProjectColumns.reduce(
              (acc, p) => acc + (row.soldByProject[p] ?? 0),
              0
            );
            const other = row.totalSold - namedSum;
            return other > 0 ? other : 0;
          },
          cell: ({ row }) => {
            const namedSum = visibleProjectColumns.reduce(
              (acc, p) => acc + (row.original.soldByProject[p] ?? 0),
              0
            );
            const other = row.original.totalSold - namedSum;
            return (
              <div className="text-right tabular-nums">{formatQty(other > 0 ? other : undefined)}</div>
            );
          },
        }
      : null;

    const totalCol: ColumnDef<ArticleForecastRow> = {
      id: "totalSold",
      meta: {
        align: "right" as const,
        thClassName: totalThClass,
        tdClassName: totalTdClass,
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(t("articleForecast.totalSold"))}
        </div>
      ),
      /** Gesamtverkauf im gewählten Zeitraum (alle Kanäle/Projekte), unabhängig von eingeblendeten Marktplatz-Spalten. */
      accessorFn: (row) => (Number.isFinite(row.totalSold) ? row.totalSold : 0),
      cell: ({ row }) => (
        <div className="text-right font-medium text-foreground">
          {formatTotalSold(Number.isFinite(row.original.totalSold) ? row.original.totalSold : 0)}
        </div>
      ),
    };

    const totalStockCol: ColumnDef<ArticleForecastRow> = {
      id: "totalStockVisible",
      meta: {
        align: "right" as const,
        thClassName: totalThClass,
        tdClassName: totalTdClass,
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(t("articleForecast.totalStock"))}
        </div>
      ),
      accessorFn: (row) =>
        sumStockForVisibleLocations(row, visibleWarehouseColumns, warehouseColumns),
      cell: ({ row }) => (
        <div className="text-right font-medium text-foreground">
          {formatStock(
            sumStockForVisibleLocations(row.original, visibleWarehouseColumns, warehouseColumns)
          )}
        </div>
      ),
    };

    const dailySoldCol: ColumnDef<ArticleForecastRow> = {
      id: "dailySold",
      meta: {
        align: "right" as const,
        thClassName: totalThClass,
        tdClassName: totalTdClass,
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(t("articleForecast.dailySold"))}
        </div>
      ),
      accessorFn: (row) => forecastBySku.get(normalizeSkuKey(row.sku))?.dailySold ?? 0,
      cell: ({ row }) => (
        <div className="text-right tabular-nums text-muted-foreground">
          {formatQty(forecastBySku.get(normalizeSkuKey(row.original.sku))?.dailySold)}
        </div>
      ),
    };

    const projectedStockCol: ColumnDef<ArticleForecastRow> = {
      id: "projectedStock",
      meta: {
        align: "right" as const,
        thClassName: "w-[10.5rem] min-w-[10.5rem] max-w-[12rem] px-1.5 !whitespace-normal align-top py-1.5 leading-tight",
        tdClassName: "w-[10.5rem] min-w-[10.5rem] max-w-[12rem] whitespace-nowrap px-1.5 py-1.5",
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(
            t("articleForecast.projectedUntil", {
              date: addDaysToYmd(toYmd, activeRules.projectionDays),
            })
          )}
        </div>
      ),
      accessorFn: (row) =>
        forecastBySku.get(normalizeSkuKey(row.sku))?.projectedStockAtHorizon ?? 0,
      cell: ({ row }) => {
        const forecast = forecastBySku.get(normalizeSkuKey(row.original.sku));
        if (!forecast) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col items-end gap-0.5 leading-tight">
            <span
              className={cn(
                "tabular-nums font-medium",
                forecast.status === "critical" && "text-red-600 dark:text-red-400",
                forecast.status === "low" && "text-orange-600 dark:text-orange-400"
              )}
            >
              {qtyFmt.format(Math.round(forecast.projectedStockAtHorizon))}
            </span>
            {forecast.inboundUntilHorizon > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                +{qtyFmt.format(Math.round(forecast.inboundUntilHorizon))}{" "}
                {t("articleForecast.inboundShort")}
              </span>
            ) : null}
          </div>
        );
      },
    };

    const warehouseCols: Array<ColumnDef<ArticleForecastRow>> = visibleWarehouseColumns.map((loc) => {
      const label = sentenceCaseColumnLabel(loc);
      return {
        id: `warehouse:${loc}`,
        meta: {
          align: "right" as const,
          thClassName: qtyThClass,
          tdClassName: qtyTdClass,
          headerButtonClassName: headerBtnWrap,
        },
        header: () => (
          <div
            className="block w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case"
            title={label}
          >
            {label}
          </div>
        ),
        accessorFn: (row) => row.stockByLocation?.[loc] ?? 0,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatStock(row.original.stockByLocation?.[loc] ?? 0)}
          </div>
        ),
      };
    });

    return [
      ...base,
      ...projectCols,
      ...(otherSalesCol ? [otherSalesCol] : []),
      totalCol,
      totalStockCol,
      dailySoldCol,
      projectedStockCol,
      ...warehouseCols,
    ];
  }, [
    activeRules.projectionDays,
    forecastBySku,
    qtyFmt,
    toYmd,
    rows,
    visibleProjectColumns,
    visibleWarehouseColumns,
    warehouseColumns,
    t,
    formatQty,
    formatTotalSold,
    formatStock,
  ]);

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("articleForecast.title")}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasMounted}
              onClick={() => void load(true)}
            >
              {t("articleForecast.refresh")}
            </Button>
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("articleForecast.syncing")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {salesAggError && !isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("articleForecast.salesLoadError")}</span>
          <button
            type="button"
            className="shrink-0 text-xs underline underline-offset-2 hover:no-underline"
            onClick={() => {
              setSalesAggError(false);
              void load(true);
            }}
          >
            {t("commonUi.retry")}
          </button>
        </div>
      ) : null}

      {windowWarning ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950">
          {windowWarning}
        </div>
      ) : null}

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
            <div className="flex flex-wrap items-center gap-2">
              {isLoading ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  {hasLoadedOnce ? t("articleForecast.refreshing") : t("articleForecast.loading")}
                </span>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  nativeButton
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs",
                    "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  )}
                  aria-label={t("articleForecast.marketplacesMenuAria")}
                >
                  <Store className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span>{t("articleForecast.marketplacesMenu")}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 min-w-[14rem] overflow-y-auto">
                  {projectColumns.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {t("articleForecast.marketplacesEmpty")}
                    </div>
                  ) : (
                    <>
                      {projectColumns.map((proj) => {
                        const label = sentenceCaseColumnLabel(proj);
                        const checked = marketplaceColumnVisibility[proj] !== false;
                        return (
                          <DropdownMenuCheckboxItem
                            key={proj}
                            checked={checked}
                            onCheckedChange={(next) => {
                              setMarketplaceColumnVisibility((prev) => ({
                                ...prev,
                                [proj]: next === true,
                              }));
                            }}
                          >
                            <span className="min-w-0 truncate" title={label}>
                              {label}
                            </span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setMarketplaceColumnVisibility((prev) => {
                            const next = { ...prev };
                            for (const p of projectColumns) next[p] = true;
                            return next;
                          });
                        }}
                      >
                        {t("articleForecast.marketplacesShowAll")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setMarketplaceColumnVisibility((prev) => {
                            const next = { ...prev };
                            for (const p of projectColumns) next[p] = false;
                            return next;
                          });
                        }}
                      >
                        {t("articleForecast.marketplacesHideAll")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger
                  nativeButton
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs",
                    "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  )}
                  aria-label={t("articleForecast.warehousesMenuAria")}
                >
                  <Warehouse className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  <span>{t("articleForecast.warehousesMenu")}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 min-w-[14rem] overflow-y-auto">
                  {warehouseColumns.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      {t("articleForecast.warehousesEmpty")}
                    </div>
                  ) : (
                    <>
                      {warehouseColumns.map((loc) => {
                        const label = sentenceCaseColumnLabel(loc);
                        const checked = warehouseColumnVisibility[loc] !== false;
                        return (
                          <DropdownMenuCheckboxItem
                            key={loc}
                            checked={checked}
                            onCheckedChange={(next) => {
                              setWarehouseColumnVisibility((prev) => ({
                                ...prev,
                                [loc]: next === true,
                              }));
                            }}
                          >
                            <span className="min-w-0 truncate" title={label}>
                              {label}
                            </span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setWarehouseColumnVisibility((prev) => {
                            const next = { ...prev };
                            for (const w of warehouseColumns) next[w] = true;
                            return next;
                          });
                        }}
                      >
                        {t("articleForecast.warehousesShowAll")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setWarehouseColumnVisibility((prev) => {
                            const next = { ...prev };
                            for (const w of warehouseColumns) next[w] = false;
                            return next;
                          });
                        }}
                      >
                        {t("articleForecast.warehousesHideAll")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <Settings2 className="h-3.5 w-3.5" aria-hidden />
                      {t("articleForecast.rulesMenu")}
                    </Button>
                  }
                />
                <PopoverContent align="start" className="w-[22rem]">
                  <PopoverHeader>
                    <PopoverTitle>{t("articleForecast.rulesMenu")}</PopoverTitle>
                    <PopoverDescription>{t("articleForecast.rulesDescription")}</PopoverDescription>
                  </PopoverHeader>

                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      type="button"
                      variant={ruleScope === "temporary" ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setRuleScope("temporary")}
                    >
                      {t("articleForecast.scopeTemporary")}
                    </Button>
                    <Button
                      type="button"
                      variant={ruleScope === "fixed" ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setRuleScope("fixed")}
                    >
                      {t("articleForecast.scopeFixed")}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("articleForecast.ruleProjectionDays")}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={366}
                        className="h-8 text-xs"
                        value={String(activeRules.projectionDays)}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setRulesByScope((prev) => ({
                            ...prev,
                            [ruleScope]: {
                              ...prev[ruleScope],
                              projectionDays: Number.isFinite(value) ? value : 1,
                            },
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("articleForecast.ruleSalesWindowDays")}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={366}
                        className="h-8 text-xs"
                        value={String(activeRules.salesWindowDays)}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setRulesByScope((prev) => ({
                            ...prev,
                            [ruleScope]: {
                              ...prev[ruleScope],
                              salesWindowDays: Number.isFinite(value) ? value : 1,
                            },
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("articleForecast.ruleLowStock")}
                      </span>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={String(activeRules.lowStockThreshold)}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setRulesByScope((prev) => ({
                            ...prev,
                            [ruleScope]: {
                              ...prev[ruleScope],
                              lowStockThreshold: Number.isFinite(value) ? value : 0,
                            },
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t("articleForecast.ruleCriticalStock")}
                      </span>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={String(activeRules.criticalStockThreshold)}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setRulesByScope((prev) => ({
                            ...prev,
                            [ruleScope]: {
                              ...prev[ruleScope],
                              criticalStockThreshold: Number.isFinite(value) ? value : 0,
                            },
                          }));
                        }}
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant={activeRules.includeInboundProcurement ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() =>
                      setRulesByScope((prev) => ({
                        ...prev,
                        [ruleScope]: {
                          ...prev[ruleScope],
                          includeInboundProcurement: !prev[ruleScope].includeInboundProcurement,
                        },
                      }))
                    }
                  >
                    {activeRules.includeInboundProcurement
                      ? t("articleForecast.ruleInboundOn")
                      : t("articleForecast.ruleInboundOff")}
                  </Button>

                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={rulesSaving || rulesLoading}
                      onClick={() => void saveRules(ruleScope, activeRules)}
                    >
                      {rulesSaving ? t("articleForecast.rulesSaving") : t("articleForecast.rulesSave")}
                    </Button>
                    {rulesLoading ? (
                      <span className="text-[11px] text-muted-foreground">
                        {t("articleForecast.rulesLoading")}
                      </span>
                    ) : null}
                  </div>

                  {rulesError ? (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-700">
                      {rulesError}
                    </div>
                  ) : null}
                  {rulesNotice ? (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-800">
                      {rulesNotice}
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
              <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                <span>{t("articleForecast.legendLow")}</span>
                <span className="mx-0.5">·</span>
                <span>{t("articleForecast.legendCritical")}</span>
              </div>
            </div>
          }
          toolbarEnd={
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {t("articleForecast.from")}
                </span>
                <Input
                  type="date"
                  className="h-8 w-[140px] text-xs"
                  value={fromYmd}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRange((prev) => ({ ...prev, fromYmd: v }));
                    setDateManuallySet(true);
                  }}
                />
              </div>
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {t("articleForecast.to")}
                </span>
                <Input
                  type="date"
                  className="h-8 w-[140px] text-xs"
                  value={toYmd}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRange((prev) => ({ ...prev, toYmd: v }));
                  }}
                />
              </div>
            </div>
          }
        />
      </div>

      {meta?.salesWindow && !isLoading ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {t("articleForecast.metaWindow", {
              from: meta.salesWindow.fromYmd ?? fromYmd,
              to: meta.salesWindow.toYmd ?? toYmd,
            })}
          </span>
          <span>
            {t("articleForecast.metaNotes", {
              notes: String(meta.salesWindow.deliveryNotesInWindow ?? 0),
              lines: String(meta.salesWindow.lineItemsParsed ?? 0),
            })}
          </span>
          <span>
            {meta.salesWindow.source === "v3_delivery_notes" ? "v3" : "v1"}
            {meta.salesWindow.cacheDaysUsed
              ? ` + Cache (${meta.salesWindow.cacheDaysUsed}d)`
              : ""}
          </span>
        </div>
      ) : null}

      {relevantDeals.length > 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-3">
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">
            {t("articleForecast.activeDeals", { count: String(relevantDeals.length) })}
          </h4>
          <div className="flex flex-wrap gap-2">
            {relevantDeals.map((deal) => (
              <span
                key={deal.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-xs"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: deal.color }}
                />
                {deal.label} · {deal.from} — {deal.to}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
