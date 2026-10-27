"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search, ShieldCheck, Users } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ROLES } from "@tripweave/shared";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { ApiError, apiList, apiPost, errorMessage } from "@/lib/api";
import { formatDate, relativeTime, titleCase } from "@/lib/utils";
import { IMAGES } from "@/features/marketing/imagery";
import type { AdminUserRow } from "@/features/admin/types";
import { useOrganizationOptions } from "@/features/admin/ui";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const createSchema = z
  .object({
    email: z.email("Use a valid email").max(254),
    displayName: z.string().trim().min(1, "Required").max(120),
    password: z.string().max(200).optional(),
    platformAdmin: z.boolean(),
    organizationId: z.string().max(80).optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((v) => !v.organizationId || !!v.role, { message: "Choose a role when adding to an organisation", path: ["role"] });
type CreateValues = z.input<typeof createSchema>;

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const orgs = useOrganizationOptions();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<CreateValues>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: { email: "", displayName: "", password: "", platformAdmin: false, organizationId: "", role: "staff" },
  });
  const create = useMutation({
    mutationFn: (v: CreateValues) =>
      apiPost("/admin/users", {
        email: v.email,
        displayName: v.displayName,
        password: v.password?.trim() || undefined,
        platformRole: v.platformAdmin ? "platform_admin" : undefined,
        organizationId: v.organizationId || undefined,
        role: v.organizationId ? v.role : undefined,
      }),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      reset();
      onOpenChange(false);
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    if (v.password && v.password.length > 0 && v.password.length < 10) {
      setFieldError("password", { message: "Use at least 10 characters, or leave blank to email a reset link" });
      return;
    }
    try {
      await create.mutateAsync(v);
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof CreateValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create user" description="Create an account, optionally grant platform-admin access, and optionally add the user to an organisation." wide>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="cu-name" error={formState.errors.displayName?.message} required><Input id="cu-name" {...register("displayName")} /></Field>
            <Field label="Email" htmlFor="cu-email" error={formState.errors.email?.message} required><Input id="cu-email" type="email" {...register("email")} /></Field>
            <Field label="Temporary password" htmlFor="cu-pass" error={formState.errors.password?.message} hint="Optional. Blank sends a password-reset email." className="sm:col-span-2"><Input id="cu-pass" type="password" autoComplete="new-password" {...register("password")} /></Field>
          </div>
          <div className="rounded-lg border border-border p-4">
            <Checkbox id="cu-admin" label="Grant platform administrator access" {...register("platformAdmin")} />
            <p className="mt-1 text-xs text-muted-foreground">Platform admins can see and manage every organisation and user. Grant this sparingly.</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 text-sm font-semibold">Add to an organisation (optional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation" htmlFor="cu-org" error={formState.errors.organizationId?.message}>
                <Select id="cu-org" {...register("organizationId")}>
                  <option value="">No organisation</option>
                  {orgs.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
              <Field label="Role" htmlFor="cu-role" error={formState.errors.role?.message}>
                <Select id="cu-role" {...register("role")}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select>
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={create.isPending}><Plus /> Create user</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialOrg = searchParams.get("organizationId") ?? "";
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [platformAdminOnly, setPlatformAdminOnly] = React.useState(false);
  const [organizationId, setOrganizationId] = React.useState(initialOrg);
  const [page, setPage] = React.useState(1);
  const [createOpen, setCreateOpen] = React.useState(false);
  const q = useDebounced(search.trim());
  const orgs = useOrganizationOptions();
  React.useEffect(() => setPage(1), [q, status, platformAdminOnly, organizationId]);
  const list = useQuery({
    queryKey: ["admin-users", q, status, platformAdminOnly, organizationId, page],
    queryFn: () => apiList<AdminUserRow>("/admin/users", { q, status, platformAdmin: platformAdminOnly ? "true" : undefined, organizationId: organizationId || undefined, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });
  const columns = React.useMemo<ColumnDef<AdminUserRow, any>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "User",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-semibold">{row.original.displayName}{row.original.platformRole ? <Badge tone="accent">Platform admin</Badge> : null}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "organizations", header: "Organisations", cell: ({ row }) => <span className="line-clamp-2 max-w-[16rem] text-xs text-muted-foreground">{row.original.organizations ?? "—"}</span> },
      { accessorKey: "membershipCount", header: "Memberships", cell: ({ row }) => <span className="tw-num">{row.original.membershipCount}</span> },
      { accessorKey: "mfaEnabled", header: "MFA", cell: ({ row }) => (row.original.mfaEnabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>) },
      { accessorKey: "lastSeenAt", header: "Last seen", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.lastSeenAt ? relativeTime(row.original.lastSeenAt) : "Never"}</span> },
      { accessorKey: "createdAt", header: "Created", cell: ({ row }) => <span className="tw-num text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Users"
        eyebrow="Platform administration"
        description="Every account across the platform. Search, inspect memberships and sessions, reset access, or grant and revoke platform-admin rights."
        icon={Users}
        image={IMAGES.features}
        actions={<Button variant="accent" onClick={() => setCreateOpen(true)}><Plus /> New user</Button>}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="invited">Invited</option>
          </Select>
          <Select aria-label="Filter by organisation" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-56">
            <option value="">All organisations</option>
            {orgs.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={platformAdminOnly} onChange={(e) => setPlatformAdminOnly(e.target.checked)} />
            Platform admins only
          </label>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search users" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-8" />
        </div>
      </div>
      {list.isLoading ? (
        <LoadingBlock label="Loading users" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          data={list.data?.items ?? []}
          columns={columns}
          caption="Platform users"
          meta={list.data?.meta}
          onPageChange={setPage}
          onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
          empty={<EmptyState icon={Users} title={q || status || platformAdminOnly || organizationId ? "No users match these filters" : "No users yet"} description="Users appear here when they register or are created by an organisation." action={!q && !status && !platformAdminOnly && !organizationId ? <Button variant="accent" onClick={() => setCreateOpen(true)}><Plus /> New user</Button> : null} />}
        />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Select a row to inspect the account. Password hashes and secrets are never exposed. <Link className="underline underline-offset-2" href="/admin/support">Active support grants</Link> govern tenant-data reads.</p>
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <React.Suspense fallback={<LoadingBlock rows={4} label="Loading users" />}>
      <UsersPage />
    </React.Suspense>
  );
}
