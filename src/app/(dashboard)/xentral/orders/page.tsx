"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/shared/components/DataTable";

type XentralOrderRow = {
  id: string;
  documentNumber: string;
  orderDate: string | null;
  customer: string;
  marketplace?: string;
  status: string;
  total: number | null;
  currency: string | null;
};

function formatBerlinYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : "";
}

/** Wie API recentDays=2: heute und Gestern Berlin (inklusiv). */
function defaultBerlinLastTwoDays(): { from: string; to: string } {
  const toYmd = formatBerlinYmd(new Date());
  const fromYmd = formatBerlinYmd(new Date(Date.now() - 86400000));
  return { from: fromYmd, to: toYmd };
}

/** v4: marketplace (Projekt), Standard-Datumfilter 2 Tage Berlin. */
const XENTRAL_ORDERS_CACHE_KEY = "xentral_orders_cache_v4";
const XENTRAL_ORDERS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

type ImportMode = "recent" | "all";

type CachedPayload = {
  savedAt: number;
  items: XentralOrderRow[];
  importMode: ImportMode;
  xentralTotalCount: number | null;
};

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: (currency || "EUR").trim() || "EUR",
  }).format(amount);
}

export default function XentralOrdersPage() {
  const [data, setData] = useState<XentralOrderRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("recent");
  /** Nach Mount setzen — verhindert Hydration-Mismatch (Datum/Intl zwischen Server und Browser). */
  const [hasMounted, setHasMounted] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const berlinRangeRef = useRef({ from: "", to: "" });

  const dateFilteredData = useMemo(() => {
    if (!hasMounted || (!dateFrom && !dateTo)) return data;
    return data.filter((row) => {
      const ymd = row.orderDate?.slice(0, 10) ?? "";
      if (!ymd) return false;
      if (dateFrom && ymd < dateFrom) return false;
      if (dateTo && ymd > dateTo) return false;
      return true;
    });
  }, [data, dateFrom, dateTo, hasMounted]);

  const sumDisplayed = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.total ?? 0), 0),
    [displayedRows]
  );

  const sumLabel = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(sumDisplayed),
    [sumDisplayed]
  );

  const load = useCallback(async (forceRefresh = false, mode: ImportMode = "recent") => {
    if (!forceRefresh) {
      const raw = localStorage.getItem(XENTRAL_ORDERS_CACHE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CachedPayload;
          const isFresh = Date.now() - parsed.savedAt < XENTRAL_ORDERS_CACHE_MAX_AGE_MS;
          if (
            isFresh &&
            Array.isArray(parsed.items) &&
            (parsed.importMode === "recent" || parsed.importMode === "all")
          ) {
            setData(parsed.items);
            setDisplayedRows(parsed.items);
            setTotalCount(
              typeof parsed.xentralTotalCount === "number"
                ? parsed.xentralTotalCount
                : parsed.items.length
            );
            setImportMode(parsed.importMode);
            setIsLoading(false);
            return;
          }
        } catch {
          /* Cache ungültig */
        }
      }
    }

    setIsLoading(true);
    setError(null);
    try {
      const qs =
        mode === "all"
          ? new URLSearchParams({ all: "1", limit: "50" })
          : new URLSearchParams({ recentDays: "2", limit: "50" });
      const res = await fetch(`/api/xentral/orders?${qs.toString()}`, {
        cache: "no-store",
      });

      const payload = (await res.json()) as {
        items?: XentralOrderRow[];
        totalCount?: number;
        error?: string;
        meta?: {
          mode?: string;
          stoppedEarly?: boolean;
          fromYmd?: string;
          toYmd?: string;
        };
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Xentral-Bestellungen konnten nicht geladen werden.");
      }

      const nextItems = payload.items ?? [];
      const apiTotal =
        typeof payload.totalCount === "number" ? payload.totalCount : nextItems.length;

      setData(nextItems);
      setDisplayedRows(nextItems);
      setTotalCount(apiTotal);
      setImportMode(mode);

      if (
        mode === "recent" &&
        payload.meta?.mode === "recentDays" &&
        typeof payload.meta.fromYmd === "string" &&
        typeof payload.meta.toYmd === "string"
      ) {
        berlinRangeRef.current = {
          from: payload.meta.fromYmd,
          to: payload.meta.toYmd,
        };
        setDateFrom(payload.meta.fromYmd);
        setDateTo(payload.meta.toYmd);
      }

      if (
        mode === "recent" &&
        payload.meta?.mode === "recentDays" &&
        payload.meta?.stoppedEarly
      ) {
        console.warn(
          "[Xentral] Datumsimport vorzeitig beendet (leere Seiten). Bei fehlenden Aufträgen: „Alle laden“."
        );
      }

      const savedAt = Date.now();
      localStorage.setItem(
        XENTRAL_ORDERS_CACHE_KEY,
        JSON.stringify({
          savedAt,
          items: nextItems,
          importMode: mode,
          xentralTotalCount: apiTotal,
        } satisfies CachedPayload)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    const d = defaultBerlinLastTwoDays();
    berlinRangeRef.current = { from: d.from, to: d.to };
    setDateFrom(d.from);
    setDateTo(d.to);
    void load(false);
  }, [load]);

  const columns = useMemo<Array<ColumnDef<XentralOrderRow>>>(
    () => [
      {
        accessorKey: "documentNumber",
        header: "Beleg / Nr.",
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.documentNumber}</span>,
      },
      {
        accessorKey: "orderDate",
        header: "Datum",
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.orderDate ?? "—"}</span>,
      },
      {
        accessorKey: "customer",
        header: "Kunde",
        cell: ({ row }) => {
          const value = row.original.customer ?? "";
          const truncated = value.length > 48 ? `${value.slice(0, 45)}…` : value;
          return (
            <span className="text-muted-foreground" title={value}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "marketplace",
        header: "Marktplatz",
        cell: ({ row }) => {
          const value = row.original.marketplace?.trim() || "—";
          const truncated = value.length > 32 ? `${value.slice(0, 29)}…` : value;
          return (
            <span className="text-muted-foreground" title={value === "—" ? undefined : value}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.status}</span>,
      },
      {
        accessorKey: "total",
        header: "Summe",
        meta: { align: "right" as const },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatMoney(row.original.total, row.original.currency)}</div>
        ),
      },
    ],
    []
  );

  const dateFilterIsDefault =
    hasMounted &&
    dateFrom === berlinRangeRef.current.from &&
    dateTo === berlinRangeRef.current.to;

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Bestellungen</h1>
          <div className="flex flex-wrap items-center gap-3">
            {!isLoading && displayedRows.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Angezeigt: <span className="font-medium text-foreground">{displayedRows.length}</span>
                {totalCount != null && totalCount > displayedRows.length ? (
                  <span> / {totalCount} in Xentral</span>
                ) : null}
                <span> · {dateFilteredData.length} im Zeitraum</span>
                {" · "}
                Summe (Ansicht): <span className="font-medium text-foreground">{sumLabel}</span>
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(true, importMode)}
              disabled={isLoading || !hasMounted}
            >
              Aktualisieren
            </Button>
            <Button
              type="button"
              variant={importMode === "all" ? "secondary" : "outline"}
              size="sm"
              onClick={() => void load(true, "all")}
              disabled={isLoading || !hasMounted}
              title="Vollständigen Bestand aus Xentral laden (kann lange dauern)"
            >
              Alle laden
            </Button>
            {importMode === "all" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void load(true, "recent")}
                disabled={isLoading || !hasMounted}
                title="Wieder nur die letzten 2 Kalendertage laden"
              >
                Nur 2 Tage
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground backdrop-blur-sm">
          Lade Bestellungen aus Xentral…
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={dateFilteredData}
          filterColumn="Beleg, Kunde, Marktplatz oder Status"
          toolbarEnd={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="xentral-orders-date-from" className="shrink-0 text-muted-foreground">
                  Von
                </Label>
                <Input
                  id="xentral-orders-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[min(100%,11rem)] tabular-nums"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="xentral-orders-date-to" className="shrink-0 text-muted-foreground">
                  Bis
                </Label>
                <Input
                  id="xentral-orders-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[min(100%,11rem)] tabular-nums"
                />
              </div>
              {!dateFilterIsDefault ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  disabled={!hasMounted}
                  onClick={() => {
                    const d = defaultBerlinLastTwoDays();
                    berlinRangeRef.current = { from: d.from, to: d.to };
                    setDateFrom(d.from);
                    setDateTo(d.to);
                  }}
                >
                  Letzte 2 Tage
                </Button>
              ) : null}
            </div>
          }
          paginate={false}
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
          onDisplayedRowsChange={setDisplayedRows}
        />
      )}
    </div>
  );
}

