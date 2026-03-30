"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_COMPACT_TABLE_SCROLL,
  DASHBOARD_COMPACT_TABLE_TEXT,
} from "@/shared/lib/dashboardUi";

type DataTableProps<TData, TValue> = {
  columns: Array<ColumnDef<TData, TValue>>;
  data: TData[];
  filterColumn?: string;
  /** Zwischen Suchfeld und rechtem Toolbar-Block (z. B. Aktionsbutton). */
  toolbarBetween?: ReactNode;
  /** Zusatz rechts (z. B. Datumsfilter); mit `toolbarBetween` bleibt am rechten Rand. */
  toolbarEnd?: ReactNode;
  className?: string;
  tableWrapClassName?: string;
  /** Engere Zellen, kleinere Schrift, weniger Außenabstand (z. B. breite Kennzahltabellen). */
  compact?: boolean;
  /** Zusatzklassen auf dem inneren `<table>` (z. B. `w-max max-w-full`). */
  tableClassName?: string;
  /** Zusätzliche Klassen auf dem Suchfeld (z. B. einheitliche `text-sm`). */
  filterInputClassName?: string;
  paginate?: boolean;
  /** Standard-Zeilenzahl pro Seite (nur wenn `paginate`). */
  defaultPageSize?: number;
  onDisplayedRowsChange?: (rows: TData[]) => void;
  /**
   * Zeilenstil u. a. für Beschaffung: `data` = aktuell gefilterte/sichtbare Zeilen in Reihenfolge.
   */
  getRowClassName?: (
    row: Row<TData>,
    context: { index: number; data: TData[] }
  ) => string | undefined;
  /** Stabile Zeilen-IDs (z. B. SKU), damit Zellen bei externem State korrekt aktualisieren. */
  getRowId?: (originalRow: TData, index: number) => string;
};

type ColumnMeta = {
  align?: "left" | "center" | "right";
  /** Tabellenzelle vertikal (z. B. unten bei unterschiedlichen Zeilenhöhen). */
  valign?: "top" | "middle" | "bottom";
  thClassName?: string;
  tdClassName?: string;
  /** Zusatz auf dem Sort-Button im Kopf (z. B. `min-w-0` für Truncate). */
  headerButtonClassName?: string;
  /** Zusatz auf dem `<span>` um den Header-Inhalt (Truncate in schmalen Spalten). */
  headerLabelClassName?: string;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  toolbarBetween,
  toolbarEnd,
  className,
  tableWrapClassName,
  compact = false,
  tableClassName,
  filterInputClassName,
  paginate = true,
  defaultPageSize = 10,
  onDisplayedRowsChange,
  getRowClassName,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const lastSignatureRef = useRef<string>("");

  // TanStack Table ist bewusst zustandsbehaftet und hier die gewuenschte Runtime-API.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    ...(getRowId ? { getRowId } : {}),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    initialState: {
      pagination: { pageSize: defaultPageSize, pageIndex: 0 },
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const rows = paginate ? table.getRowModel().rows : table.getPrePaginationRowModel().rows;
  const visibleRowData = rows.map((r) => r.original);

  useEffect(() => {
    if (!onDisplayedRowsChange) return;
    const signature = rows.map((row) => row.id).join("|");
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    onDisplayedRowsChange(rows.map((row) => row.original));
  }, [onDisplayedRowsChange, rows]);

  const rootLayoutClass = compact
    ? DASHBOARD_COMPACT_CARD
    : "flex flex-col gap-4 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-6";

  const toolbarRowClass = compact
    ? "flex w-full flex-wrap items-center gap-2"
    : "flex w-full flex-wrap items-center gap-3";

  const searchWrapClass = compact
    ? "relative min-w-0 max-w-[min(100%,220px)] shrink-0 flex-none sm:flex-initial"
    : "relative min-w-0 max-w-sm flex-1";

  const searchInputClass = compact ? "h-8 pl-8 text-xs" : "pl-8";

  const tableScrollClass = compact
    ? DASHBOARD_COMPACT_TABLE_SCROLL
    : "min-h-[360px] flex-1 overflow-auto rounded-lg border border-border/50";

  const tableTextClass = compact ? DASHBOARD_COMPACT_TABLE_TEXT : "text-sm";

  return (
    <div className={cn(rootLayoutClass, className)}>
      <div className={toolbarRowClass}>
        <div className={searchWrapClass}>
          <Search className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className={cn(searchInputClass, filterInputClassName)}
            placeholder={
              filterColumn
                ? t("dataTable.searchIn", { fields: filterColumn })
                : t("dataTable.searchAll")
            }
          />
        </div>
        {toolbarBetween ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{toolbarBetween}</div>
        ) : null}
        {toolbarEnd ? (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {toolbarEnd}
          </div>
        ) : null}
      </div>

      <div className={cn(tableScrollClass, tableWrapClassName)}>
        <Table className={cn(tableTextClass, tableClassName)}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                  return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      meta?.align === "left"
                        ? "text-left"
                        : meta?.align === "center"
                          ? "text-center"
                          : meta?.align === "right"
                            ? "text-right"
                            : undefined,
                      meta?.valign === "bottom" ? "align-bottom" : undefined,
                      meta?.thClassName
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          meta?.align === "left"
                            ? "flex w-full min-w-0 max-w-full items-center justify-start"
                            : null,
                          meta?.align === "center"
                            ? "flex w-full min-w-0 max-w-full items-center justify-center"
                            : null,
                          meta?.align === "right"
                            ? "flex w-full min-w-0 max-w-full items-center justify-end"
                            : null,
                          header.column.getCanSort()
                            ? "cursor-pointer select-none hover:text-foreground"
                            : "cursor-default",
                          meta?.headerButtonClassName
                        )}
                        title={
                          header.column.getCanSort()
                            ? t("dataTable.sort")
                            : undefined
                        }
                      >
                        <span
                          className={cn(
                            meta?.align === "left" && "min-w-0 flex-1 overflow-hidden text-left",
                            meta?.align === "right" && "min-w-0 flex-1 overflow-hidden text-right",
                            meta?.headerLabelClassName
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                        {header.column.getCanSort() ? (
                          header.column.getIsSorted() === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : header.column.getIsSorted() === "desc" ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )
                        ) : null}
                      </button>
                    )}
                  </TableHead>
                );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  className={cn(getRowClassName?.(row, { index, data: visibleRowData }))}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                    return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        meta?.align === "left"
                          ? "text-left"
                          : meta?.align === "center"
                            ? "text-center"
                            : meta?.align === "right"
                              ? "text-right"
                              : undefined,
                        meta?.valign === "bottom" ? "align-bottom" : undefined,
                        meta?.tdClassName
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className={cn(
                    "h-24 text-center text-muted-foreground",
                    compact ? "text-xs" : "text-sm"
                  )}
                >
                  {t("dataTable.noRows")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {paginate ? (
        <div className="flex items-center justify-between">
          <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
            {t("dataTable.pageOf", {
              current: String(table.getState().pagination.pageIndex + 1),
              total: String(table.getPageCount() || 1),
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {t("dataTable.prev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t("dataTable.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
