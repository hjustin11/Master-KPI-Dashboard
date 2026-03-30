"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type CellState = "ok" | "missing" | "no_price" | "mismatch" | "not_connected";

type ParityRow = {
  sku: string;
  name: string;
  stock: number;
  amazon: { price: number | null; state: CellState };
  otherMarketplaces: Record<string, { price: number | null; state: CellState }>;
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

const PRICE_PARITY_CACHE_KEY = "marketplace_price_parity_v3";
const PRICE_PARITY_PAGE_SIZE = 25;

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

function PriceCell({
  price,
  state,
  label,
}: {
  price: number | null;
  state: CellState;
  label: string;
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

  if (state === "not_connected") {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={`${label}: ${t("priceParity.notConnected")}`}
      >
        —
      </span>
    );
  }
  if (state === "missing") {
    return (
      <div className="flex flex-col gap-px">
        <Badge variant="destructive" className="h-5 w-fit px-1.5 py-0 text-[10px] leading-none">
          {t("priceParity.missingListing")}
        </Badge>
        <span className="text-[10px] leading-tight text-muted-foreground">{t("priceParity.noListing")}</span>
      </div>
    );
  }
  if (state === "no_price") {
    return (
      <div className="flex flex-col gap-px">
        <span className="tabular-nums text-xs font-medium leading-tight">—</span>
        <Badge variant="secondary" className="h-5 w-fit px-1.5 py-0 text-[10px] leading-none">
          {t("priceParity.priceNa")}
        </Badge>
      </div>
    );
  }
  if (state === "mismatch") {
    return (
      <div className="flex flex-col gap-px">
        <span className="tabular-nums text-xs font-semibold leading-tight text-rose-700">
          {formatPrice(price)}
        </span>
        <Badge
          variant="outline"
          className="h-5 w-fit border-rose-300 px-1.5 py-0 text-[10px] leading-none text-rose-800"
        >
          {t("priceParity.deviating")}
        </Badge>
      </div>
    );
  }
  return <span className="tabular-nums text-xs leading-tight">{formatPrice(price)}</span>;
}

export function MarketplacePriceParitySection() {
  const { t, locale } = useTranslation();
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
  const [parityPage, setParityPage] = useState(0);
  const [sort, setSort] = useState<{ col: SortColumnId; dir: "asc" | "desc" }>({
    col: "sku",
    dir: "asc",
  });
  const [hasMounted, setHasMounted] = useState(false);
  const payloadRef = useRef<ParityResponse | null>(null);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedParityPayload>(PRICE_PARITY_CACHE_KEY);
      if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0 && !parsed.error) {
        const { savedAt: _s, ...rest } = parsed;
        setPayload(rest);
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
    if (showBackgroundIndicator) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      const res = await fetch("/api/marketplaces/price-parity?limit=350", { cache: "no-store" });
      const json = (await res.json()) as ParityResponse;
      if (!res.ok) {
        throw new Error(json.error ?? t("priceParity.loadError"));
      }
      setPayload(json);
      writeLocalJsonCache(PRICE_PARITY_CACHE_KEY, {
        savedAt: Date.now(),
        ...json,
      } satisfies CachedParityPayload);
    } catch (e) {
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
        setLoading(false);
      }
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    setHasMounted(true);
    void load(false, false);
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  const rows = payload?.rows ?? [];
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

  useEffect(() => {
    setParityPage(0);
  }, [query, rows.length, sort.col, sort.dir]);

  const parityPageCount = Math.max(1, Math.ceil(sortedFiltered.length / PRICE_PARITY_PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = parityPage * PRICE_PARITY_PAGE_SIZE;
    return sortedFiltered.slice(start, start + PRICE_PARITY_PAGE_SIZE);
  }, [sortedFiltered, parityPage]);

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

  const issueCount = payload?.issueCount ?? 0;

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
        <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-56 sm:shrink-0">
          <Input
            placeholder={t("priceParity.filterPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
          {isBackgroundSyncing ? (
            <span className={cn("inline-flex items-center gap-1.5", DASHBOARD_META_TEXT)}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("priceParity.syncing")}
            </span>
          ) : null}
          {payload?.meta ? (
            <p className={cn(DASHBOARD_META_TEXT, "leading-tight")}>
              {t("priceParity.metaLine", {
                articles: String(payload.meta.articleCount),
                amazonSkus: String(payload.meta.amazonMatchedSkus),
                issues: String(issueCount),
              })}
            </p>
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
          className={cn(
            DASHBOARD_COMPACT_TABLE_SCROLL,
            "relative min-h-[280px] max-h-[min(480px,58vh)] flex-1 rounded-md"
          )}
        >
          <Table className={DASHBOARD_COMPACT_TABLE_TEXT}>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead
                  aria-sort={
                    sort.col === "sku" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                  className={cn(
                    "sticky left-0 z-10 min-w-[18ch] w-[18ch] max-w-[18ch] overflow-hidden border-r border-border bg-muted/30 pl-2 pr-3"
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
                  className="w-[4.25rem] min-w-[4.25rem] max-w-[5rem] whitespace-nowrap bg-muted/30 pl-4 text-right"
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
                  className="min-w-[9rem] bg-muted/30"
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
                  className={cn(MARKETPLACE_PRICE_COL, "bg-muted/30")}
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
                      className={cn(MARKETPLACE_PRICE_COL, "bg-muted/30 text-muted-foreground")}
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
                pagedRows.map((row) => (
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
                      <PriceCell
                        price={row.amazon.price}
                        state={row.amazon.state}
                        label={t("priceParity.amazon")}
                      />
                    </TableCell>
                    {ANALYTICS_MARKETPLACES.map((m) => {
                      const cell = row.otherMarketplaces[m.slug] ?? {
                        price: null,
                        state: "not_connected" as const,
                      };
                      return (
                        <TableCell key={m.slug} className={cn(MARKETPLACE_PRICE_COL, parityCellBg(cell.state))}>
                          <PriceCell price={cell.price} state={cell.state} label={m.label} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {sortedFiltered.length > PRICE_PARITY_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-1 py-2">
              <p className="text-xs text-muted-foreground">
                {t("dataTable.pageOf", {
                  current: String(parityPage + 1),
                  total: String(parityPageCount),
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={parityPage <= 0}
                  onClick={() => setParityPage((p) => Math.max(0, p - 1))}
                >
                  {t("dataTable.prev")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={parityPage + 1 >= parityPageCount}
                  onClick={() => setParityPage((p) => p + 1)}
                >
                  {t("dataTable.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
