"use client";

import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/shared/components/DataTable";

type RangeMode = "today-yesterday" | "custom";

type AmazonOrderRow = {
  orderId: string;
  purchaseDate: string;
  amount: number;
  currency: string;
  fulfillment: string;
  status: string;
};

type OrdersResponse = {
  items?: AmazonOrderRow[];
  error?: string;
};

const AMAZON_ORDERS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type CachedOrdersPayload = {
  savedAt: number;
  items: AmazonOrderRow[];
};

function toDateInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount || 0);
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "Versendet") return "default";
  if (status === "Ausstehend") return "secondary";
  if (status === "Storniert") return "destructive";
  return "outline";
}

function fulfillmentVariant(value: string): "default" | "secondary" {
  return value === "FBA" ? "default" : "secondary";
}

export default function AmazonOrdersPage() {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const [mode, setMode] = useState<RangeMode>("today-yesterday");
  const [from, setFrom] = useState<string>(toDateInputValue(yesterday));
  const [to, setTo] = useState<string>(toDateInputValue(now));
  const [rows, setRows] = useState<AmazonOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => {
    const orders = rows.length;
    const fba = rows.filter((row) => row.fulfillment === "FBA").length;
    const fbm = rows.filter((row) => row.fulfillment === "FBM").length;
    const amount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    const currency = rows[0]?.currency || "EUR";
    return { orders, fba, fbm, amount, currency };
  }, [rows]);

  const columns = useMemo<Array<ColumnDef<AmazonOrderRow>>>(
    () => [
      {
        accessorKey: "orderId",
        header: "Bestellnummer",
        cell: ({ row }) => <span className="font-medium">{row.original.orderId}</span>,
      },
      {
        accessorKey: "purchaseDate",
        header: "Bestelldatum",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.purchaseDate)}</span>
        ),
      },
      {
        accessorKey: "amount",
        meta: { align: "center" },
        header: () => <div className="block w-full text-center">Summe</div>,
        cell: ({ row }) => (
          <div className="block w-full text-center tabular-nums">
            {formatAmount(row.original.amount, row.original.currency)}
          </div>
        ),
      },
      {
        accessorKey: "fulfillment",
        header: "FBA / FBM",
        cell: ({ row }) => (
          <Badge variant={fulfillmentVariant(row.original.fulfillment)}>
            {row.original.fulfillment || "Unbekannt"}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>{row.original.status || "Unbekannt"}</Badge>
        ),
      },
    ],
    []
  );

  const loadOrders = async (nextFrom?: string, nextTo?: string, forceRefresh = false) => {
    const cacheKey = `amazon_orders_cache_v1:${nextFrom ?? ""}:${nextTo ?? ""}`;
    if (!forceRefresh) {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CachedOrdersPayload;
          const isFresh = Date.now() - parsed.savedAt < AMAZON_ORDERS_CACHE_MAX_AGE_MS;
          if (isFresh && Array.isArray(parsed.items)) {
            setRows(parsed.items);
            setIsLoading(false);
            return;
          }
        } catch {
          // Cache optional, bei Fehler normal laden.
        }
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams();
      if (nextFrom) search.set("from", nextFrom);
      if (nextTo) search.set("to", nextTo);
      const res = await fetch(`/api/amazon/orders?${search.toString()}`);
      const payload = (await res.json()) as OrdersResponse;
      if (!res.ok) {
        throw new Error(payload.error ?? "Amazon Bestellungen konnten nicht geladen werden.");
      }
      const sorted = [...(payload.items ?? [])].sort(
        (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
      );
      setRows(sorted);
      const cachePayload: CachedOrdersPayload = {
        savedAt: Date.now(),
        items: sorted,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders(from, to);
  }, []);

  const handleModeChange = (value: RangeMode | null) => {
    if (value === null) return;
    setMode(value);
    if (value === "today-yesterday") {
      const todayValue = toDateInputValue(new Date());
      const yesterdayValue = toDateInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000));
      setFrom(yesterdayValue);
      setTo(todayValue);
      void loadOrders(yesterdayValue, todayValue);
    }
  };

  const applyCustomRange = () => {
    if (!from || !to) return;
    void loadOrders(from, to);
  };

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <img
            src="/brand/amazon-logo-current.png"
            alt="Amazon"
            className="h-auto w-[190px] shrink-0 object-contain"
            loading="eager"
          />
          <span className="text-xl font-semibold text-muted-foreground">Bestellungen</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Standard: heute + gestern. Optional per Von/Bis filterbar.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border/50 bg-card/80 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Zeitraum</p>
            <Select value={mode} onValueChange={handleModeChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today-yesterday">Heute + gestern</SelectItem>
                <SelectItem value="custom">Von - bis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "custom" ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Von</p>
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Bis</p>
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
              <button
                type="button"
                className="h-8 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
                onClick={applyCustomRange}
              >
                Anwenden
              </button>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            Gesamt FBA: <span className="font-semibold">{summary.fba}</span>
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            Gesamt FBM: <span className="font-semibold">{summary.fbm}</span>
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            Summe: <span className="font-semibold">{formatAmount(summary.amount, summary.currency)}</span>
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            Bestellungen: <span className="font-semibold">{summary.orders}</span>
          </span>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          Lade Amazon Bestellungen...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn="Bestellnummer, Status, FBA/FBM"
          paginate={false}
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
