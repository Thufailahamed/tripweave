"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, MoreHorizontal, Minus, UserPlus, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { inviteMemberSchema, PERMISSIONS, permissionsForRole, ROLES, type Role } from "@tripweave/shared";
import type { ColumnDef } from "@tanstack/react-table";
import type { z } from "zod";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge, type BadgeTone } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { ConfirmDialog, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { DataTable } from "@/components/ui/data-table";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { formatDate, titleCase } from "@/lib/utils";
import { applyFieldErrors, NoAccess, ORG_KEY } from "@/features/settings/shared";

interface Member {
  id: string;
  userId: string;
  role: Role;
  status: string;
  email: string;
  displayName: string;
  createdAt: string;
}
const MEMBERS_KEY = ["org-members"] as const;

const ROLE_TONE: Record<Role, BadgeTone> = { owner: "accent", admin: "primary", manager: "info", staff: "neutral", read_only: "outline", hotel_portfolio_manager: "success" };
const ROLE_TEXT: Record<Role, string> = {
  owner: "Full control, including the subscription owner role. Cannot be changed or removed here.",
  admin: "Full access to every feature, settings and team. Only the owner can grant this role.",
  manager: "Runs the business day to day: pricing, approvals, margins and inventory, but not team or organisation settings.",
  staff: "Builds trips, runs optimisations, prepares and sends quotations. Cannot see internal margins.",
  read_only: "Can view customers, trips, hotels, quotations and reports.",
  hotel_portfolio_manager: "Manages hotel inventory, rates, agreements and partner sharing for a hotel management company.",
};
const assignable = ROLES.filter((r) => r !== "owner") as Exclude<Role, "owner">[];

const roleLabel = (r: string) => (r === "read_only" ? "Read only" : r === "hotel_portfolio_manager" ? "Hotel portfolio manager" : titleCase(r));

function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b, i) => (i === 0 ? letters : i === 1 ? digits : all)[b % (i === 0 ? letters.length : i === 1 ? digits.length : all.length)]);
  return chars.join("");
}

/* ---------- add member ---------- */
type InviteValues = z.input<typeof inviteMemberSchema>;

