"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type RangeMode = "today-yesterday" | "custom";

type FressnapfOrderRow = {
  orderId: string;
  purchaseDate: string;
  amount: number;
  currency: string;
  units: number;
  statusRaw: string;
};

type OrdersResponse = {
  items?: FressnapfOrderRow[];
  error?: string;
  missingKeys?: string[];
};

type CachedOrdersPayload = {
  savedAt: number;
  items: FressnapfOrderRow[];
};

function toDateInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function statusVariantFromRaw(raw: string): "default" | "secondary" | "outline" | "destructive" {
  const n = raw.trim().toLowerCase();
  if (n.includes("cancel")) return "destructive";
  if (n.includes("sent") || n.includes("return") || n.includes("received") || n.includes("complete")) {
    return "default";
  }
  if (n.includes("open") || n.includes("pending")) return "secondary";
  return "outline";
}

function useFressnapfStatusLabel() {
  const { t } = useTranslation();
  return useCallback(
    (raw: string) => {
      const n = raw.trim().toLowerCase();
      if (!n) return t("fressnapfOrders.statusUnknown");
      if (n.includes("cancel")) return t("fressnapfOrders.statusCancelled");
      if (n.includes("sent") || n.includes("return") || n.includes("received") || n.includes("complete")) {
        return t("fressnapfOrders.statusCompleted");
      }
      if (n.includes("open") || n.includes("pending")) {
        return t("fressnapfOrders.statusPending");
      }
      return raw;
    },
    [t]
  );
}

