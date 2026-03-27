"use client";

import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/shared/components/DataTable";

type XentralArticleRow = {
  sku: string;
  name: string;
  stock: number;
};

const XENTRAL_ARTICLES_CACHE_KEY = "xentral_articles_cache_v1";
const XENTRAL_ARTICLES_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

type CachedPayload = {
  savedAt: number;
  items: XentralArticleRow[];
};

export default function XentralProductsPage() {
  const [data, setData] = useState<XentralArticleRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const totalStock = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.stock ?? 0), 0),
    [displayedRows]
  );
  const totalStockLabel = useMemo(
    () => new Intl.NumberFormat("de-DE").format(totalStock),
    [totalStock]
  );

  const load = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const raw = localStorage.getItem(XENTRAL_ARTICLES_CACHE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CachedPayload;
          const isFresh = Date.now() - parsed.savedAt < XENTRAL_ARTICLES_CACHE_MAX_AGE_MS;
          if (isFresh && Array.isArray(parsed.items) && parsed.items.length > 0) {
            setData(parsed.items);
            setDisplayedRows(parsed.items);
            setLastUpdatedAt(parsed.savedAt);
            setIsLoading(false);
            return;
          }
        } catch {
          // Cache ist optional; bei Parse-Fehler einfach neu laden.
        }
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      const articlesRes = await fetch("/api/xentral/articles?all=1&limit=150", {
        cache: "no-store",
      });

      const articlesPayload = (await articlesRes.json()) as {
        items?: XentralArticleRow[];
        error?: string;
      };
      if (!articlesRes.ok) {
        throw new Error(articlesPayload.error ?? "Xentral Artikel konnten nicht geladen werden.");
      }

      const nextItems = articlesPayload.items ?? [];
      setData(nextItems);
      setDisplayedRows(nextItems);
      const savedAt = Date.now();
      setLastUpdatedAt(savedAt);
      const cachePayload: CachedPayload = { savedAt, items: nextItems };
      localStorage.setItem(XENTRAL_ARTICLES_CACHE_KEY, JSON.stringify(cachePayload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        await load(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      }
    };
    void run();
  }, []);

  const columns = useMemo<Array<ColumnDef<XentralArticleRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.sku}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Artikelname",
        cell: ({ row }) => {
          const value = row.original.name ?? "";
          const truncated = value.length > 70 ? `${value.slice(0, 67)}...` : value;
          return (
            <span className="text-muted-foreground" title={value}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "stock",
        header: () => <div className="text-right">Bestand</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.stock}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Artikel</h1>
          <div className="flex items-center gap-3">
            {!isLoading ? (
              <p className="text-sm text-muted-foreground">
                Gesamtlagerbestand: <span className="font-medium text-foreground">{totalStockLabel}</span>
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={isLoading}
            >
              Aktualisieren
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Artikelstamm aus Xentral (SKU, Name, Bestand).
        </p>
        {lastUpdatedAt ? (
          <p className="text-xs text-muted-foreground">
            Letztes Update: {new Date(lastUpdatedAt).toLocaleString("de-DE")}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground backdrop-blur-sm">
          Lade Artikel aus Xentral...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          filterColumn="SKU oder Artikelname"
          paginate={false}
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
          onDisplayedRowsChange={setDisplayedRows}
        />
      )}
    </div>
  );
}
