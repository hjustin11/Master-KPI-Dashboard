"use client";

import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/DataTable";

type XentralArticleRow = {
  sku: string;
  name: string;
  stock: number;
};

export default function XentralProductsPage() {
  const [data, setData] = useState<XentralArticleRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalStock = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.stock ?? 0), 0),
    [displayedRows]
  );
  const totalStockLabel = useMemo(
    () => new Intl.NumberFormat("de-DE").format(totalStock),
    [totalStock]
  );

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/xentral/articles?all=1&limit=150");
        const payload = (await res.json()) as { items?: XentralArticleRow[]; error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Xentral Artikel konnten nicht geladen werden.");
        const nextItems = payload.items ?? [];
        setData(nextItems);
        setDisplayedRows(nextItems);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
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
          {!isLoading ? (
            <p className="text-sm text-muted-foreground">
              Gesamtlagerbestand: <span className="font-medium text-foreground">{totalStockLabel}</span>
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Artikelstamm aus Xentral (SKU, Name, Bestand).
        </p>
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
