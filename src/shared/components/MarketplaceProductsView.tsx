"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DataTable } from "@/shared/components/DataTable";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_MARKETPLACE_LOGO_FRAME,
  DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME,
  DASHBOARD_PAGE_SHELL,
  DASHBOARD_PAGE_TITLE,
  MARKETPLACE_PRODUCTS_COL_SECONDARY_ID,
  MARKETPLACE_PRODUCTS_COL_SKU,
  MARKETPLACE_PRODUCTS_COL_STATUS,
  MARKETPLACE_PRODUCTS_COL_TITLE,
  MARKETPLACE_PRODUCTS_TABLE_CLASS,
} from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type ProductStatus = "active" | "inactive" | "all";

type ProductsApiPayload = {
  items?: MarketplaceProductListRow[];
  totalCount?: number;
  error?: string;
  missingKeys?: string[];
  hint?: string;
  pending?: boolean;
};

type CachedProductsPayload = {
  savedAt: number;
  items: MarketplaceProductListRow[];
  totalCount?: number;
};

export type MarketplaceProductsViewProps = {
  /** Feste URL oder Builder bei Amazon-Statusfilter */
  apiUrl: string | ((status: ProductStatus) => string);
  cacheKey: string | ((status: ProductStatus, pageIndex?: number) => string);
  logoSrc: string;
  brandAlt: string;
  /** Zusatz zu `DASHBOARD_MARKETPLACE_LOGO_FRAME` (z. B. `DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_LG`). */
  logoFrameClassName?: string;
  /** Abstand Logo ↔ „Produkte“-Titel (z. B. `gap-1` bei breitem Logo). */
  titleRowGapClassName?: string;
  /** i18n-Key für Untertitel (optional, z. B. eBay ohne Hinweistext) */
  subtitleKey?: string;
  /** Wenn gesetzt: Status-Dropdown wie bei Amazon */
  amazonStatusFilter?: boolean;
  /**
   * Serverseitige Seiten (`limit`/`offset` an der API). Pro Seite eigener Cache + Hintergrund-Abgleich nur für die aktuelle Seite.
   * Ohne: eine Antwort, Tabellen-Pagination nur im Browser (Standard, z. B. Amazon).
   */
  serverPagination?: boolean;
  /** Zeilen pro Seite (serverseitig oder im DataTable). */
  pageSize?: number;
  /**
   * Hintergrund-Abgleich (Standard 5 Min). Für schwere Listen (z. B. Amazon SP-API) ggf. höher setzen.
   */
  backgroundSyncIntervalMs?: number;
};

const REPORT_PENDING_MAX_ATTEMPTS = 36;
const REPORT_PENDING_DELAY_CAP_MS = 45_000;

