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
import { useState } from "react";
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
  className?: string;
  tableWrapClassName?: string;
  paginate?: boolean;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  className,
  tableWrapClassName,
  paginate = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

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

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-6",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-sm">
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
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                        className={cn(
                          "inline-flex items-center gap-1.5",
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
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
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
