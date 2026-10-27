"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, EmptyState } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { relativeTime } from "@/lib/utils";

export interface ProviderHealth {
  providerKey: string;
  calls: number;
  errors: number;
  avgLatencyMs: number;
  lastCallAt: string | null;
}

/** Same threshold the dashboard uses: 30% or more of calls failing. */
export const isUnhealthy = (h: ProviderHealth) => h.calls > 0 && h.errors / h.calls >= 0.3;

const LABELS: Record<string, string> = {
  internal: "Your hotel catalogue",
  hotelbeds: "Hotelbeds",
  amadeus: "Amadeus",
  google_hotels: "Google Hotels (Booking.com, Expedia…)",
  osm_discovery: "OpenStreetMap discovery",
  mock: "Mock supplier",
};

export function ProviderHealthTable({ rows, caption = "Provider health, last 7 days" }: { rows: ProviderHealth[]; caption?: string }) {
  const columns = React.useMemo<ColumnDef<ProviderHealth, any>[]>(
    () => [
      { accessorKey: "providerKey", header: "Provider", cell: ({ row }) => <span className="font-semibold">{LABELS[row.original.providerKey] ?? row.original.providerKey}</span> },
      { accessorKey: "calls", header: "Calls", cell: ({ row }) => <span className="tw-num">{row.original.calls}</span> },
      { accessorKey: "errors", header: "Errors", cell: ({ row }) => <span className="tw-num">{row.original.errors}</span> },
      { accessorKey: "avgLatencyMs", header: "Avg latency", cell: ({ row }) => <span className="tw-num">{row.original.avgLatencyMs} ms</span> },
      { accessorKey: "lastCallAt", header: "Last call", cell: ({ row }) => <span className="text-muted-foreground">{row.original.lastCallAt ? relativeTime(row.original.lastCallAt) : "—"}</span> },
      { id: "state", header: "Health", enableSorting: false, cell: ({ row }) => (isUnhealthy(row.original) ? <Badge tone="danger">Unhealthy</Badge> : <Badge tone="success">Healthy</Badge>) },
    ],
    [],
  );
  return <DataTable data={rows} columns={columns} dense caption={caption} empty={<EmptyState title="No provider calls in the last 7 days" description="External providers are only called when an optimisation or search uses them." />} />;
}
