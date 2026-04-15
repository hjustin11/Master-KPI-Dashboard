"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MarketplaceOrderIdLink } from "@/shared/components/MarketplaceOrderIdLink";
import { XentralBelegNumberLink } from "../XentralBelegNumberLink";
import { AddressValidationCell } from "./XentralAddressHelpers";
import {
  resolveAddressDisplay,
  type XentralOrderRow,
} from "@/shared/lib/xentral-orders-utils";

export function useXentralOrdersColumns(params: {
  xentralOrderWebBase: string | null;
  xentralSalesOrderWebPath: string;
  formatMoney: (amount: number | null, currency: string | null) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}): Array<ColumnDef<XentralOrderRow>> {
  const { xentralOrderWebBase, xentralSalesOrderWebPath, formatMoney, t } = params;
  return useMemo<Array<ColumnDef<XentralOrderRow>>>(
    () => [
      {
        accessorKey: "documentNumber",
        header: t("xentralOrders.documentNr"),
        meta: { align: "left" as const, valign: "bottom" as const },
        cell: ({ row }) => (
          <XentralBelegNumberLink
            documentNumber={row.original.documentNumber}
            salesOrderId={row.original.id}
            webBase={xentralOrderWebBase}
            webPath={xentralSalesOrderWebPath}
          />
        ),
      },
      {
        accessorKey: "internetNumber",
        header: t("xentralOrders.orderNr"),
        meta: { align: "left" as const, valign: "bottom" as const },
        cell: ({ row }) => (
          <MarketplaceOrderIdLink
            marketplace={row.original.marketplace}
            internetNumber={row.original.internetNumber}
          />
        ),
      },
      {
        accessorKey: "customer",
        header: t("xentralOrders.customer"),
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
        accessorKey: "orderDate",
        header: t("xentralOrders.date"),
        cell: ({ row }) => {
          const raw = row.original.orderDate ?? "";
          const ymd = raw.slice(0, 10);
          const label = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : raw.trim() || "—";
          return <span className="tabular-nums text-muted-foreground">{label}</span>;
        },
      },
      {
        accessorKey: "marketplace",
        header: t("xentralOrders.marketplace"),
        meta: { align: "center" as const, valign: "bottom" as const },
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
        id: "addressValidation",
        meta: { align: "center" as const },
        accessorFn: (row) => {
          const d = resolveAddressDisplay(row);
          return d === "invalid" ? 0 : d === "edited" ? 1 : 2;
        },
        header: () => (
          <span className="inline-block text-center">{t("xentralOrders.addressValidation")}</span>
        ),
        cell: ({ row }) => (
          <AddressValidationCell
            display={resolveAddressDisplay(row.original)}
            issues={row.original.addressValidationIssues ?? []}
          />
        ),
      },
      {
        accessorKey: "total",
        header: t("xentralOrders.sum"),
        meta: { align: "right" as const },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatMoney(row.original.total, row.original.currency)}</div>
        ),
      },
    ],
    [xentralOrderWebBase, xentralSalesOrderWebPath, t, formatMoney]
  );
}