export function MarketplaceProductsView({
  apiUrl,
  cacheKey,
  logoSrc,
  brandAlt,
  logoFrameClassName,
  titleRowGapClassName,
  subtitleKey,
  amazonStatusFilter = false,
  serverPagination = false,
  pageSize: pageSizeProp = 50,
  backgroundSyncIntervalMs = DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
}: MarketplaceProductsViewProps) {
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<ProductStatus>("active");
  const [pageIndex, setPageIndex] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [rows, setRows] = useState<MarketplaceProductListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<{ message: string; missingKeys?: string[]; hint?: string } | null>(
    null
  );
  const [pendingInfo, setPendingInfo] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const statusRef = useRef(status);
  const pageIndexRef = useRef(pageIndex);
  const rowsRef = useRef(rows);
  /** Nur für nicht-stille Loads — stille Polls erhöhen das nicht, damit Hintergrund-Sync keinen Nutzer-Fetch abbricht. */
  const foregroundLoadGenRef = useRef(0);
  const silentLoadGenRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const silentFetchAbortRef = useRef<AbortController | null>(null);
  const reportPendingAttemptRef = useRef(0);
  const reportPendingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    reportPendingAttemptRef.current = 0;
    if (reportPendingTimeoutRef.current != null) {
      window.clearTimeout(reportPendingTimeoutRef.current);
      reportPendingTimeoutRef.current = null;
    }
  }, [status, pageIndex]);

  const resolveCacheKey = useCallback(
    (st: ProductStatus, pi: number) => {
      if (typeof cacheKey === "function") return cacheKey(st, serverPagination ? pi : 0);
      if (serverPagination) return `${cacheKey}_p${pi}`;
      return cacheKey;
    },
    [cacheKey, serverPagination]
  );

  const buildRequestUrl = useCallback(
    (st: ProductStatus) => {
      const base = typeof apiUrl === "function" ? apiUrl(st) : apiUrl;
      if (!serverPagination) return base;
      const u = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      u.searchParams.set("limit", String(pageSizeProp));
      u.searchParams.set("offset", String(pageIndexRef.current * pageSizeProp));
      return `${u.pathname}${u.search}`;
    },
    [apiUrl, serverPagination, pageSizeProp]
  );

  const totalArticlesLabel = useMemo(() => {
    const n = serverPagination && totalCount != null ? totalCount : rows.length;
    return new Intl.NumberFormat(intlLocaleTag(locale)).format(n);
  }, [serverPagination, totalCount, rows.length, locale]);

  const columns = useMemo<Array<ColumnDef<MarketplaceProductListRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: t("marketplaceProducts.sku"),
        meta: {
          thClassName: MARKETPLACE_PRODUCTS_COL_SKU,
          tdClassName: MARKETPLACE_PRODUCTS_COL_SKU,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => (
          <span className="block truncate font-medium" title={row.original.sku || undefined}>
            {row.original.sku || "—"}
          </span>
        ),
      },
      {
        accessorKey: "secondaryId",
        header: t("marketplaceProducts.secondaryId"),
        meta: {
          thClassName: MARKETPLACE_PRODUCTS_COL_SECONDARY_ID,
          tdClassName: MARKETPLACE_PRODUCTS_COL_SECONDARY_ID,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.secondaryId || undefined}>
            {row.original.secondaryId || "—"}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: t("marketplaceProducts.articleName"),
        meta: {
          thClassName: MARKETPLACE_PRODUCTS_COL_TITLE,
          tdClassName: MARKETPLACE_PRODUCTS_COL_TITLE,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => {
          const raw = row.original.title || "";
          return (
            <span className="block min-w-0 truncate text-muted-foreground" title={raw || undefined}>
              {raw || "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "statusLabel",
        header: t("marketplaceProducts.status"),
        meta: {
          thClassName: `${MARKETPLACE_PRODUCTS_COL_STATUS} whitespace-nowrap`,
          tdClassName: `${MARKETPLACE_PRODUCTS_COL_STATUS} whitespace-nowrap`,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "secondary"}>
            {row.original.isActive ? t("marketplaceProducts.active") : t("marketplaceProducts.inactive")}
          </Badge>
        ),
      },
    ],
    [t]
  );

  const load = useCallback(
    async (forceRefresh = false, silent = false) => {
      const st = statusRef.current;
      const pi = serverPagination ? pageIndexRef.current : 0;
      const key = resolveCacheKey(st, pi);
      let hadCache = false;

      let myForegroundGen = 0;
      let mySilentGen = 0;
      let ac: AbortController;
      if (!silent) {
        foregroundLoadGenRef.current += 1;
        myForegroundGen = foregroundLoadGenRef.current;
        silentFetchAbortRef.current?.abort();
        fetchAbortRef.current?.abort();
        ac = new AbortController();
        fetchAbortRef.current = ac;
      } else {
        silentLoadGenRef.current += 1;
        mySilentGen = silentLoadGenRef.current;
        silentFetchAbortRef.current?.abort();
        ac = new AbortController();
        silentFetchAbortRef.current = ac;
      }

      const isStale = () =>
        silent ? mySilentGen !== silentLoadGenRef.current : myForegroundGen !== foregroundLoadGenRef.current;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<CachedProductsPayload>(key);
        if (parsed && Array.isArray(parsed.items)) {
          setRows(parsed.items);
          setPendingInfo(null);
          hadCache = true;
          setIsLoading(false);
          if (serverPagination && typeof parsed.totalCount === "number") {
            setTotalCount(parsed.totalCount);
          } else if (!serverPagination) {
            setTotalCount(parsed.items.length);
          }
        }
      }

      if (forceRefresh && !silent) {
        setIsLoading(true);
      } else if (!hadCache && !silent) {
        setIsLoading(true);
      }

      const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(true);
      }

      if (!silent) {
        setError(null);
      }

      try {
        const url = buildRequestUrl(st);
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        const payload = (await res.json()) as ProductsApiPayload;

        if (isStale()) return;

        if (res.status === 202 && payload.pending) {
          reportPendingAttemptRef.current += 1;
          const attempt = reportPendingAttemptRef.current;
          setPendingInfo(payload.error ?? t("marketplaceProducts.reportPending"));
          if (!hadCache && rowsRef.current.length === 0) {
            setRows([]);
          }
          if (attempt > REPORT_PENDING_MAX_ATTEMPTS) {
            setError({
              message: t("marketplaceProducts.reportPendingGiveUp"),
            });
            setPendingInfo(null);
            reportPendingAttemptRef.current = 0;
            return;
          }
          const delayMs = Math.min(
            REPORT_PENDING_DELAY_CAP_MS,
            Math.round(3500 * Math.pow(1.38, attempt - 1))
          );
          if (reportPendingTimeoutRef.current != null) {
            window.clearTimeout(reportPendingTimeoutRef.current);
          }
          reportPendingTimeoutRef.current = window.setTimeout(() => {
            reportPendingTimeoutRef.current = null;
            void load(forceRefresh, silent);
          }, delayMs);
          return;
        }

        reportPendingAttemptRef.current = 0;
        if (reportPendingTimeoutRef.current != null) {
          window.clearTimeout(reportPendingTimeoutRef.current);
          reportPendingTimeoutRef.current = null;
        }

        if (!res.ok) {
          setError({
            message: payload.error ?? t("marketplaceProducts.loadFailed"),
            missingKeys: payload.missingKeys,
            hint: payload.hint,
          });
          setRows([]);
          if (serverPagination) setTotalCount(null);
          return;
        }
        setPendingInfo(null);
        const nextItems = payload.items ?? [];
        setRows(nextItems);
        if (serverPagination && typeof payload.totalCount === "number") {
          setTotalCount(payload.totalCount);
        } else if (!serverPagination) {
          setTotalCount(nextItems.length);
        }
        writeLocalJsonCache(key, {
          savedAt: Date.now(),
          items: nextItems,
          totalCount: serverPagination ? payload.totalCount : undefined,
        } satisfies CachedProductsPayload);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (silent) {
          console.warn("[Marketplace Produkte] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
          setRows([]);
          setError({
            message: e instanceof Error ? e.message : t("commonUi.unknownError"),
          });
        }
      } finally {
        if (isStale()) return;
        if (!silent) {
          setIsLoading(false);
        }
        if (showBackgroundIndicator) {
          setIsBackgroundSyncing(false);
        }
      }
    },
    [buildRequestUrl, resolveCacheKey, serverPagination, t]
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    statusRef.current = status;
    pageIndexRef.current = pageIndex;
  }, [status, pageIndex]);

  useEffect(() => {
    if (amazonStatusFilter) {
      setPageIndex(0);
    }
  }, [status, amazonStatusFilter]);

  useEffect(() => {
    void load(false, false);
  }, [status, pageIndex, load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void load(false, true);
    }, backgroundSyncIntervalMs);
    return () => window.clearInterval(id);
  }, [hasMounted, load, backgroundSyncIntervalMs]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
      silentFetchAbortRef.current?.abort();
      if (reportPendingTimeoutRef.current != null) {
        window.clearTimeout(reportPendingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className={cn("flex items-center gap-2", titleRowGapClassName)}>
            <span className={cn(DASHBOARD_MARKETPLACE_LOGO_FRAME, logoFrameClassName)}>
              <img
                src={logoSrc}
                alt={brandAlt}
                className={DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME}
                loading="eager"
              />
            </span>
            <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>
              {t("marketplaceProducts.productsWord")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("marketplaceProducts.totalCount", { count: totalArticlesLabel })}
              </p>
            ) : null}
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("marketplaceProducts.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        {subtitleKey ? (
          <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
        ) : null}
      </div>

      {amazonStatusFilter ? (
        <div className={cn(DASHBOARD_COMPACT_CARD, "flex flex-row flex-wrap items-end gap-3")}>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("marketplaceProducts.filterStatus")}</p>
            <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("marketplaceProducts.active")}</SelectItem>
                <SelectItem value="inactive">{t("marketplaceProducts.inactive")}</SelectItem>
                <SelectItem value="all">{t("marketplaceProducts.all")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          <p className="font-medium">{error.message}</p>
          {error.missingKeys && error.missingKeys.length > 0 ? (
            <p className="font-mono text-xs text-red-800/90">
              {t("marketplaceProducts.missingEnvVars", { keys: error.missingKeys.join(", ") })}
            </p>
          ) : null}
          {error.hint ? <p className="text-xs leading-relaxed text-red-900/80">{error.hint}</p> : null}
        </div>
      ) : null}

      {pendingInfo ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
          {pendingInfo}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("marketplaceProducts.loading")}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={rows}
            filterColumn={t("filters.skuAsinOrTitle")}
            paginate={!serverPagination}
            defaultPageSize={pageSizeProp}
            getRowId={(row) => `${row.sku}\u0000${row.secondaryId}`}
            compact
            className="flex-1 min-h-0"
            tableWrapClassName="min-h-0"
            tableClassName={MARKETPLACE_PRODUCTS_TABLE_CLASS}
          />
          {serverPagination && totalCount != null && totalCount > pageSizeProp ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t("dataTable.pageOf", {
                  current: String(pageIndex + 1),
                  total: String(Math.max(1, Math.ceil(totalCount / pageSizeProp))),
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  {t("dataTable.prev")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(pageIndex + 1) * pageSizeProp >= totalCount}
                  onClick={() => setPageIndex((p) => p + 1)}
                >
                  {t("dataTable.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
