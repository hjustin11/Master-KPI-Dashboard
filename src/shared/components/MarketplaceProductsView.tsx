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
  DASHBOARD_PAGE_SHELL,
  DASHBOARD_PAGE_TITLE,
} from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
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
  /** i18n-Key für Untertitel */
  subtitleKey: string;
  /** Wenn gesetzt: Status-Dropdown wie bei Amazon */
  amazonStatusFilter?: boolean;
  /**
   * Serverseitige Seiten (`limit`/`offset` an der API). Pro Seite eigener Cache + Hintergrund-Abgleich nur für die aktuelle Seite.
   * Ohne: eine Antwort, Tabellen-Pagination nur im Browser (Standard, z. B. Amazon).
   */
  serverPagination?: boolean;
  /** Zeilen pro Seite (serverseitig oder im DataTable). */
  pageSize?: number;
};

export function MarketplaceProductsView({
  apiUrl,
  cacheKey,
  logoSrc,
  brandAlt,
  subtitleKey,
  amazonStatusFilter = false,
  serverPagination = false,
  pageSize: pageSizeProp = 50,
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

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

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
        cell: ({ row }) => <span className="font-medium">{row.original.sku || "—"}</span>,
      },
      {
        accessorKey: "secondaryId",
        header: t("marketplaceProducts.secondaryId"),
        cell: ({ row }) => <span>{row.original.secondaryId || "—"}</span>,
      },
      {
        accessorKey: "title",
        header: t("marketplaceProducts.article"),
        cell: ({ row }) => {
          const raw = row.original.title || "";
          const truncated = raw.length > 100 ? `${raw.slice(0, 97)}…` : raw;
          return (
            <span className="text-muted-foreground" title={raw || undefined}>
              {truncated || "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "statusLabel",
        header: t("marketplaceProducts.status"),
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
        const res = await fetch(url, { cache: "no-store" });
        const payload = (await res.json()) as ProductsApiPayload;
        if (res.status === 202 && payload.pending) {
          setPendingInfo(payload.error ?? t("marketplaceProducts.reportPending"));
          if (!hadCache && rowsRef.current.length === 0) {
            setRows([]);
          }
          window.setTimeout(() => {
            void load(forceRefresh, silent);
          }, 5000);
          return;
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
        if (silent) {
          console.warn("[Marketplace Produkte] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
          setRows([]);
          setError({
            message: e instanceof Error ? e.message : t("commonUi.unknownError"),
          });
        }
      } finally {
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
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-2">
            <img
              src={logoSrc}
              alt={brandAlt}
              className="h-auto max-h-12 w-[min(100%,190px)] shrink-0 object-contain object-left"
              loading="eager"
            />
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
        <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
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
