"use client";

import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/shared/components/DataTable";

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
  pending?: boolean;
  source?: string;
};

const AMAZON_PRODUCTS_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

type CachedProductsPayload = {
  savedAt: number;
  items: AmazonProductRow[];
};

export default function AmazonProductsPage() {
  const [status, setStatus] = useState<ProductStatus>("active");
  const [rows, setRows] = useState<AmazonProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingInfo, setPendingInfo] = useState<string | null>(null);
  const totalArticlesLabel = useMemo(
    () => new Intl.NumberFormat("de-DE").format(rows.length),
    [rows.length]
  );

  const columns = useMemo<Array<ColumnDef<AmazonProductRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ row }) => <span className="font-medium">{row.original.sku || "—"}</span>,
      },
      {
        accessorKey: "asin",
        header: "ASIN",
        cell: ({ row }) => <span>{row.original.asin || "—"}</span>,
      },
      {
        accessorKey: "title",
        header: "Artikel",
        cell: ({ row }) => {
          const value = row.original.title || "";
          const truncated = value.length > 100 ? `${value.slice(0, 97)}...` : value;
          return (
            <span className="text-muted-foreground" title={value}>
              {truncated || "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "productType",
        header: "Produkttyp",
        cell: ({ row }) => <span>{row.original.productType || "—"}</span>,
      },
      {
        accessorKey: "statusLabel",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "secondary"}>
            {row.original.isActive ? "Aktiv" : "Deaktiviert"}
          </Badge>
        ),
      },
    ],
    []
  );

  useEffect(() => {
    const load = async () => {
      const cacheKey = `amazon_products_cache_v1:${status}`;
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CachedProductsPayload;
          const isFresh = Date.now() - parsed.savedAt < AMAZON_PRODUCTS_CACHE_MAX_AGE_MS;
          if (isFresh && Array.isArray(parsed.items)) {
            setRows(parsed.items);
            setPendingInfo(null);
            setIsLoading(false);
            return;
          }
        } catch {
          // Cache optional; bei Fehler normal weiter.
        }
      }

      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/amazon/products?status=${status}`);
        const payload = (await res.json()) as ProductsResponse;
        if (res.status === 202 && payload.pending) {
          setPendingInfo(payload.error ?? "Produktreport wird erstellt...");
          setRows([]);
          setTimeout(() => {
            void load();
          }, 5000);
          return;
        }
        if (!res.ok) {
          throw new Error(payload.error ?? "Amazon Produkte konnten nicht geladen werden.");
        }
        setPendingInfo(null);
        const nextItems = payload.items ?? [];
        setRows(nextItems);
        const cachePayload: CachedProductsPayload = {
          savedAt: Date.now(),
          items: nextItems,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
      } catch (e) {
        setRows([]);
        setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [status]);

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-2">
            <img
              src="/brand/amazon-logo-current.png"
              alt="Amazon"
              className="h-auto w-[190px] shrink-0 object-contain"
              loading="eager"
            />
            <span className="text-xl font-semibold text-muted-foreground">Produkte</span>
          </div>
          {!isLoading ? (
            <p className="text-sm text-muted-foreground">
              Gesamt Artikelmenge:{" "}
              <span className="font-medium text-foreground">{totalArticlesLabel}</span>
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Alle Amazon-Artikel mit Statusfilter. Standard ist aktiv.
        </p>
      </div>

      <div className="flex items-end gap-3 rounded-xl border border-border/50 bg-card/80 p-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="inactive">Deaktiviert</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {pendingInfo ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
          {pendingInfo}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          Lade Amazon Produkte...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn="SKU, ASIN oder Artikelnamen"
          paginate={false}
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
