"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MapPin, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, IconTile, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { IMAGES } from "@/features/marketing/imagery";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ApiError, apiDelete, apiGet, apiList, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { dateRange, formatDate, money } from "@/lib/utils";
import { CustomerFormDialog } from "@/features/customers/customer-dialog";
import { customerKeys, type Customer } from "@/features/customers/types";
import type { Trip } from "@/features/trips/types";

function Detail({ icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="group flex items-center gap-3 text-sm">
      <IconTile icon={icon} tone="primary" size="sm" />
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const customer = useQuery({ queryKey: customerKeys.detail(id), queryFn: () => apiGet<Customer>(`/customers/${id}`) });
  const tripsQ = useQuery({
    queryKey: ["trips", "list", { customerId: id, page }],
    queryFn: () => apiList<Trip>("/trips", { customerId: id, page, pageSize: 10, sort: "updated" }),
    enabled: can("trips:read"),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all });
      toast.success("Customer deleted");
      router.replace("/customers");
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(false);
    },
  });

  const columns = React.useMemo<ColumnDef<Trip>[]>(
    () => [
      { header: "Trip", accessorKey: "title", enableSorting: false, cell: ({ row }) => <Link href={`/trips/${row.original.id}`} className="font-semibold text-primary hover:underline">{row.original.title}</Link> },
      { header: "Dates", enableSorting: false, cell: ({ row }) => <span className="tw-num">{dateRange(row.original.arrivalDate, row.original.departureDate)}</span> },
      { header: "Budget", enableSorting: false, cell: ({ row }) => <span className="tw-num">{row.original.budgetAmountMinor === null ? "—" : money(row.original.budgetAmountMinor, row.original.budgetCurrency)}</span> },
      { header: "Status", enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    [],
  );

  if (customer.isLoading) return <LoadingBlock label="Loading customer" />;
  if (customer.isError) {
    const notFound = customer.error instanceof ApiError && customer.error.status === 404;
    return notFound ? (
      <EmptyState title="Customer not found" description="It may have been deleted." action={<Button asChild variant="outline"><Link href="/customers">Back to customers</Link></Button>} />
    ) : (
      <ErrorState error={customer.error} onRetry={() => customer.refetch()} title="Could not load customer" />
    );
  }
  const c = customer.data!;
  const canWrite = can("customers:write");

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/customers" className="hover:underline">Customers</Link>}
        title={c.name}
        icon={Users}
        image={IMAGES.auth}
        description={`Customer since ${formatDate(c.createdAt)}`}
        actions={
          <>
            {can("trips:write") ? (
              <Button asChild>
                <Link href={`/trips/new?customerId=${c.id}`}>
                  <Plus /> New trip request
                </Link>
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
                <Button variant="outline" onClick={() => setDeleting(true)}>
                  <Trash2 className="text-destructive" /> Delete
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              <Detail icon={Mail}>{c.email ? <a className="text-primary hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-muted-foreground">No email</span>}</Detail>
              <Detail icon={Phone}>{c.phone || <span className="text-muted-foreground">No phone</span>}</Detail>
              <Detail icon={MapPin}>{c.country || <span className="text-muted-foreground">No country</span>}{c.preferredLanguage ? ` · language ${c.preferredLanguage}` : ""}</Detail>
            </ul>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.notes || <span className="text-muted-foreground">No notes</span>}</p>
            </div>
          </CardContent>
        </Card>
        <section className="lg:col-span-2" aria-labelledby="cust-trips">
          <h2 id="cust-trips" className="mb-3 font-display text-lg font-semibold">Trip requests</h2>
          {!can("trips:read") ? (
            <EmptyState title="Trips are not visible to your role" />
          ) : tripsQ.isLoading ? (
            <LoadingBlock label="Loading trips" rows={3} />
          ) : tripsQ.isError ? (
            <ErrorState error={tripsQ.error} onRetry={() => tripsQ.refetch()} title="Could not load trips" />
          ) : (
            <DataTable
              data={tripsQ.data!.items}
              columns={columns}
              caption={`Trips for ${c.name}`}
              meta={tripsQ.data!.meta}
              onPageChange={setPage}
              empty={<EmptyState title="No trips for this customer" description="Create a trip request to start planning." action={can("trips:write") ? <Button asChild><Link href={`/trips/new?customerId=${c.id}`}><Plus /> New trip request</Link></Button> : undefined} />}
            />
          )}
        </section>
      </div>
      <CustomerFormDialog open={editing} onOpenChange={setEditing} customer={c} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete customer?" description={`${c.name} will be removed. Their trip requests and quotations are kept but will no longer show a customer.`} confirmLabel="Delete customer" destructive loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
