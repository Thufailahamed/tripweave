"use client";
import * as React from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListMeta } from "@/lib/api";
import { Button } from "./button";
import { EmptyState } from "./card";

/**
 * Thin TanStack Table wrapper. Sorting here is client-side over the current page; filtering and
 * pagination are server-driven (pass `meta` + `onPageChange`).
 */
export function DataTable<T>({ data, columns, empty, onRowClick, meta, onPageChange, caption, dense }: {
  data: T[];
  columns: ColumnDef<T, any>[];
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  meta?: ListMeta;
  onPageChange?: (page: number) => void;
  caption?: string;
  dense?: boolean;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({ data, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  if (data.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className="tw-surface overflow-hidden rounded-2xl border border-border shadow-[0_18px_50px_-34px_rgba(40,32,20,0.28)]">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="border-b border-border bg-muted/35">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"} className="whitespace-nowrap px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {h.isPlaceholder ? null : sortable ? (
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, ri) => (
              <tr
                key={row.id}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === "Enter" ? onRowClick(row.original) : undefined) : undefined}
                style={{ "--i": Math.min(ri, 12) } as React.CSSProperties}
                className={cn("tw-row-in border-t border-border transition-colors first:border-t-0 hover:bg-accent/[0.035]", onRowClick && "cursor-pointer hover:bg-accent/[0.045] hover:shadow-[inset_2px_0_0_var(--accent)] focus-visible:bg-accent/[0.045] focus-visible:shadow-[inset_2px_0_0_var(--accent)]")}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn("px-5 align-middle", dense ? "py-2.5" : "py-4")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && meta.pages > 1 && onPageChange ? <Pagination meta={meta} onPageChange={onPageChange} /> : null}
    </div>
  );
}

export function Pagination({ meta, onPageChange }: { meta: ListMeta; onPageChange: (p: number) => void }) {
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
      <span className="tw-num">
        {from}–{to} of {meta.total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tw-num px-2">
          Page {meta.page} / {meta.pages}
        </span>
        <Button size="sm" variant="outline" disabled={meta.page >= meta.pages} onClick={() => onPageChange(meta.page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
