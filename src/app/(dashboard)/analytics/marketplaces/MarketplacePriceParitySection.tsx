"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUpDown, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ANALYTICS_MARKETPLACES } from "@/shared/lib/analytics-marketplaces";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_COMPACT_TABLE_SCROLL,
  DASHBOARD_COMPACT_TABLE_TEXT,
  DASHBOARD_META_TEXT,
  DASHBOARD_SECTION_TITLE,
} from "@/shared/lib/dashboardUi";
import {
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { usePermissions } from "@/shared/hooks/usePermissions";

type CellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

type ParityRow = {
  sku: string;
  name: string;
  stock: number;
  amazon: {
    price: number | null;
    state: CellState;
    stock: number | null;
    stockState: CellState;
  };
  otherMarketplaces: Record<
    string,
    {
      price: number | null;
      state: CellState;
      stock: number | null;
      stockState: CellState;
    }
  >;
  needsReview: boolean;
};

type SortColumnId =
  | "sku"
  | "stock"
  | "name"
  | "amazon"
  | `mp:${string}`;

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function sortParityRows(
  list: ParityRow[],
  column: SortColumnId,
  dir: "asc" | "desc"
): ParityRow[] {
  const mul = dir === "asc" ? 1 : -1;
  const copy = [...list];
  copy.sort((a, b) => {
    if (column === "sku") return mul * a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" });
    if (column === "stock") return mul * (a.stock - b.stock);
    if (column === "name") return mul * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (column === "amazon") return mul * compareNullableNumber(a.amazon.price, b.amazon.price);
    if (column.startsWith("mp:")) {
      const slug = column.slice(3);
      const pa = a.otherMarketplaces[slug]?.price ?? null;
      const pb = b.otherMarketplaces[slug]?.price ?? null;
      return mul * compareNullableNumber(pa, pb);
    }
    return 0;
  });
  return copy;
}

type ParityResponse = {
  error?: string;
  meta?: {
    articleCount: number;
    amazonMatchedSkus: number;
    amazonWarning: string | null;
    ottoWarning?: string | null;
  };
  rows?: ParityRow[];
  issueCount?: number;
};

const PRICE_PARITY_CACHE_KEY = "marketplace_price_parity_v4";
const PRICE_PARITY_BACKGROUND_SYNC_MS = 60 * 60 * 1000;

/** Einheitliche Breite für Amazon- und Marktplatz-Preisspalten */
const MARKETPLACE_PRICE_COL =
  "w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem] shrink-0 align-top px-1.5";

type CachedParityPayload = { savedAt: number } & ParityResponse;

/** Zeilenhintergrund je Zelle nach Marktplatz-Zustand. */
function parityCellBg(state: CellState) {
  if (state === "mismatch") return "bg-rose-500/10";
  if (state === "missing" || state === "no_price") return "bg-amber-500/10";
  return "";
}

function normalizeNumberInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatNumberishInput(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v);
}