export default function FressnapfOrdersPage() {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const labelForStatus = useFressnapfStatusLabel();

  const formatDateTime = useCallback((value: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(intlTag, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }, [intlTag]);

  const formatAmount = useCallback(
    (amount: number, currency: string) =>
      new Intl.NumberFormat(intlTag, {
        style: "currency",
        currency: currency || "EUR",
      }).format(amount || 0),
    [intlTag]
  );

  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const [mode, setMode] = useState<RangeMode>("today-yesterday");
  const [from, setFrom] = useState<string>(toDateInputValue(yesterday));
  const [to, setTo] = useState<string>(toDateInputValue(now));
  const [rows, setRows] = useState<FressnapfOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<{ message: string; missingKeys?: string[] } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const fromRef = useRef(from);
  const toRef = useRef(to);

  useEffect(() => {
    fromRef.current = from;
    toRef.current = to;
  }, [from, to]);

  const summary = useMemo(() => {
    const orders = rows.length;
    const units = rows.reduce((sum, row) => sum + (row.units ?? 0), 0);
    const amount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    const currency = rows[0]?.currency || "EUR";
    return { orders, units, amount, currency };
  }, [rows]);

  const columns = useMemo<Array<ColumnDef<FressnapfOrderRow>>>(
    () => [
      {
        accessorKey: "orderId",
        header: t("fressnapfOrders.orderId"),
        cell: ({ row }) => <span className="font-medium">{row.original.orderId}</span>,
      },
      {
        accessorKey: "purchaseDate",
        header: t("fressnapfOrders.purchaseDate"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.purchaseDate)}</span>
        ),
      },
      {
        accessorKey: "amount",
        meta: { align: "center" },
        header: () => <div className="block w-full text-center">{t("fressnapfOrders.total")}</div>,
        cell: ({ row }) => (
          <div className="block w-full text-center tabular-nums">
            {formatAmount(row.original.amount, row.original.currency)}
          </div>
        ),
      },
      {
        accessorKey: "units",
        meta: { align: "center" },
        header: () => <div className="block w-full text-center">{t("fressnapfOrders.units")}</div>,
        cell: ({ row }) => (
          <div className="block w-full text-center tabular-nums text-foreground">
            {row.original.units}
          </div>
        ),
      },
      {
        accessorKey: "statusRaw",
        header: t("fressnapfOrders.status"),
        cell: ({ row }) => (
          <Badge variant={statusVariantFromRaw(row.original.statusRaw)}>
            {labelForStatus(row.original.statusRaw)}
          </Badge>
        ),
      },
    ],
    [t, formatDateTime, formatAmount, labelForStatus]
  );

  const loadOrders = useCallback(
    async (nextFrom?: string, nextTo?: string, forceRefresh = false, silent = false) => {
      const f = nextFrom ?? fromRef.current;
      const rangeTo = nextTo ?? toRef.current;
      const cacheKey = `fressnapf_orders_cache_v1:${f}:${rangeTo}`;
      let hadCache = false;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<CachedOrdersPayload>(cacheKey);
        if (parsed && Array.isArray(parsed.items)) {
          setRows(parsed.items);
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
        const search = new URLSearchParams();
        if (f) search.set("from", f);
        if (rangeTo) search.set("to", rangeTo);
        const res = await fetch(`/api/fressnapf/orders?${search.toString()}`, { cache: "no-store" });
        const payload = (await res.json()) as OrdersResponse;
        if (!res.ok) {
          const message = payload.error ?? t("fressnapfOrders.loadFailed");
          setError({
            message,
            missingKeys: payload.missingKeys,
          });
          setRows([]);
          return;
        }
        const sorted = [...(payload.items ?? [])].sort(
          (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
        );
        setRows(sorted);
        writeLocalJsonCache(cacheKey, {
          savedAt: Date.now(),
          items: sorted,
        } satisfies CachedOrdersPayload);
      } catch (e) {
        if (silent) {
          console.warn("[Fressnapf Bestellungen] Hintergrund-Abgleich fehlgeschlagen:", e);
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
    [t]
  );

  useEffect(() => {
    setHasMounted(true);
    void loadOrders(from, to, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialer Ladevorgang nur beim Mount
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      void loadOrders(undefined, undefined, false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, loadOrders]);

  const handleModeChange = (value: RangeMode | null) => {
    if (value === null) return;
    setMode(value);
    if (value === "today-yesterday") {
      const todayValue = toDateInputValue(new Date());
      const yesterdayValue = toDateInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000));
      setFrom(yesterdayValue);
      setTo(todayValue);
      void loadOrders(yesterdayValue, todayValue, true, false);
    }
  };

  const applyCustomRange = () => {
    if (!from || !to) return;
    void loadOrders(from, to, true, false);
  };

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="relative block h-10 w-[130px] shrink-0">
            <Image
              src="/brand/marketplaces/fressnapf.svg"
              alt={t("nav.fressnapf")}
              fill
              className="object-contain object-left"
              sizes="130px"
              priority
            />
          </span>
          <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>{t("nav.fressnapfOrders")}</span>
        </div>
      </div>

      <div
        className={cn(DASHBOARD_COMPACT_CARD, "flex-row flex-wrap items-center justify-between gap-3")}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("fressnapfOrders.totalUnits", { count: summary.units })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("fressnapfOrders.sumLabel", { amount: formatAmount(summary.amount, summary.currency) })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("fressnapfOrders.ordersCount", { count: summary.orders })}
          </span>
          {isBackgroundSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("fressnapfOrders.syncing")}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("fressnapfOrders.period")}</p>
            <Select value={mode} onValueChange={handleModeChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue>
                  {mode === "today-yesterday"
                    ? t("fressnapfOrders.todayYesterday")
                    : t("fressnapfOrders.customRange")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today-yesterday">{t("fressnapfOrders.todayYesterday")}</SelectItem>
                <SelectItem value="custom">{t("fressnapfOrders.customRange")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "custom" ? (
            <>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("dates.from")}</p>
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("dates.to")}</p>
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
              <button
                type="button"
                className="h-8 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
                onClick={applyCustomRange}
              >
                {t("fressnapfOrders.apply")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          <p className="font-medium">{error.message}</p>
          {error.missingKeys && error.missingKeys.length > 0 ? (
            <p className="font-mono text-xs text-red-800/90">
              {t("fressnapfOrders.missingEnvVars", { keys: error.missingKeys.join(", ") })}
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("fressnapfOrders.loading")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn={t("filters.fressnapfOrders")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
