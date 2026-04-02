"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DataTable } from "@/shared/components/DataTable";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_MARKETPLACE_LOGO_FRAME,
  DASHBOARD_MARKETPLACE_LOGO_IMAGE_FILL,
  DASHBOARD_PAGE_SHELL,
  DASHBOARD_PAGE_TITLE,
} from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { MarketplaceOrderIdLink } from "@/shared/components/MarketplaceOrderIdLink";
import {
  filterMarketplaceOrdersByYmdRange,
  mergeMarketplaceOrderLists,
} from "@/shared/lib/marketplaceOrdersClientMerge";
import { toDateInputValue } from "@/shared/lib/orderDateParams";
import { useStableTableRowsDuringFetch } from "@/shared/lib/useStableTableRowsDuringFetch";

const TIKTOK_ORDERS_ACCUMULATED_LS_KEY = "tiktok_orders_accumulated_v1";

type TiktokOrderRow = {
  orderId: string;
  purchaseDate: string;
  amount: number;
  currency: string;
  units: number;
  statusRaw: string;
};

type OrdersResponse = {
  items?: TiktokOrderRow[];
  error?: string;
  missingKeys?: string[];
};

type CachedOrdersPayload = {
  savedAt: number;
  items: TiktokOrderRow[];
};

function statusVariantFromRaw(raw: string): "default" | "secondary" | "outline" | "destructive" {
  const n = raw.trim().toLowerCase();
  if (n.includes("cancel")) return "destructive";
  if (n.includes("sent") || n.includes("return") || n.includes("received") || n.includes("complete")) {
    return "default";
  }
  if (n.includes("open") || n.includes("pending")) return "secondary";
  return "outline";
}

function useTiktokStatusLabel() {
  const { t } = useTranslation();
  return useCallback(
    (raw: string) => {
      const n = raw.trim().toLowerCase();
      if (!n) return t("tiktokOrders.statusUnknown");
      if (n.includes("cancel")) return t("tiktokOrders.statusCancelled");
      if (n.includes("sent") || n.includes("return") || n.includes("received") || n.includes("complete")) {
        return t("tiktokOrders.statusCompleted");
      }
      if (n.includes("open") || n.includes("pending")) {
        return t("tiktokOrders.statusPending");
      }
      return raw;
    },
    [t]
  );
}

