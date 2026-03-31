"use client";

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
  DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME,
  DASHBOARD_PAGE_SHELL,
  DASHBOARD_PAGE_TITLE,
} from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import type { AmazonSpApiClientError } from "@/shared/lib/amazonSpApiClientError";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type AmazonOrderRow = {
  orderId: string;
  purchaseDate: string;
  amount: number;
  currency: string;
  fulfillment: string;
  status: string;
  statusRaw?: string;
};

type OrdersResponse = {
  items?: AmazonOrderRow[];
  error?: string;
  status?: number;
  preview?: string;
  missingKeys?: string[];
  hint?: string;
};

type CachedOrdersPayload = {
  savedAt: number;
  items: AmazonOrderRow[];
};

function toDateInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function normalizeStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "shipped") return "shipped";
  if (normalized === "unshipped" || normalized === "pending" || normalized === "partiallyshipped") return "pending";
  if (normalized === "canceled" || normalized === "cancelled") return "cancelled";
  return "unknown";
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  const normalized = normalizeStatus(status);
  if (normalized === "shipped") return "default";
  if (normalized === "pending") return "secondary";
  if (normalized === "cancelled") return "destructive";
  return "outline";
}

function fulfillmentVariant(value: string): "default" | "secondary" {
  return value === "FBA" ? "default" : "secondary";
}

export default function AmazonOrdersPage() {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);

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
  const [rows, setRows] = useState<AmazonOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<AmazonSpApiClientError | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const fromRef = useRef(from);
  const toRef = useRef(to);

  useEffect(() => {
    fromRef.current = from;
    toRef.current = to;
  }, [from, to]);
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
        header: t("amazonOrders.orderId"),
        cell: ({ row }) => <span className="font-medium">{row.original.orderId}</span>,
      },
      {
        accessorKey: "purchaseDate",
        header: t("amazonOrders.purchaseDate"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.purchaseDate)}</span>
        ),
      },
      {
        accessorKey: "fulfillment",
        header: t("amazonOrders.fulfillment"),
        cell: ({ row }) => (
          <Badge variant={fulfillmentVariant(row.original.fulfillment)}>
            {row.original.fulfillment || t("amazonOrders.unknown")}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: t("amazonOrders.status"),
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>
            {(() => {
            const key = normalizeStatus(row.original.statusRaw || row.original.status);
            if (key === "shipped") return t("amazonOrders.statusShipped");
            if (key === "pending") return t("amazonOrders.statusPending");
            if (key === "cancelled") return t("amazonOrders.statusCancelled");
            return t("amazonOrders.unknown");
          })()}
          </Badge>
        ),
      },
      {
        accessorKey: "amount",
        meta: { align: "right" },
        header: () => <div className="block w-full text-right">{t("amazonOrders.total")}</div>,
        cell: ({ row }) => (
          <div className="block w-full text-right tabular-nums">
            {formatAmount(row.original.amount, row.original.currency)}
          </div>
        ),
      },
    ],
    [t, formatDateTime, formatAmount]
  );

  const loadOrders = useCallback(
    async (nextFrom?: string, nextTo?: string, forceRefresh = false, silent = false) => {
      const f = nextFrom ?? fromRef.current;
      const rangeTo = nextTo ?? toRef.current;
      const cacheKey = `amazon_orders_cache_v1:${f}:${rangeTo}`;
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
        const res = await fetch(`/api/amazon/orders?${search.toString()}`, { cache: "no-store" });
        const payload = (await res.json()) as OrdersResponse;
        if (!res.ok) {
          const message = t("amazonOrders.loadFailed");
          const serverHint = [
            payload.hint,
            typeof payload.status === "number" ? `HTTP ${payload.status}` : null,
            payload.preview ? String(payload.preview).slice(0, 160) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          setError({
            message,
            missingKeys: payload.missingKeys,
            hint: serverHint || undefined,
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
          console.warn("[Amazon Bestellungen] Hintergrund-Abgleich fehlgeschlagen:", e);
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
        <div className="flex items-center gap-2">
          <span className={DASHBOARD_MARKETPLACE_LOGO_FRAME}>
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"
              alt={t("nav.amazon")}
              className={DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME}
              loading="eager"
            />
          </span>
          <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>{t("nav.amazonOrders")}</span>
        </div>
      </div>

      <div
        className={cn(DASHBOARD_COMPACT_CARD, "flex-row flex-wrap items-center justify-between gap-3")}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("amazonOrders.totalFba", { count: summary.fba })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("amazonOrders.totalFbm", { count: summary.fbm })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("amazonOrders.sumLabel", { amount: formatAmount(summary.amount, summary.currency) })}
          </span>
          <span className="rounded-md border border-border/60 bg-background/80 px-2.5 py-1">
            {t("amazonOrders.ordersCount", { count: summary.orders })}
          </span>
          {isBackgroundSyncing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("amazonOrders.syncing")}
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
              {t("amazonOrders.missingEnvVars", { keys: error.missingKeys.join(", ") })}
            </p>
          ) : null}
          {error.hint ? <p className="text-xs leading-relaxed text-red-900/80">{error.hint}</p> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("amazonOrders.loading")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn={t("filters.amazonOrders")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