function AddMemberDialog({ open, onOpenChange, isOwner }: { open: boolean; onOpenChange: (o: boolean) => void; isOwner: boolean }) {
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [show, setShow] = React.useState(false);
  const { register, handleSubmit, reset, setValue, setError: setFieldError, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteMemberSchema) as never,
    defaultValues: { email: "", displayName: "", role: "staff", temporaryPassword: "" },
  });
  React.useEffect(() => {
    if (open) {
      reset({ email: "", displayName: "", role: "staff", temporaryPassword: "" });
      setError(null);
      setShow(false);
    }
  }, [open, reset]);

  const add = useMutation({
    mutationFn: (v: InviteValues) => apiPost("/organization/members", v),
    onSuccess: () => {
      toast.success("Member added. Share the temporary password with them securely.");
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      qc.invalidateQueries({ queryKey: ORG_KEY });
      onOpenChange(false);
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await add.mutateAsync(v);
    } catch (e) {
      setError(applyFieldErrors(e, setFieldError));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add team member" description="Creates a login for this person and adds them to your organisation.">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Work email" htmlFor="m-email" error={formState.errors.email?.message} required>
            <Input id="m-email" type="email" autoComplete="off" {...register("email")} />
          </Field>
          <Field label="Display name" htmlFor="m-name" error={formState.errors.displayName?.message} required>
            <Input id="m-name" autoComplete="off" {...register("displayName")} />
          </Field>
          <Field label="Role" htmlFor="m-role" error={formState.errors.role?.message} hint="You can change this later. See the role reference below.">
            <Select id="m-role" {...register("role")}>
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Temporary password" htmlFor="m-pass" error={formState.errors.temporaryPassword?.message} hint="At least 10 characters with letters and numbers." required>
            <div className="flex gap-2">
              <Input id="m-pass" type={show ? "text" : "password"} autoComplete="new-password" {...register("temporaryPassword")} />
              <Button type="button" variant="outline" size="icon" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
                {show ? <EyeOff /> : <Eye />}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValue("temporaryPassword", generatePassword(), { shouldValidate: true, shouldDirty: true });
                  setShow(true);
                }}
              >
                <Wand2 /> Generate
              </Button>
            </div>
          </Field>
          <Alert tone="info" title="Ask them to change this password">
            Give the temporary password to the person through a secure channel and ask them to change it under Settings → Account on first sign-in. If this email already has a TripWeave account, they are simply added to your organisation and keep their existing password.
            {!isOwner ? " Only the organisation owner should assign the Admin role." : ""}
          </Alert>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={add.isPending}>
              Add member
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- change role ---------- */
function ChangeRoleDialog({ member, onClose, isOwner }: { member: Member | null; onClose: () => void; isOwner: boolean }) {
  const qc = useQueryClient();
  const [role, setRole] = React.useState<Role>("staff");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (member) {
      setRole(member.role);
      setError(null);
    }
  }, [member]);
  const m = useMutation({
    mutationFn: () => apiPatch(`/organization/members/${member!.id}`, { role }),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Change role" description={member ? `${member.displayName} (${member.email})` : undefined}>
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Role" htmlFor="cr-role" hint={ROLE_TEXT[role]}>
            <Select id="cr-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {assignable.map((r) => (
                <option key={r} value={r} disabled={r === "admin" && !isOwner}>
                  {roleLabel(r)}
                  {r === "admin" && !isOwner ? " (owner only)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={m.isPending} disabled={!member || role === member.role} onClick={() => m.mutate()}>
              Save role
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- role reference ---------- */
function RoleReference() {
  const matrix = React.useMemo(() => Object.fromEntries(ROLES.map((r) => [r, new Set(permissionsForRole(r))])) as Record<Role, Set<string>>, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Role permissions</CardTitle>
        <CardDescription>Reference only. Roles are fixed by the platform; the API enforces them on every request.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 md:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="rounded-md border border-border p-3">
              <dt>
                <Badge tone={ROLE_TONE[r]}>{roleLabel(r)}</Badge>
              </dt>
              <dd className="mt-1.5 text-sm text-muted-foreground">{ROLE_TEXT[r]}</dd>
            </div>
          ))}
        </dl>
        <div className="relative overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Permissions granted to each role</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Permission
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    {roleLabel(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs font-medium">
                    {p}
                  </th>
                  {ROLES.map((r) => (
                    <td key={r} className="px-2 py-1.5 text-center">
                      {matrix[r].has(p) ? (
                        <>
                          <Check className="mx-auto size-4 text-success" aria-hidden />
                          <span className="sr-only">Yes</span>
                        </>
                      ) : (
                        <>
                          <Minus className="mx-auto size-4 text-muted-foreground/40" aria-hidden />
                          <span className="sr-only">No</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- page ---------- */
export default function TeamPage() {
  const can = useCan();
  const { data: session } = useSession();
  const qc = useQueryClient();
  const myUserId = session?.user.id;
  const isOwner = session?.organization?.role === "owner";
  const allowed = can("team:manage");
  const q = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => apiGet<Member[]>("/organization/members"), enabled: allowed });
  const [adding, setAdding] = React.useState(false);
  const [roleFor, setRoleFor] = React.useState<Member | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "remove" | "suspend"; member: Member } | null>(null);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status?: "active" | "suspended" } }) => apiPatch(`/organization/members/${id}`, body),
    onSuccess: (_d, v) => {
      toast.success(v.body.status === "suspended" ? "Member suspended and signed out" : "Member reactivated");
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      qc.invalidateQueries({ queryKey: ORG_KEY });
      setConfirm(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirm(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/organization/members/${id}`),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: MEMBERS_KEY });
      qc.invalidateQueries({ queryKey: ORG_KEY });
      setConfirm(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirm(null);
    },
  });

  const columns = React.useMemo<ColumnDef<Member, any>[]>(
    () => [
      {
        id: "person",
        header: "Member",
        accessorFn: (m) => m.displayName,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {row.original.displayName}
              {row.original.userId === myUserId ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      { id: "role", header: "Role", accessorFn: (m) => m.role, cell: ({ row }) => <Badge tone={ROLE_TONE[row.original.role]}>{roleLabel(row.original.role)}</Badge> },
      { id: "status", header: "Status", accessorFn: (m) => m.status, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { id: "joined", header: "Added", accessorFn: (m) => m.createdAt, cell: ({ row }) => <span className="tw-num text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const m = row.original;
          if (m.role === "owner") return <span className="text-xs text-muted-foreground">Owner is protected</span>;
          if (m.userId === myUserId) return <span className="text-xs text-muted-foreground">You cannot edit yourself</span>;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${m.displayName}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setRoleFor(m)}>Change role…</DropdownMenuItem>
                {m.status === "suspended" ? (
                  <DropdownMenuItem onSelect={() => patch.mutate({ id: m.id, body: { status: "active" } })}>Reactivate</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setConfirm({ kind: "suspend", member: m })}>Suspend</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setConfirm({ kind: "remove", member: m })}>
                  Remove from organisation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [myUserId, patch],
  );

  if (!allowed) {
    return (
      <>
        <PageHeader title="Team" eyebrow="Settings" />
        <NoAccess what="Managing the team" permission="team:manage" />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Team"
        icon={Users}
        eyebrow="Settings"
        description="Who can sign in to this organisation and what they may do."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add member
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Alert tone="info" title="Rules enforced by the platform">
          The owner cannot be changed or removed. You cannot change your own role or status. Only the owner can grant the Admin role. Suspending a member signs them out immediately. Seats are limited by your plan.
        </Alert>
        {q.isLoading ? (
          <LoadingBlock label="Loading team" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <DataTable
            data={q.data ?? []}
            columns={columns}
            caption="Team members"
            empty={<EmptyState title="No team members" description="Add your first colleague to share the workload." action={<Button onClick={() => setAdding(true)}>Add member</Button>} />}
          />
        )}
        <RoleReference />
      </div>
      <AddMemberDialog open={adding} onOpenChange={setAdding} isOwner={!!isOwner} />
      <ChangeRoleDialog member={roleFor} onClose={() => setRoleFor(null)} isOwner={!!isOwner} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title={confirm?.kind === "remove" ? "Remove member?" : "Suspend member?"}
        description={
          confirm?.kind === "remove"
            ? `${confirm.member.displayName} will lose access to this organisation immediately. Their past work and audit history stay.`
            : confirm
              ? `${confirm.member.displayName} will be signed out and unable to use this organisation until reactivated.`
              : ""
        }
        confirmLabel={confirm?.kind === "remove" ? "Remove" : "Suspend"}
        loading={patch.isPending || remove.isPending}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "remove") remove.mutate(confirm.member.id);
          else patch.mutate({ id: confirm.member.id, body: { status: "suspended" } });
        }}
      />
    </>
  );
}
