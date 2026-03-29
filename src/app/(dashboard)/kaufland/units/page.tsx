"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { DataTable } from "@/shared/components/DataTable";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_PAGE_SHELL,
  DASHBOARD_PAGE_TITLE,
} from "@/shared/lib/dashboardUi";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type UnitRow = {
  idUnit: string;
  title: string;
  quantity: number;
  priceEur: number | null;
  status: string;
};

type UnitsResponse = {
  items?: UnitRow[];
  error?: string;
  missingKeys?: string[];
};

export default function KauflandUnitsPage() {
  const { t, locale } = useTranslation();
  const intlTag = intlLocaleTag(locale);
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatMoney = useCallback(
    (n: number | null) =>
      n == null
        ? "—"
        : new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR" }).format(n),
    [intlTag]
  );

  const loadUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kaufland/units", { cache: "no-store" });
      const payload = (await res.json()) as UnitsResponse;
      if (!res.ok) {
        setError(payload.error ?? t("kauflandUnits.loadFailed"));
        setRows([]);
        return;
      }
      setRows(payload.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  const columns = useMemo<Array<ColumnDef<UnitRow>>>(
    () => [
      {
        accessorKey: "idUnit",
        header: t("kauflandUnits.offerId"),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.idUnit}</span>,
      },
      {
        accessorKey: "title",
        header: t("kauflandUnits.title"),
        cell: ({ row }) => (
          <span className="max-w-[18rem] truncate" title={row.original.title}>
            {row.original.title}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        meta: { align: "right" },
        header: () => <div className="text-right">{t("kauflandUnits.quantity")}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{row.original.quantity}</div>
        ),
      },
      {
        accessorKey: "priceEur",
        meta: { align: "right" },
        header: () => <div className="text-right">{t("kauflandUnits.price")}</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatMoney(row.original.priceEur)}</div>
        ),
      },
      {
        accessorKey: "status",
        header: t("kauflandUnits.status"),
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.status || "—"}</span>,
      },
    ],
    [t, formatMoney]
  );

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="relative block h-10 w-[130px] shrink-0">
            <Image
              src="/brand/marketplaces/kaufland.svg"
              alt={t("nav.kaufland")}
              fill
              className="object-contain object-left"
              sizes="130px"
              priority
            />
          </span>
          <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>{t("nav.kauflandUnits")}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("kauflandUnits.subtitle")}</p>
      </div>

      <div className={DASHBOARD_COMPACT_CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("kauflandUnits.hint")}</p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            onClick={() => void loadUnits()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("kauflandUnits.refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("kauflandUnits.loading")}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          filterColumn={t("filters.kauflandUnits")}
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
        />
      )}
    </div>
  );
}