function ParityCellValue({
  label,
  price,
  state,
  stock,
  stockState,
  editing,
  editingMode,
  onPriceChange,
  onStockChange,
}: {
  label: string;
  price: number | null;
  state: CellState;
  stock: number | null;
  stockState: CellState;
  editing: boolean;
  editingMode: "price" | "stock" | null;
  onPriceChange: (value: string) => void;
  onStockChange: (value: string) => void;
}) {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const formatPrice = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(intlTag, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (state === "not_connected" && stockState === "not_connected") {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={`${label}: ${t("priceParity.notConnected")}`}
      >
        —
      </span>
    );
  }
  if (state === "missing" && stockState === "missing") {
    return (
      <div className="flex flex-col gap-px">
        <Badge variant="destructive" className="h-5 w-fit px-1.5 py-0 text-[10px] leading-none">
          {t("priceParity.missingListing")}
        </Badge>
        <span className="text-[10px] leading-tight text-muted-foreground">{t("priceParity.noListing")}</span>
      </div>
    );
  }
  const priceLine = editing && editingMode === "price" ? (
    <Input
      value={formatNumberishInput(price)}
      onChange={(e) => onPriceChange(e.target.value)}
      className="h-6 px-1 text-[10px] tabular-nums"
      inputMode="decimal"
    />
  ) : (
    <span className={cn("tabular-nums text-[11px] leading-tight", state === "mismatch" && "font-semibold text-rose-700")}>
      {formatPrice(price)}
    </span>
  );

  const stockLine = editing && editingMode === "stock" ? (
    <Input
      value={formatNumberishInput(stock)}
      onChange={(e) => onStockChange(e.target.value)}
      className="h-6 px-1 text-[10px] tabular-nums"
      inputMode="numeric"
    />
  ) : (
    <span
      className={cn(
        "tabular-nums text-[11px] leading-tight",
        stockState === "mismatch" && "font-semibold text-rose-700"
      )}
    >
      {stock == null || !Number.isFinite(stock)
        ? "—"
        : new Intl.NumberFormat(intlTag, { maximumFractionDigits: 2 }).format(stock)}
    </span>
  );

  return (
    <div className="flex flex-col gap-1" title={label}>
      <div className="flex items-center gap-1">
        <span className="w-3 shrink-0 text-[9px] font-semibold text-muted-foreground">P</span>
        <div className="min-w-0 flex-1">{priceLine}</div>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-3 shrink-0 text-[9px] font-semibold text-muted-foreground">B</span>
        <div className="min-w-0 flex-1 text-muted-foreground">{stockLine}</div>
      </div>
      {(state === "no_price" || stockState === "no_price") && !editing ? (
        <span className="text-[10px] text-muted-foreground">n/a</span>
      ) : null}
      {state === "mismatch" || stockState === "mismatch" ? (
        <Badge variant="outline" className="h-4 w-fit border-rose-300 px-1 py-0 text-[9px] leading-none text-rose-800">
          {t("priceParity.deviating")}
        </Badge>
      ) : null}
    </div>
  );
}

