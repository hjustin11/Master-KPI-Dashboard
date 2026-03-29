"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/shared/components/DataTable";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type XentralArticleRow = {
  sku: string;
  name: string;
  stock: number;
  price?: number | null;
};

const XENTRAL_ARTICLES_CACHE_KEY = "xentral_articles_cache_v2";

type CachedPayload = {
  savedAt: number;
  items: XentralArticleRow[];
};

export default function XentralProductsPage() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<XentralArticleRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const dataRef = useRef<XentralArticleRow[]>([]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const totalStock = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.stock ?? 0), 0),
    [displayedRows]
  );
  const totalStockLabel = useMemo(
    () => new Intl.NumberFormat(intlLocaleTag(locale)).format(totalStock),
    [totalStock, locale]
  );

  const load = useCallback(async (forceRefresh = false, silent = false) => {
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedPayload>(XENTRAL_ARTICLES_CACHE_KEY);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        setData(parsed.items);
        setDisplayedRows(parsed.items);
        dataRef.current = parsed.items;
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
      const articlesRes = await fetch("/api/xentral/articles?all=1&limit=150", {
        cache: "no-store",
      });

      const articlesPayload = (await articlesRes.json()) as {
        items?: XentralArticleRow[];
        error?: string;
      };
      if (!articlesRes.ok) {
        throw new Error(articlesPayload.error ?? t("xentralProducts.loadError"));
      }

      const nextItems = articlesPayload.items ?? [];
      setData(nextItems);
      setDisplayedRows(nextItems);
      dataRef.current = nextItems;
      const savedAt = Date.now();
      writeLocalJsonCache(XENTRAL_ARTICLES_CACHE_KEY, { savedAt, items: nextItems } satisfies CachedPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Xentral Artikel] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    setHasMounted(true);
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      void load(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, load]);

  const columns = useMemo<Array<ColumnDef<XentralArticleRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: t("xentralProducts.sku"),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "name",
        header: t("xentralProducts.articleName"),
        cell: ({ row }) => {
          const raw = row.original.name ?? "";
          const truncated = raw.length > 70 ? `${raw.slice(0, 67)}…` : raw;
          return (
            <span className="text-muted-foreground" title={raw || undefined}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "stock",
        header: () => <div className="text-right">{t("xentralProducts.stock")}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.stock}
          </div>
        ),
      },
    ],
    [t]
  );

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("xentralProducts.title")}</h1>
          <div className="flex items-center gap-3">
            {!isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("xentralProducts.totalStock", { count: totalStockLabel })}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={isLoading || !hasMounted}
            >
              {t("xentralProducts.refresh")}
            </Button>
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("xentralProducts.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("xentralProducts.subtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground backdrop-blur-sm">
          {t("xentralProducts.loading")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn={t("filters.skuOrArticleName")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
          onDisplayedRowsChange={setDisplayedRows}
        />
      )}
    </div>
  );
}