export default function TiktokOrdersPage() {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const labelForStatus = useTiktokStatusLabel();

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

  const [from, setFrom] = useState<string>(toDateInputValue(yesterday));
  const [to, setTo] = useState<string>(toDateInputValue(now));
  const [allRows, setAllRows] = useState<TiktokOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<{ message: string; missingKeys?: string[] } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const fromRef = useRef(from);
  const toRef = useRef(to);
  const allRowsRef = useRef<TiktokOrderRow[]>([]);

  useEffect(() => {
    fromRef.current = from;
    toRef.current = to;
  }, [from, to]);

  useEffect(() => {
    allRowsRef.current = allRows;
  }, [allRows]);

  const displayedRows = useMemo(
    () => filterMarketplaceOrdersByYmdRange(allRows, from, to),
    [allRows, from, to]
  );

  const tableRows = useStableTableRowsDuringFetch({
    rows: displayedRows,
    isFetchActive: isLoading || isBackgroundSyncing,
  });

  const summary = useMemo(() => {
    const orders = tableRows.length;
    const units = tableRows.reduce((sum, row) => sum + (row.units ?? 0), 0);
    const amount = tableRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    const currency = tableRows[0]?.currency || "EUR";
    return { orders, units, amount, currency };
  }, [tableRows]);

  const columns = useMemo<Array<ColumnDef<TiktokOrderRow>>>(
    () => [
      {
        accessorKey: "orderId",
        header: t("tiktokOrders.orderId"),
        cell: ({ row }) => (
          <MarketplaceOrderIdLink marketplace="TikTok" internetNumber={row.original.orderId} />
        ),
      },
      {
        accessorKey: "purchaseDate",
        header: t("tiktokOrders.purchaseDate"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.purchaseDate)}</span>
        ),
      },
      {
        accessorKey: "units",
        meta: { align: "center" },
        header: () => <div className="block w-full text-center">{t("tiktokOrders.units")}</div>,
        cell: ({ row }) => (
          <div className="block w-full text-center tabular-nums text-foreground">
            {row.original.units}
          </div>
        ),
      },
      {
        accessorKey: "statusRaw",
        header: t("tiktokOrders.status"),
        cell: ({ row }) => (
          <Badge variant={statusVariantFromRaw(row.original.statusRaw)}>
            {labelForStatus(row.original.statusRaw)}
          </Badge>
        ),
      },
      {
        accessorKey: "amount",
        meta: { align: "right" },
        header: () => <div className="block w-full text-right">{t("tiktokOrders.total")}</div>,
        cell: ({ row }) => (
          <div className="block w-full text-right tabular-nums">
            {formatAmount(row.original.amount, row.original.currency)}
          </div>
        ),
      },
    ],
    [t, formatDateTime, formatAmount, labelForStatus]
  );

  const loadOrders = useCallback(
    async (nextFrom?: string, nextTo?: string, forceRefresh = false, silent = false) => {
      const f = nextFrom ?? fromRef.current;
      const rangeTo = nextTo ?? toRef.current;
      let hadCache = false;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<CachedOrdersPayload>(TIKTOK_ORDERS_ACCUMULATED_LS_KEY);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          setAllRows(parsed.items);
          hadCache = true;
          setIsLoading(false);
        }
      }

      const hasAnyRows = hadCache || allRowsRef.current.length > 0;
      if (forceRefresh && !silent && !hasAnyRows) {
        setIsLoading(true);
      } else if (!hasAnyRows && !silent) {
        setIsLoading(true);
      } else if (!silent) {
        setIsLoading(false);
      }

      const showBackgroundIndicator = silent || hasAnyRows;
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
        const res = await fetch(`/api/tiktok/orders?${search.toString()}`, { cache: "no-store" });
        const payload = (await res.json()) as OrdersResponse;
        if (!res.ok) {
          const message = payload.error ?? t("tiktokOrders.loadFailed");
          setError({
            message,
            missingKeys: payload.missingKeys,
          });
          return;
        }
        const fresh = payload.items ?? [];
        setAllRows((prev) => {
          const merged = mergeMarketplaceOrderLists(prev, fresh);
          writeLocalJsonCache(TIKTOK_ORDERS_ACCUMULATED_LS_KEY, {
            savedAt: Date.now(),
            items: merged,
          } satisfies CachedOrdersPayload);
          return merged;
        });
      } catch (e) {
        if (silent) {
          console.warn("[Tiktok Bestellungen] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
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
  }, []);

  useEffect(() => {
    if (!from || !to || from > to) return;
    void loadOrders(from, to, false, false);
  }, [from, to, loadOrders]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadOrders(undefined, undefined, false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted, loadOrders]);

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className={DASHBOARD_MARKETPLACE_LOGO_FRAME}>
            <Image
              src="/brand/marketplaces/tiktok.svg"
              alt={t("nav.tiktok")}
              fill
              className={DASHBOARD_MARKETPLACE_LOGO_IMAGE_FILL}
              sizes="120px"
              priority
            />
          </span>
          <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>{t("nav.tiktokOrders")}</span>
        </div>
      </div>

      <div
        className={cn(DASHBOARD_COMPACT_CARD, "flex-row flex-wrap items-center justify-between gap-3")}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("tiktokOrders.totalUnits", { count: summary.units })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("tiktokOrders.sumLabel", { amount: formatAmount(summary.amount, summary.currency) })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("tiktokOrders.ordersCount", { count: summary.orders })}
          </span>
          {isBackgroundSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("tiktokOrders.syncing")}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-end justify-end gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("dates.from")}</p>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("dates.to")}</p>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          <p className="font-medium">{error.message}</p>
          {error.missingKeys && error.missingKeys.length > 0 ? (
            <p className="font-mono text-xs text-red-800/90">
              {t("tiktokOrders.missingEnvVars", { keys: error.missingKeys.join(", ") })}
            </p>
          ) : null}
        </div>
      ) : null}

      {isLoading && tableRows.length === 0 && allRows.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("ordersShared.loading", { marketplace: t("nav.tiktok") })}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={tableRows}
          filterColumn={t("filters.tiktokOrders")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
