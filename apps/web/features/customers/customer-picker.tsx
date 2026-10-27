"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { apiGet, apiList } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useDebouncedValue } from "@/features/trips/hooks";
import { CustomerFormDialog } from "./customer-dialog";
import { customerKeys, type Customer } from "./types";

/** Searchable customer select with quick-create. `value` is a customer id or "" for none. */
export function CustomerPicker({ id, value, onChange }: { id?: string; value: string; onChange: (id: string) => void }) {
  const can = useCan();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const debounced = useDebouncedValue(search.trim());
  const list = useQuery({ queryKey: customerKeys.list({ picker: debounced }), queryFn: () => apiList<Customer>("/customers", { q: debounced || undefined, pageSize: 50 }), enabled: can("customers:read") });
  const selected = useQuery({ queryKey: customerKeys.detail(value || "none"), queryFn: () => apiGet<Customer>(`/customers/${value}`), enabled: !!value && can("customers:read") });
  const items = list.data?.items ?? [];
  const options = selected.data && !items.some((c) => c.id === selected.data!.id) ? [selected.data, ...items] : items;

  if (!can("customers:read")) return <p className="text-sm text-muted-foreground">Your role cannot browse customers.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Search customers" placeholder="Search customers by name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1" />
        {can("customers:write") ? (
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus /> New customer
          </Button>
        ) : null}
      </div>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Customer">
        <option value="">No customer yet</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.email ? ` (${c.email})` : ""}
          </option>
        ))}
      </Select>
      {list.isError ? <p className="text-xs text-destructive">Could not load customers.</p> : null}
      {list.data && list.data.meta.total > options.length ? <p className="text-xs text-muted-foreground">Showing {options.length} of {list.data.meta.total}; refine the search to find others.</p> : null}
      <CustomerFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => {
          setSearch("");
          onChange(c.id);
        }}
      />
    </div>
  );
}
