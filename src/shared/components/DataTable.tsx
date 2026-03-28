"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
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
  paginate?: boolean;
  onDisplayedRowsChange?: (rows: TData[]) => void;
};

type ColumnMeta = {
  align?: "left" | "center" | "right";
  /** Tabellenzelle vertikal (z. B. unten bei unterschiedlichen Zeilenhöhen). */
  valign?: "top" | "middle" | "bottom";
};

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  toolbarBetween,
  toolbarEnd,
  className,
  tableWrapClassName,
  paginate = true,
  onDisplayedRowsChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const lastSignatureRef = useRef<string>("");

  // TanStack Table ist bewusst zustandsbehaftet und hier die gewuenschte Runtime-API.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const rows = paginate ? table.getRowModel().rows : table.getPrePaginationRowModel().rows;

  useEffect(() => {
    if (!onDisplayedRowsChange) return;
    const signature = rows.map((row) => row.id).join("|");
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    onDisplayedRowsChange(rows.map((row) => row.original));
  }, [onDisplayedRowsChange, rows]);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-6",
        className
      )}
    >
      <div className="flex w-full flex-wrap items-center gap-3">
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="pl-8"
            placeholder={
              filterColumn
                ? `Suche in ${filterColumn}...`
                : "Daten durchsuchen..."
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

      <div
        className={cn(
          "min-h-[360px] flex-1 overflow-auto rounded-lg border border-border/50",
          tableWrapClassName
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                  return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      meta?.align === "center"
                        ? "text-center"
                        : meta?.align === "right"
                          ? "text-right"
                          : undefined,
                      meta?.valign === "bottom" ? "align-bottom" : undefined
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          (header.column.columnDef.meta as ColumnMeta | undefined)?.align === "center"
                            ? "w-full justify-center"
                            : null,
                          (header.column.columnDef.meta as ColumnMeta | undefined)?.align === "right"
                            ? "w-full justify-end"
                            : null,
                          header.column.getCanSort()
                            ? "cursor-pointer select-none hover:text-foreground"
                            : "cursor-default"
                        )}
                        title={
                          header.column.getCanSort()
                            ? "Sortieren"
                            : undefined
                        }
                      >
                        <span>
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
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                    return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        meta?.align === "center"
                          ? "text-center"
                          : meta?.align === "right"
                            ? "text-right"
                            : undefined,
                        meta?.valign === "bottom" ? "align-bottom" : undefined
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
                  className="h-24 text-center text-muted-foreground"
                >
                  Keine Daten gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {paginate ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Seite {table.getState().pagination.pageIndex + 1} von {table.getPageCount() || 1}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Weiter
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
