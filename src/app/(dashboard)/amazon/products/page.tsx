"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
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
import type { AmazonSpApiClientError } from "@/shared/lib/amazonSpApiClientError";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type ProductStatus = "active" | "inactive" | "all";

type AmazonProductRow = {
  sku: string;
  asin: string;
  title: string;
  productType: string;
  statusLabel: string;
  isActive: boolean;
};

type ProductsResponse = {
  items?: AmazonProductRow[];
  error?: string;
  missingKeys?: string[];
  hint?: string;
  pending?: boolean;
  source?: string;
};

type CachedProductsPayload = {
  savedAt: number;
  items: AmazonProductRow[];
};

export default function AmazonProductsPage() {
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<ProductStatus>("active");
  const [rows, setRows] = useState<AmazonProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<AmazonSpApiClientError | null>(null);
  const [pendingInfo, setPendingInfo] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const statusRef = useRef(status);
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const totalArticlesLabel = useMemo(
    () => new Intl.NumberFormat(intlLocaleTag(locale)).format(rows.length),
    [rows.length, locale]
  );

  const columns = useMemo<Array<ColumnDef<AmazonProductRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: t("amazonProducts.sku"),
        cell: ({ row }) => <span className="font-medium">{row.original.sku || "—"}</span>,
      },
      {
        accessorKey: "asin",
        header: t("amazonProducts.asin"),
        cell: ({ row }) => <span>{row.original.asin || "—"}</span>,
      },
      {
        accessorKey: "title",
        header: t("amazonProducts.article"),
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
        accessorKey: "productType",
        header: t("amazonProducts.productType"),
        cell: ({ row }) => <span>{row.original.productType || "—"}</span>,
      },
      {
        accessorKey: "statusLabel",
        header: t("amazonProducts.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "secondary"}>
            {row.original.isActive ? t("amazonProducts.active") : t("amazonProducts.inactive")}
          </Badge>
        ),
      },
    ],
    [t]
  );

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    const st = statusRef.current;
    const cacheKey = `amazon_products_cache_v1:${st}`;
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedProductsPayload>(cacheKey);
      if (parsed && Array.isArray(parsed.items)) {
        setRows(parsed.items);
        setPendingInfo(null);
        hadCache = true;
        setIsLoading(false);
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
      const res = await fetch(`/api/amazon/products?status=${st}`, { cache: "no-store" });
      const payload = (await res.json()) as ProductsResponse;
      if (res.status === 202 && payload.pending) {
        setPendingInfo(payload.error ?? "Produktreport wird erstellt...");
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
          message: payload.error ?? "Amazon Produkte konnten nicht geladen werden.",
          missingKeys: payload.missingKeys,
          hint: payload.hint,
        });
        setRows([]);
        return;
      }
      setPendingInfo(null);
      const nextItems = payload.items ?? [];
      setRows(nextItems);
      writeLocalJsonCache(cacheKey, {
        savedAt: Date.now(),
        items: nextItems,
      } satisfies CachedProductsPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Amazon Produkte] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setRows([]);
        setError({
          message: e instanceof Error ? e.message : "Unbekannter Fehler.",
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
  }, []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    statusRef.current = status;
    void load(false, false);
  }, [status, load]);

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
              src="/brand/amazon-logo-current.png"
              alt="Amazon"
              className="h-auto w-[190px] shrink-0 object-contain"
              loading="eager"
            />
            <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>
              {t("amazonProducts.productsWord")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("amazonProducts.totalCount", { count: totalArticlesLabel })}
              </p>
            ) : null}
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("amazonProducts.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("amazonProducts.subtitle")}</p>
      </div>

      <div className={cn(DASHBOARD_COMPACT_CARD, "flex flex-row flex-wrap items-end gap-3")}>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("amazonProducts.status")}</p>
          <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("amazonProducts.active")}</SelectItem>
              <SelectItem value="inactive">{t("amazonProducts.inactive")}</SelectItem>
              <SelectItem value="all">{t("amazonProducts.all")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          <p className="font-medium">{error.message}</p>
          {error.missingKeys && error.missingKeys.length > 0 ? (
            <p className="font-mono text-xs text-red-800/90">
              {t("amazonProducts.missingEnvVars", { keys: error.missingKeys.join(", ") })}
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
          {t("amazonProducts.loading")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn={t("filters.skuAsinOrTitle")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