export function MarketplacePriceParitySection() {
  const { t, locale } = useTranslation();
  const { canUseAction } = usePermissions();
  const intlTag = intlLocaleTag(locale);
  const formatStock = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(intlTag, { maximumFractionDigits: 0 }).format(value);
  };
  const [loading, setLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ParityResponse | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: SortColumnId; dir: "asc" | "desc" }>({
    col: "stock",
    dir: "desc",
  });
  const [hasMounted, setHasMounted] = useState(false);
  const [editMode, setEditMode] = useState<null | "price" | "stock">(null);
  const [draftPriceValues, setDraftPriceValues] = useState<Record<string, string>>({});
  const [draftStockValues, setDraftStockValues] = useState<Record<string, string>>({});
  const [savingEdits, setSavingEdits] = useState(false);
  const [headerSolid, setHeaderSolid] = useState(false);
  const payloadRef = useRef<ParityResponse | null>(null);
  const latestRequestRef = useRef(0);
  const pendingForegroundLoadsRef = useRef(0);
  const pendingBackgroundLoadsRef = useRef(0);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const canEditPrices = canUseAction("analytics.marketplaces.parity.editPrice");
  const canEditStocks = canUseAction("analytics.marketplaces.parity.editStock");

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    const requestId = ++latestRequestRef.current;
    const isLatestRequest = () => latestRequestRef.current === requestId;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedParityPayload>(PRICE_PARITY_CACHE_KEY);
      if (parsed && Array.isArray(parsed.rows) && !parsed.error) {
        setPayload(parsed);
        hadCache = true;
        setLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setLoading(true);
    } else if (!hadCache && !silent) {
      setLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (!silent) {
      pendingForegroundLoadsRef.current += 1;
    }
    if (showBackgroundIndicator) {
      pendingBackgroundLoadsRef.current += 1;
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      const qs = new URLSearchParams({ limit: "350" });
      if (forceRefresh) qs.set("refresh", "1");
      const res = await fetch(`/api/marketplaces/price-parity?${qs}`, { cache: "no-store" });
      const json = (await res.json()) as ParityResponse;
      if (!res.ok) {
        throw new Error(json.error ?? t("priceParity.loadError"));
      }
      if (!isLatestRequest()) return;
      setPayload(json);
      writeLocalJsonCache(PRICE_PARITY_CACHE_KEY, {
        savedAt: Date.now(),
        ...json,
      } satisfies CachedParityPayload);
    } catch (e) {
      if (!isLatestRequest()) return;
      if (silent) {
        console.warn("[Preisparität] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
        if (!payloadRef.current) {
          setPayload(null);
        }
      }
    } finally {
      if (!silent) {
        pendingForegroundLoadsRef.current = Math.max(0, pendingForegroundLoadsRef.current - 1);
        if (pendingForegroundLoadsRef.current === 0) {
          setLoading(false);
        }
      }
      if (showBackgroundIndicator) {
        pendingBackgroundLoadsRef.current = Math.max(0, pendingBackgroundLoadsRef.current - 1);
        if (pendingBackgroundLoadsRef.current === 0) {
          setIsBackgroundSyncing(false);
        }
      }
    }
  }, [t]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setHasMounted(true);
    void loadRef.current(false, false);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadRef.current(false, true);
    }, PRICE_PARITY_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted]);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const scroller = wrap.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (!scroller) return;
    const onScroll = () => setHeaderSolid(scroller.scrollTop > 0);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [loading]);

  const rows = useMemo(() => payload?.rows ?? [], [payload]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const raw = r.name.toLowerCase();
      return r.sku.toLowerCase().includes(q) || raw.includes(q);
    });
  }, [rows, query]);

  const sortedFiltered = useMemo(
    () => sortParityRows(filtered, sort.col, sort.dir),
    [filtered, sort]
  );

  const toggleSort = useCallback((col: SortColumnId) => {
    setSort((prev) => {
      if (prev.col === col) {
        return { col, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { col, dir: "asc" };
    });
  }, []);

  const sortIcon = useCallback(
    (col: SortColumnId) => {
      if (sort.col !== col) {
        return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />;
      }
      return sort.dir === "asc" ? (
        <ChevronUp className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      );
    },
    [sort]
  );

  const cellKey = useCallback((sku: string, slug: string) => `${sku}::${slug}`, []);

  const resolveCurrentCell = useCallback((row: ParityRow, slug: string) => {
    if (slug === "amazon") return row.amazon;
    return row.otherMarketplaces[slug] ?? { price: null, state: "not_connected" as CellState, stock: null, stockState: "not_connected" as CellState };
  }, []);

  const startPriceEdit = useCallback(() => {
    if (!canEditPrices) return;
    setEditMode("price");
    setDraftPriceValues({});
  }, [canEditPrices]);

  const startStockEdit = useCallback(() => {
    if (!canEditStocks) return;
    setEditMode("stock");
    setDraftStockValues({});
  }, [canEditStocks]);

  const cancelEdit = useCallback(() => {
    setEditMode(null);
    setDraftPriceValues({});
    setDraftStockValues({});
  }, []);

  const saveEdits = useCallback(async () => {
    if (!payload?.rows?.length || !editMode) return;
    const updates: Array<{
      sku: string;
      marketplaceSlug: string;
      priceEur?: number | null;
      stockQty?: number | null;
    }> = [];
    const selected = new Set(["amazon", ...ANALYTICS_MARKETPLACES.map((m) => m.slug)]);
    for (const row of payload.rows) {
      for (const slug of selected) {
        const current = resolveCurrentCell(row, slug);
        const k = cellKey(row.sku, slug);
        if (editMode === "price" && draftPriceValues[k] !== undefined) {
          const next = normalizeNumberInput(draftPriceValues[k] ?? "");
          const prev = current.price;
          if (next !== prev) updates.push({ sku: row.sku, marketplaceSlug: slug, priceEur: next });
        }
        if (editMode === "stock" && draftStockValues[k] !== undefined) {
          const next = normalizeNumberInput(draftStockValues[k] ?? "");
          const prev = current.stock;
          if (next !== prev) updates.push({ sku: row.sku, marketplaceSlug: slug, stockQty: next });
        }
      }
    }
    if (updates.length === 0) {
      cancelEdit();
      return;
    }
    setSavingEdits(true);
    try {
      const res = await fetch("/api/marketplaces/price-stock-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? t("priceParity.saveError"));
      cancelEdit();
      await load(true, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
    } finally {
      setSavingEdits(false);
    }
  }, [
    payload,
    editMode,
    resolveCurrentCell,
    cellKey,
    draftPriceValues,
    draftStockValues,
    cancelEdit,
    load,
    t,
  ]);

  const refreshNow = useCallback(async () => {
    // Bei vorhandenen Daten immer still im Hintergrund neu laden.
    const keepCurrentVisible = Boolean(payloadRef.current);
    await load(true, keepCurrentVisible);
  }, [load]);

  const issueCount = payload?.issueCount ?? 0;
  const stickyHeadBg = headerSolid ? "bg-muted" : "bg-muted/60";

  return (
    <section className={cn(DASHBOARD_COMPACT_CARD, "gap-2")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className={DASHBOARD_SECTION_TITLE}>{t("priceParity.title")}</h2>
          {payload?.meta?.amazonWarning ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-900">
              {payload.meta.amazonWarning}
            </p>
          ) : null}
          {payload?.meta?.ottoWarning ? (
            <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-900">
              {payload.meta.ottoWarning}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-[44rem] sm:shrink-0">
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap">
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshNow()} disabled={loading || savingEdits}>
              {t("priceParity.refresh")}
            </Button>
            <Button type="button" variant={editMode === "price" ? "default" : "outline"} size="sm" onClick={startPriceEdit} disabled={!canEditPrices || savingEdits}>
              {t("priceParity.editPrices")}
            </Button>
            {!canEditPrices ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                </TooltipTrigger>
                <TooltipContent>{t("priceParity.noPermissionPrice")}</TooltipContent>
              </Tooltip>
            ) : null}
            <Button type="button" variant={editMode === "stock" ? "default" : "outline"} size="sm" onClick={startStockEdit} disabled={!canEditStocks || savingEdits}>
              {t("priceParity.editStocks")}
            </Button>
            {!canEditStocks ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                </TooltipTrigger>
                <TooltipContent>{t("priceParity.noPermissionStock")}</TooltipContent>
              </Tooltip>
            ) : null}
            {editMode ? (
              <>
                <Button type="button" size="sm" onClick={() => void saveEdits()} disabled={savingEdits}>
                  {savingEdits ? t("priceParity.saving") : t("priceParity.saveEdits")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={savingEdits}>
                  {t("priceParity.cancelEdits")}
                </Button>
              </>
            ) : null}
            <Input
              placeholder={t("priceParity.filterPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-72 shrink-0 text-xs"
            />
          </div>
          {isBackgroundSyncing ? (
            <span className={cn("inline-flex items-center gap-1.5", DASHBOARD_META_TEXT)}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("priceParity.syncing")}
            </span>
          ) : null}
          
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs leading-snug text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 animate-pulse rounded-md bg-muted/60" />
          <div className="h-56 animate-pulse rounded-md bg-muted/40" />
        </div>
      ) : (
        <div
          ref={tableWrapRef}
          className={cn(
            DASHBOARD_COMPACT_TABLE_SCROLL,
            "relative isolate flex-1 max-h-[min(760px,74vh)] rounded-md overflow-y-auto overflow-x-auto [&>[data-slot=table-container]]:overflow-visible"
          )}
        >
          <Table className={DASHBOARD_COMPACT_TABLE_TEXT}>
            <TableHeader className={cn("sticky top-0 z-20", stickyHeadBg)}>
              <TableRow className={cn("hover:bg-transparent", stickyHeadBg)}>
                <TableHead
                  aria-sort={
                    sort.col === "sku" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                  className={cn(
                    "sticky left-0 top-0 z-30 min-w-[18ch] w-[18ch] max-w-[18ch] overflow-hidden border-r border-border pl-2 pr-3",
                    stickyHeadBg
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("sku")}
                    title={t("dataTable.sort")}
                    className="inline-flex w-full min-w-0 max-w-full items-center justify-start gap-1 text-left font-medium"
                  >
                    <span className="min-w-0 truncate">{t("priceParity.sku")}</span>
                    {sortIcon("sku")}
                  </button>
                </TableHead>
                <TableHead
                  aria-sort={
                    sort.col === "stock" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                  className={cn(
                    "sticky top-0 z-20 w-[4.25rem] min-w-[4.25rem] max-w-[5rem] whitespace-nowrap pl-4 text-right",
                    stickyHeadBg
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("stock")}
                    title={t("dataTable.sort")}
                    className="inline-flex w-full items-center justify-end gap-1 font-medium"
                  >
                    {t("priceParity.stock")}
                    {sortIcon("stock")}
                  </button>
                </TableHead>
                <TableHead
                  aria-sort={
                    sort.col === "name" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                  className={cn("sticky top-0 z-20 min-w-[9rem]", stickyHeadBg)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    title={t("dataTable.sort")}
                    className="inline-flex w-full min-w-0 items-center justify-start gap-1 font-medium"
                  >
                    <span className="truncate">{t("priceParity.article")}</span>
                    {sortIcon("name")}
                  </button>
                </TableHead>
                <TableHead
                  aria-sort={
                    sort.col === "amazon" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                  className={cn(MARKETPLACE_PRICE_COL, "sticky top-0 z-20", stickyHeadBg)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("amazon")}
                    title={t("dataTable.sort")}
                    className="inline-flex w-full min-w-0 max-w-full items-center justify-start gap-1 font-medium"
                  >
                    <span className="min-w-0 truncate">{t("priceParity.amazon")}</span>
                    {sortIcon("amazon")}
                  </button>
                </TableHead>
                {ANALYTICS_MARKETPLACES.map((m) => {
                  const sid = `mp:${m.slug}` as SortColumnId;
                  return (
                    <TableHead
                      key={m.slug}
                      aria-sort={
                        sort.col === sid ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                      }
                      className={cn(
                        MARKETPLACE_PRICE_COL,
                        "sticky top-0 z-20 text-muted-foreground",
                        stickyHeadBg
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(sid)}
                        title={t("dataTable.sort")}
                        className="inline-flex w-full min-w-0 max-w-full items-center justify-start gap-1 font-medium"
                      >
                        <span className="min-w-0 truncate">{m.label}</span>
                        {sortIcon(sid)}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiltered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4 + ANALYTICS_MARKETPLACES.length}
                    className="text-center text-xs text-muted-foreground"
                  >
                    {t("priceParity.noArticles")}
                  </TableCell>
                </TableRow>
              ) : (
                sortedFiltered.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 min-w-[18ch] w-[18ch] max-w-[18ch] overflow-hidden border-r border-border bg-card px-2 font-mono text-xs"
                      )}
                      title={row.sku}
                    >
                      <span className="block truncate">{row.sku}</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "w-[4.25rem] min-w-[4.25rem] max-w-[5rem] bg-card pl-4 text-right tabular-nums text-xs"
                      )}
                    >
                      {formatStock(row.stock)}
                    </TableCell>
                    <TableCell className={cn("max-w-[11rem] bg-card")}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="block max-w-full cursor-default truncate text-left text-xs leading-tight outline-none" tabIndex={0} />
                          }
                        >
                          {row.name}
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm">
                          {row.name}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={cn(MARKETPLACE_PRICE_COL, parityCellBg(row.amazon.state))}>
                      <ParityCellValue
                        label={t("priceParity.amazon")}
                        price={
                          draftPriceValues[cellKey(row.sku, "amazon")] !== undefined
                            ? normalizeNumberInput(draftPriceValues[cellKey(row.sku, "amazon")] ?? "")
                            : row.amazon.price
                        }
                        state={row.amazon.state}
                        stock={
                          draftStockValues[cellKey(row.sku, "amazon")] !== undefined
                            ? normalizeNumberInput(draftStockValues[cellKey(row.sku, "amazon")] ?? "")
                            : row.amazon.stock
                        }
                        stockState={row.amazon.stockState}
                        editing={Boolean(editMode)}
                        editingMode={editMode}
                        onPriceChange={(value) =>
                          setDraftPriceValues((prev) => ({ ...prev, [cellKey(row.sku, "amazon")]: value }))
                        }
                        onStockChange={(value) =>
                          setDraftStockValues((prev) => ({ ...prev, [cellKey(row.sku, "amazon")]: value }))
                        }
                      />
                    </TableCell>
                    {ANALYTICS_MARKETPLACES.map((m) => {
                      const cell = row.otherMarketplaces[m.slug] ?? {
                        price: null,
                        state: "not_connected" as const,
                        stock: null,
                        stockState: "not_connected" as const,
                      };
                      return (
                        <TableCell key={m.slug} className={cn(MARKETPLACE_PRICE_COL, parityCellBg(cell.state))}>
                          <ParityCellValue
                            label={m.label}
                            price={
                              draftPriceValues[cellKey(row.sku, m.slug)] !== undefined
                                ? normalizeNumberInput(draftPriceValues[cellKey(row.sku, m.slug)] ?? "")
                                : cell.price
                            }
                            state={cell.state}
                            stock={
                              draftStockValues[cellKey(row.sku, m.slug)] !== undefined
                                ? normalizeNumberInput(draftStockValues[cellKey(row.sku, m.slug)] ?? "")
                                : cell.stock
                            }
                            stockState={cell.stockState}
                            editing={Boolean(editMode)}
                            editingMode={editMode}
                            onPriceChange={(value) =>
                              setDraftPriceValues((prev) => ({ ...prev, [cellKey(row.sku, m.slug)]: value }))
                            }
                            onStockChange={(value) =>
                              setDraftStockValues((prev) => ({ ...prev, [cellKey(row.sku, m.slug)]: value }))
                            }
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
        </div>
      )}
    </section>
  );
}
