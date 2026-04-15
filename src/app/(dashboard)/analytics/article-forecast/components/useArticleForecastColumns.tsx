"use client";

import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { sentenceCaseColumnLabel } from "@/shared/lib/sentenceCaseColumnLabel";
import { addDaysToYmd } from "@/shared/lib/xentralArticleForecastProject";
import type { ArticleForecastRules } from "@/shared/lib/articleForecastRules";
import {
  normalizeSkuKey,
  sumStockForVisibleLocations,
  type ArticleForecastRow,
  type ForecastResult,
} from "@/shared/lib/article-forecast-utils";

export function useArticleForecastColumns(params: {
  rows: ArticleForecastRow[];
  visibleProjectColumns: string[];
  visibleWarehouseColumns: string[];
  warehouseColumns: string[];
  forecastBySku: Map<string, ForecastResult>;
  activeRules: ArticleForecastRules;
  toYmd: string;
  qtyFmt: Intl.NumberFormat;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatQty: (n: number | undefined) => ReactNode;
  formatTotalSold: (n: number) => ReactNode;
  formatStock: (n: number) => ReactNode;
}): Array<ColumnDef<ArticleForecastRow>> {
  const {
    rows,
    visibleProjectColumns,
    visibleWarehouseColumns,
    warehouseColumns,
    forecastBySku,
    activeRules,
    toYmd,
    qtyFmt,
    t,
    formatQty,
    formatTotalSold,
    formatStock,
  } = params;

  return useMemo<Array<ColumnDef<ArticleForecastRow>>>(() => {
    /** Kompakte Schrift (DataTable compact); schmale Kennzahlspalten, umbrechende Köpfe. */
    const qtyThClass =
      "w-[4.75rem] min-w-[4.75rem] max-w-[5.25rem] px-1 !whitespace-normal align-top py-1.5 leading-tight";
    const qtyTdClass = "w-[4.75rem] min-w-[4.75rem] max-w-[5.25rem] px-1 py-1.5";
    const totalThClass =
      "w-[7.5rem] min-w-[7.5rem] max-w-[8.5rem] px-1.5 !whitespace-normal align-top py-1.5 leading-tight";
    const totalTdClass = "w-[7.5rem] min-w-[7.5rem] max-w-[8.5rem] whitespace-nowrap px-1.5 py-1.5";

    /** Mehrzeilige Kopfzeilen: Sortier-Icon oben bündig, nicht vertikal zentriert. */
    const headerBtnWrap = "items-start gap-1";

    const base: Array<ColumnDef<ArticleForecastRow>> = [
      {
        accessorKey: "sku",
        meta: {
          thClassName: "w-[5.25rem] min-w-[5.25rem] max-w-[6rem] px-1.5 align-top py-1.5",
          tdClassName: "w-[5.25rem] min-w-[5.25rem] max-w-[6rem] px-1.5 py-1.5",
          headerButtonClassName: headerBtnWrap,
        },
        header: "SKU",
        cell: ({ row }) => (
          <span className="block truncate font-medium" title={row.original.sku || undefined}>
            {row.original.sku || "—"}
          </span>
        ),
      },
      {
        accessorKey: "name",
        meta: {
          thClassName: "min-w-0 w-[9rem] max-w-[12rem] px-1.5 align-top py-1.5",
          tdClassName: "min-w-0 w-[9rem] max-w-[12rem] px-1.5 py-1.5",
          headerButtonClassName: headerBtnWrap,
        },
        header: t("articleForecast.articleName"),
        cell: ({ row }) => {
          const raw = row.original.name ?? "";
          return (
            <span className="block min-w-0 truncate text-muted-foreground" title={raw || undefined}>
              {raw.trim() || "—"}
            </span>
          );
        },
      },
    ];

    const projectCols: Array<ColumnDef<ArticleForecastRow>> = visibleProjectColumns.map((proj) => {
      const label = sentenceCaseColumnLabel(proj);
      return {
        id: `project:${proj}`,
        meta: {
          align: "right" as const,
          thClassName: qtyThClass,
          tdClassName: qtyTdClass,
          headerButtonClassName: headerBtnWrap,
        },
        header: () => (
          <div
            className="block w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case"
            title={label}
          >
            {label}
          </div>
        ),
        accessorFn: (row) => row.soldByProject[proj] ?? 0,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatQty(row.original.soldByProject[proj])}</div>
        ),
      };
    });

    const hasOtherSales = rows.some((row) => {
      const namedSum = visibleProjectColumns.reduce((acc, p) => acc + (row.soldByProject[p] ?? 0), 0);
      return row.totalSold - namedSum > 0;
    });

    const otherSalesCol: ColumnDef<ArticleForecastRow> | null = hasOtherSales
      ? {
          id: "project:__other__",
          meta: {
            align: "right" as const,
            thClassName: qtyThClass,
            tdClassName: qtyTdClass,
            headerButtonClassName: headerBtnWrap,
          },
          header: () => (
            <div className="block w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
              {sentenceCaseColumnLabel(t("articleForecast.otherSales"))}
            </div>
          ),
          accessorFn: (row) => {
            const namedSum = visibleProjectColumns.reduce(
              (acc, p) => acc + (row.soldByProject[p] ?? 0),
              0
            );
            const other = row.totalSold - namedSum;
            return other > 0 ? other : 0;
          },
          cell: ({ row }) => {
            const namedSum = visibleProjectColumns.reduce(
              (acc, p) => acc + (row.original.soldByProject[p] ?? 0),
              0
            );
            const other = row.original.totalSold - namedSum;
            return (
              <div className="text-right tabular-nums">{formatQty(other > 0 ? other : undefined)}</div>
            );
          },
        }
      : null;

    const totalCol: ColumnDef<ArticleForecastRow> = {
      id: "totalSold",
      meta: {
        align: "right" as const,
        thClassName: totalThClass,
        tdClassName: totalTdClass,
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(t("articleForecast.totalSold"))}
        </div>
      ),
      accessorFn: (row) => (Number.isFinite(row.totalSold) ? row.totalSold : 0),
      cell: ({ row }) => (
        <div className="text-right font-medium text-foreground">
          {formatTotalSold(Number.isFinite(row.original.totalSold) ? row.original.totalSold : 0)}
        </div>
      ),
    };

    const totalStockCol: ColumnDef<ArticleForecastRow> = {
      id: "totalStockVisible",
      meta: {
        align: "right" as const,
        thClassName: totalThClass,
        tdClassName: totalTdClass,
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(t("articleForecast.totalStock"))}
        </div>
      ),
      accessorFn: (row) => sumStockForVisibleLocations(row, visibleWarehouseColumns, warehouseColumns),
      cell: ({ row }) => (
        <div className="text-right font-medium text-foreground">
          {formatStock(sumStockForVisibleLocations(row.original, visibleWarehouseColumns, warehouseColumns))}
        </div>
      ),
    };

    const dailySoldCol: ColumnDef<ArticleForecastRow> = {
      id: "dailySold",
      meta: {
        align: "right" as const,
        thClassName: totalThClass,
        tdClassName: totalTdClass,
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(t("articleForecast.dailySold"))}
        </div>
      ),
      accessorFn: (row) => forecastBySku.get(normalizeSkuKey(row.sku))?.dailySold ?? 0,
      cell: ({ row }) => (
        <div className="text-right tabular-nums text-muted-foreground">
          {formatQty(forecastBySku.get(normalizeSkuKey(row.original.sku))?.dailySold)}
        </div>
      ),
    };

    const projectedStockCol: ColumnDef<ArticleForecastRow> = {
      id: "projectedStock",
      meta: {
        align: "right" as const,
        thClassName:
          "w-[10.5rem] min-w-[10.5rem] max-w-[12rem] px-1.5 !whitespace-normal align-top py-1.5 leading-tight",
        tdClassName: "w-[10.5rem] min-w-[10.5rem] max-w-[12rem] whitespace-nowrap px-1.5 py-1.5",
        headerButtonClassName: headerBtnWrap,
      },
      header: () => (
        <div className="w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case">
          {sentenceCaseColumnLabel(
            t("articleForecast.projectedUntil", {
              date: addDaysToYmd(toYmd, activeRules.projectionDays),
            })
          )}
        </div>
      ),
      accessorFn: (row) => forecastBySku.get(normalizeSkuKey(row.sku))?.projectedStockAtHorizon ?? 0,
      cell: ({ row }) => {
        const forecast = forecastBySku.get(normalizeSkuKey(row.original.sku));
        if (!forecast) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col items-end gap-0.5 leading-tight">
            <span
              className={cn(
                "tabular-nums font-medium",
                forecast.status === "critical" && "text-red-600 dark:text-red-400",
                forecast.status === "low" && "text-orange-600 dark:text-orange-400"
              )}
            >
              {qtyFmt.format(Math.round(forecast.projectedStockAtHorizon))}
            </span>
            {forecast.inboundUntilHorizon > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                +{qtyFmt.format(Math.round(forecast.inboundUntilHorizon))}{" "}
                {t("articleForecast.inboundShort")}
              </span>
            ) : null}
          </div>
        );
      },
    };

    const warehouseCols: Array<ColumnDef<ArticleForecastRow>> = visibleWarehouseColumns.map((loc) => {
      const label = sentenceCaseColumnLabel(loc);
      return {
        id: `warehouse:${loc}`,
        meta: {
          align: "right" as const,
          thClassName: qtyThClass,
          tdClassName: qtyTdClass,
          headerButtonClassName: headerBtnWrap,
        },
        header: () => (
          <div
            className="block w-full min-w-0 whitespace-normal break-words text-right font-medium leading-snug normal-case"
            title={label}
          >
            {label}
          </div>
        ),
        accessorFn: (row) => row.stockByLocation?.[loc] ?? 0,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {formatStock(row.original.stockByLocation?.[loc] ?? 0)}
          </div>
        ),
      };
    });

    return [
      ...base,
      ...projectCols,
      ...(otherSalesCol ? [otherSalesCol] : []),
      totalCol,
      totalStockCol,
      dailySoldCol,
      projectedStockCol,
      ...warehouseCols,
    ];
  }, [
    activeRules.projectionDays,
    forecastBySku,
    qtyFmt,
    toYmd,
    rows,
    visibleProjectColumns,
    visibleWarehouseColumns,
    warehouseColumns,
    t,
    formatQty,
    formatTotalSold,
    formatStock,
  ]);
}
