"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Pagination } from "@/components/ui/data-table";
import { Input } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiDelete, apiList, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import { CustomerFormDialog } from "@/features/customers/customer-dialog";
import { customerKeys, type Customer } from "@/features/customers/types";
import { useDebouncedValue } from "@/features/trips/hooks";

/** Initials for the avatar tile: "Asha Perera" → "AP". */
const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function CustomerCard({ customer, index, canWrite, onEdit, onDelete }: { customer: Customer; index: number; canWrite: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card interactive className="tw-row-in relative flex flex-col gap-5 p-5" style={{ "--i": Math.min(index, 12) } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent-soft font-display text-sm font-semibold text-accent transition-transform duration-500 ease-out group-hover:-rotate-6 group-hover:scale-105" aria-hidden>
          {initialsOf(customer.name) || <Users className="size-5" />}
        </span>
        {canWrite ? (
          <div className="relative z-10 flex gap-0.5 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Button size="icon" variant="ghost" aria-label={`Edit ${customer.name}`} onClick={onEdit}>
              <Pencil />
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Delete ${customer.name}`} onClick={onDelete}>
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <Link href={`/customers/${customer.id}`} className="block truncate font-display text-lg font-semibold tracking-[-0.04em] after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
          {customer.name}
        </Link>
        <p className="tw-num mt-0.5 truncate text-xs text-muted-foreground">
          {customer.country || "No country"} · updated {formatDate(customer.updatedAt)}
        </p>
      </div>

      <ul className="mt-auto flex flex-col gap-2 text-sm text-foreground/75">
        <li className="flex items-center gap-2.5 truncate">
          <Mail className="size-3.5 shrink-0 text-accent" aria-hidden />
          <span className="truncate">{customer.email ?? "No email"}</span>
        </li>
        <li className="flex items-center gap-2.5 truncate">
          <Phone className="size-3.5 shrink-0 text-accent" aria-hidden />
          <span className="truncate">{customer.phone || "No phone"}</span>
        </li>
      </ul>
    </Card>
  );
}

export default function CustomersPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Customer | null>(null);
  const q = useDebouncedValue(search.trim());
  React.useEffect(() => setPage(1), [q]);

  const params = { q: q || undefined, page, pageSize: 20 };
  const list = useQuery({ queryKey: customerKeys.list(params), queryFn: () => apiList<Customer>("/customers", params), placeholderData: (prev) => prev });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all });
      toast.success("Customer deleted");
      setDeleting(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(null);
    },
  });

  const canWrite = can("customers:write");
  const newAction = canWrite ? (
    <Button onClick={() => setCreating(true)}>
      <Plus /> New customer
    </Button>
  ) : null;

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Customers" description="The clients you plan trips and send quotations to." actions={newAction} icon={Users} image={IMAGES.operators} />

      <div className="tw-surface relative mb-6 max-w-md rounded-xl border border-border">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search customers" placeholder="Search by name or email" className="h-11 border-0 bg-transparent pl-10 shadow-none focus-visible:ring-0" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list.isLoading ? (
        <LoadingBlock label="Loading customers" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} title="Could not load customers" />
      ) : items.length === 0 ? (
        q ? (
          <EmptyState icon={Users} title="No customers match your search" description="Try a different name or email." action={<Button variant="outline" onClick={() => setSearch("")}>Clear search</Button>} />
        ) : (
          <EmptyState icon={Users} image={IMAGES.operators} title="No customers yet" description="Add a customer, then start a trip request for them." action={newAction ?? undefined} />
        )
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c, i) => (
              <li key={c.id}>
                <CustomerCard customer={c} index={i} canWrite={canWrite} onEdit={() => setEditing(c)} onDelete={() => setDeleting(c)} />
              </li>
            ))}
          </ul>
          {list.data?.meta && list.data.meta.pages > 1 ? (
            <div className="tw-surface mt-6 overflow-hidden rounded-xl border border-border">
              <Pagination meta={list.data.meta} onPageChange={setPage} />
            </div>
          ) : null}
        </>
      )}
      <CustomerFormDialog open={creating} onOpenChange={setCreating} />
      <CustomerFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} customer={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete customer?"
        description={`${deleting?.name ?? "This customer"} will be removed. Trip requests linked to them are kept but will no longer show a customer.`}
        confirmLabel="Delete customer"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
