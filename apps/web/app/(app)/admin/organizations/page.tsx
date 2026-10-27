"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, Plus, Search } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Field, Input, Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { ApiError, apiList, apiPost, errorMessage } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { AdminOrganizationRow } from "@/features/admin/types";
import { SUPPORTED_CURRENCIES } from "@tripweave/shared";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters"),
  slug: z.string().trim().max(48).optional(),
  organizationType: z.enum(["tour_operator", "hotel_management"]),
  country: z.string().trim().length(2, "Use a 2-letter country code").toUpperCase(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
  timezone: z.string().trim().min(1, "Required").max(64),
  ownerDisplayName: z.string().trim().min(1, "Required").max(120),
  ownerEmail: z.email("Use a valid email").max(254),
  ownerPassword: z.string().max(200).optional(),
});
type CreateValues = z.input<typeof createSchema>;

function CreateOrganizationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: { name: "", slug: "", organizationType: "tour_operator", country: "LK", defaultCurrency: "USD", timezone: "Asia/Colombo", ownerDisplayName: "", ownerEmail: "", ownerPassword: "" },
  });
  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      apiPost<AdminOrganizationRow>("/admin/organizations", {
        ...v,
        slug: v.slug?.trim() || undefined,
        ownerPassword: v.ownerPassword?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Organisation created");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-org-options"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      reset();
      onOpenChange(false);
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    if (v.ownerPassword && v.ownerPassword.length > 0 && v.ownerPassword.length < 10) {
      setFieldError("ownerPassword", { message: "Use at least 10 characters, or leave blank to email a reset link" });
      return;
    }
    try {
      await create.mutateAsync(createSchema.parse(v));
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof CreateValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create organisation" description="Creates the organisation, its trial subscription and an owner account. An existing user can be reused as the owner." wide>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation name" htmlFor="co-name" error={formState.errors.name?.message} required>
              <Input id="co-name" {...register("name")} />
            </Field>
            <Field label="Slug" htmlFor="co-slug" error={formState.errors.slug?.message} hint="Optional. Generated from the name when blank.">
              <Input id="co-slug" placeholder="acme-travel" {...register("slug")} />
            </Field>
            <Field label="Type" htmlFor="co-type" error={formState.errors.organizationType?.message} required>
              <Select id="co-type" {...register("organizationType")}>
                <option value="tour_operator">Tour operator</option>
                <option value="hotel_management">Hotel management</option>
              </Select>
            </Field>
            <Field label="Country" htmlFor="co-country" error={formState.errors.country?.message} required>
              <Input id="co-country" maxLength={2} {...register("country")} />
            </Field>
            <Field label="Currency" htmlFor="co-currency" error={formState.errors.defaultCurrency?.message}>
              <Select id="co-currency" {...register("defaultCurrency")}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Timezone" htmlFor="co-timezone" error={formState.errors.timezone?.message}>
              <Input id="co-timezone" placeholder="Asia/Colombo" {...register("timezone")} />
            </Field>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 text-sm font-semibold">Owner account</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner name" htmlFor="co-owner" error={formState.errors.ownerDisplayName?.message} required>
                <Input id="co-owner" {...register("ownerDisplayName")} />
              </Field>
              <Field label="Owner email" htmlFor="co-email" error={formState.errors.ownerEmail?.message} required>
                <Input id="co-email" type="email" {...register("ownerEmail")} />
              </Field>
              <Field label="Temporary password" htmlFor="co-pass" error={formState.errors.ownerPassword?.message} hint="Optional. If blank, the owner receives a password-reset email." className="sm:col-span-2">
                <Input id="co-pass" type="password" autoComplete="new-password" {...register("ownerPassword")} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create organisation</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const q = useDebounced(search.trim());
  React.useEffect(() => setPage(1), [q, status, type]);
  const list = useQuery({
    queryKey: ["admin-orgs", q, status, type, page],
    queryFn: () => apiList<AdminOrganizationRow>("/admin/organizations", { q, status, type, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const columns = React.useMemo<ColumnDef<AdminOrganizationRow, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Organisation",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.slug} · {row.original.country} · {row.original.defaultCurrency}</p>
          </div>
        ),
      },
      { accessorKey: "organizationType", header: "Type", cell: ({ row }) => titleCase(row.original.organizationType) },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "memberCount", header: "Members", cell: ({ row }) => <span className="tw-num">{row.original.memberCount}</span> },
      { accessorKey: "tripCount", header: "Trips", cell: ({ row }) => <span className="tw-num">{row.original.tripCount}</span> },
      { accessorKey: "quoteCount", header: "Quotes", cell: ({ row }) => <span className="tw-num">{row.original.quoteCount}</span> },
      { accessorKey: "subscriptionPlan", header: "Plan", cell: ({ row }) => (row.original.subscriptionPlan ? <Badge tone={row.original.subscriptionStatus === "active" ? "success" : "warning"}>{titleCase(row.original.subscriptionPlan)}</Badge> : <span className="text-muted-foreground">—</span>) },
      { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="tw-num text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Organisations"
        eyebrow="Platform administration"
        description="Every tenant on the platform. Open an organisation to manage its profile, subscription, team, support access and data."
        icon={Building2}
        image={IMAGES.features}
        actions={<Button variant="accent" onClick={() => setCreateOpen(true)}><Plus /> New organisation</Button>}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </Select>
          <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-48">
            <option value="">All types</option>
            <option value="tour_operator">Tour operators</option>
            <option value="hotel_management">Hotel management</option>
          </Select>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search organisations" placeholder="Search name or slug…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-8" />
        </div>
      </div>
      {list.isLoading ? (
        <LoadingBlock label="Loading organisations" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          data={list.data?.items ?? []}
          columns={columns}
          caption="Organisations"
          meta={list.data?.meta}
          onPageChange={setPage}
          onRowClick={(o) => router.push(`/admin/organizations/${o.id}`)}
          empty={<EmptyState icon={Building2} title={q || status || type ? "No organisations match these filters" : "No organisations yet"} description={q || status || type ? "Try different search terms or filters." : "Create one here, or wait for a self-service registration."} action={!q && !status && !type ? <Button variant="accent" onClick={() => setCreateOpen(true)}><Plus /> New organisation</Button> : null} />}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Select a row to open the organisation. Every view and change is recorded in the audit log.</p>
      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
