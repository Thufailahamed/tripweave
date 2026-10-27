"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Ban, KeyRound, MailCheck, Plus, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { ROLES } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { useRefreshSession, useSession } from "@/lib/session";
import { formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import type { AdminUserDetailResponse, AdminUserMembership } from "@/features/admin/types";
import { useOrganizationOptions } from "@/features/admin/ui";

const accountSchema = z.object({
  displayName: z.string().trim().min(1, "Required").max(120),
  email: z.email("Use a valid email").max(254),
  status: z.enum(["active", "suspended", "invited"]),
  platformAdmin: z.boolean(),
  emailVerified: z.boolean(),
});
type AccountValues = z.input<typeof accountSchema>;

function AccountCard({ data }: { data: AdminUserDetailResponse }) {
  const user = data.user;
  const { data: session } = useSession();
  const isSelf = session?.user.id === user.id;
  const refreshSession = useRefreshSession();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const values = (): AccountValues => ({ displayName: user.displayName, email: user.email, status: user.status as AccountValues["status"], platformAdmin: user.platformRole === "platform_admin", emailVerified: !!user.emailVerifiedAt });
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<AccountValues>({ resolver: zodResolver(accountSchema) as never, defaultValues: values() });
  React.useEffect(() => reset(values()), [user, reset]);
  const save = useMutation({
    mutationFn: (v: AccountValues) =>
      apiPatch(`/admin/users/${user.id}`, {
        displayName: v.displayName,
        email: v.email,
        status: isSelf ? undefined : v.status,
        platformRole: isSelf ? undefined : v.platformAdmin ? "platform_admin" : null,
        emailVerified: v.emailVerified,
      }),
    onSuccess: () => {
      toast.success("Account updated");
      qc.invalidateQueries({ queryKey: ["admin-user", user.id] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      if (isSelf) refreshSession();
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync(accountSchema.parse(v));
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof AccountValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Identity, lifecycle state and platform privileges.{isSelf ? " You cannot suspend or demote your own account." : ""}</CardDescription>
      </CardHeader>
      <form onSubmit={submit} noValidate>
        <CardContent className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? <Alert tone="warning" title="Account locked">Locked until {formatDateTime(user.lockedUntil)} after {user.failedLoginCount} failed sign-ins.</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="u-name" error={formState.errors.displayName?.message} required><Input id="u-name" {...register("displayName")} /></Field>
            <Field label="Email" htmlFor="u-email" error={formState.errors.email?.message} required><Input id="u-email" type="email" {...register("email")} /></Field>
            <Field label="Status" htmlFor="u-status" error={formState.errors.status?.message} hint={isSelf ? "You cannot suspend yourself." : undefined}>
              <Select id="u-status" disabled={isSelf} {...register("status")}><option value="active">Active</option><option value="suspended">Suspended</option><option value="invited">Invited</option></Select>
            </Field>
            <div className="flex flex-col justify-center gap-2 rounded-lg border border-border px-3 py-2">
              <Checkbox id="u-admin" label="Platform administrator" disabled={isSelf} {...register("platformAdmin")} />
              <Checkbox id="u-verified" label="Email address verified" {...register("emailVerified")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Failed sign-ins: {user.failedLoginCount}. Created {formatDateTime(user.createdAt)}. Last updated {formatDateTime(user.updatedAt)}.</p>
        </CardContent>
        <CardFooter><Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>Save account</Button></CardFooter>
      </form>
    </Card>
  );
}

function AddMembershipDialog({ userId, open, onOpenChange }: { userId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const orgs = useOrganizationOptions();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<{ organizationId: string; role: string }>({ defaultValues: { organizationId: "", role: "staff" } });
  const add = useMutation({
    mutationFn: (v: { organizationId: string; role: string }) => apiPost(`/admin/users/${userId}/memberships`, v),
    onSuccess: () => {
      toast.success("Membership added");
      qc.invalidateQueries({ queryKey: ["admin-user", userId] });
      reset();
      onOpenChange(false);
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    if (!v.organizationId) return setError("Choose an organisation");
    try {
      await add.mutateAsync(v);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add to organisation" description="The user keeps all existing memberships. Seat limits are enforced by the organisation's plan.">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Organisation" htmlFor="um-org" required>
            <Select id="um-org" {...register("organizationId")}><option value="">Choose…</option>{orgs.data?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          </Field>
          <Field label="Role" htmlFor="um-role" error={formState.errors.role?.message}><Select id="um-role" {...register("role")}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={add.isPending}><Plus /> Add membership</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionsCard({ data }: { data: AdminUserDetailResponse }) {
  const user = data.user;
  const router = useRouter();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isSelf = session?.user.id === user.id;
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [mfaOpen, setMfaOpen] = React.useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-user", user.id] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };
  const unlock = useMutation({
    mutationFn: () => apiPost(`/admin/users/${user.id}/unlock`),
    onSuccess: () => {
      toast.success("Account unlocked");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const logout = useMutation({
    mutationFn: () => apiPost(`/admin/users/${user.id}/force-logout`),
    onSuccess: () => {
      toast.success("All sessions revoked");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () => apiPost(`/admin/users/${user.id}/send-password-reset`),
    onSuccess: () => {
      toast.success("Password-reset email queued");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const verify = useMutation({
    mutationFn: () => apiPost(`/admin/users/${user.id}/verify-email`),
    onSuccess: () => {
      toast.success("Email marked verified");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disableMfa = useMutation({
    mutationFn: () => apiPost(`/admin/users/${user.id}/mfa/disable`),
    onSuccess: () => {
      toast.success("MFA disabled and sessions revoked");
      refresh();
      setMfaOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/admin/users/${user.id}`),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      router.push("/admin/users");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Support actions</CardTitle>
        <CardDescription>Recovery operations for locked-out or compromised accounts. Every action is audited.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => unlock.mutate(undefined)} loading={unlock.isPending}><KeyRound /> Unlock account</Button>
        <Button variant="outline" onClick={() => reset.mutate(undefined)} loading={reset.isPending}><MailCheck /> Send password reset</Button>
        <Button variant="outline" onClick={() => verify.mutate(undefined)} loading={verify.isPending} disabled={!!user.emailVerifiedAt}><ShieldCheck /> Mark email verified</Button>
        <Button variant="outline" onClick={() => logout.mutate(undefined)} loading={logout.isPending}><Ban /> Force sign out</Button>
        <Button variant="outline" onClick={() => setMfaOpen(true)} disabled={!user.mfaEnabled}><UserCog /> Disable MFA</Button>
        <Button variant="outline" onClick={() => setAddOpen(true)} disabled={isSelf}><Plus /> Add to organisation</Button>
        {!isSelf ? <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete user</Button> : null}
      </CardContent>
      <AddMembershipDialog userId={user.id} open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog open={mfaOpen} onOpenChange={setMfaOpen} title="Disable multi-factor authentication?" description={`${user.displayName} will be able to sign in with only their password. All sessions are revoked. Use this only for account recovery.`} confirmLabel="Disable MFA" destructive loading={disableMfa.isPending} onConfirm={() => disableMfa.mutate()} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={user ? `Delete ${user.displayName}?` : ""} description="The account and its memberships, sessions and MFA are permanently deleted. Audit events are retained. Accounts that own an organisation, hold support grants, or have created trips, quotes, jobs or documents must be suspended instead so history stays attributable." confirmLabel="Delete user" destructive loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </Card>
  );
}

function MembershipsCard({ memberships }: { memberships: AdminUserMembership[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Organisation memberships</CardTitle><CardDescription>Roles this account holds across tenants.</CardDescription></CardHeader>
      <CardContent>
        {memberships.length === 0 ? <EmptyState title="No memberships" description="This account is not a member of any organisation." /> : (
          <div className="relative overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-semibold">Organisation</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">Membership</th><th className="px-4 py-2.5 font-semibold">Organisation status</th><th className="px-4 py-2.5 font-semibold">Since</th></tr></thead>
              <tbody>{memberships.map((m) => <tr key={m.id} className="border-t border-border"><td className="px-4 py-3"><Link href={`/admin/organizations/${m.organizationId}`} className="font-semibold hover:underline">{m.organizationName}</Link><p className="text-xs text-muted-foreground">{titleCase(m.organizationType)}</p></td><td className="px-4 py-3">{titleCase(m.role)}</td><td className="px-4 py-3"><StatusBadge status={m.status} /></td><td className="px-4 py-3"><StatusBadge status={m.organizationStatus} /></td><td className="tw-num px-4 py-3 text-muted-foreground">{formatDate(m.createdAt)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminUserDetailView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["admin-user", id], queryFn: () => apiGet<AdminUserDetailResponse>(`/admin/users/${id}`) });
  if (q.isLoading) return <LoadingBlock rows={5} label="Loading user" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error instanceof ApiError && q.error.status === 404 ? "User not found" : "Could not load user"} />;
  const d = q.data!;
  const u = d.user;
  return (
    <>
      <PageHeader
        eyebrow="Platform administration"
        title={u.displayName}
        icon={Users}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={u.status} />{u.platformRole ? <Badge tone="accent">Platform admin</Badge> : null}{u.mfaEnabled ? <Badge tone="success">MFA enabled</Badge> : null}<span>{u.email} · joined {formatDate(u.createdAt)}</span></span>}
        actions={<Button asChild variant="outline"><Link href="/admin/users"><ArrowLeft /> All users</Link></Button>}
      />
      {d.ownedOrganizations.length > 0 ? (
        <Alert tone="warning" className="mb-6" title="Sole active owner">
          This user is the only active owner of {d.ownedOrganizations.map((o) => <Link key={o.id} href={`/admin/organizations/${o.id}`} className="font-semibold underline underline-offset-2">{o.name}</Link>).reduce<React.ReactNode[]>((all, el, i) => (i === 0 ? [el] : [...all, ", ", el]), [])}. Add another owner before deleting or suspending the account.
        </Alert>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Trip requests created" value={u.created.trips} />
        <Stat label="Quotations created" value={u.created.quotes} />
        <Stat label="Optimisations created" value={u.created.jobs} />
        <Stat label="Active sessions" value={u.activeSessions} hint={`${u.membershipCount} membership${u.membershipCount === 1 ? "" : "s"} · ${u.recoveryCodesRemaining} recovery codes`} />
      </div>
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="access">Memberships</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="flex flex-col gap-6"><AccountCard data={d} /><ActionsCard data={d} /></TabsContent>
        <TabsContent value="access"><MembershipsCard memberships={d.memberships} /></TabsContent>
        <TabsContent value="sessions">
          <Card>
            <CardHeader><CardTitle>Sessions</CardTitle><CardDescription>Recent browser sessions. Tokens are stored as hashes and cannot be recovered; force sign-out revokes all of them.</CardDescription></CardHeader>
            <CardContent>
              {d.sessions.length === 0 ? <EmptyState title="No sessions" /> : (
                <div className="relative overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2.5 font-semibold">Created</th><th className="px-4 py-2.5 font-semibold">Last seen</th><th className="px-4 py-2.5 font-semibold">Expires</th><th className="px-4 py-2.5 font-semibold">Organisation</th><th className="px-4 py-2.5 font-semibold">State</th><th className="px-4 py-2.5 font-semibold">User agent</th></tr></thead>
                    <tbody>{d.sessions.map((s) => <tr key={s.id} className="border-t border-border"><td className="tw-num px-4 py-3 text-muted-foreground">{formatDateTime(s.createdAt)}</td><td className="tw-num px-4 py-3">{formatDateTime(s.lastSeenAt)}</td><td className="tw-num px-4 py-3 text-muted-foreground">{formatDateTime(s.expiresAt)}</td><td className="px-4 py-3">{s.organizationName ?? "—"}</td><td className="px-4 py-3">{s.active ? <Badge tone="success">Active</Badge> : s.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="neutral">Expired</Badge>}</td><td className="max-w-[20rem] truncate px-4 py-3 text-xs text-muted-foreground">{s.userAgent ?? "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle>Recent activity by this user</CardTitle><CardDescription>The latest audit events where the user was the actor.</CardDescription></CardHeader>
            <CardContent>
              {d.audit.length === 0 ? <EmptyState title="No activity" /> : (
                <ol className="flex flex-col">{d.audit.map((a) => <li key={a.id} className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0"><div className="min-w-0"><p className="font-mono text-xs font-semibold">{a.action}</p><p className="text-xs text-muted-foreground">{a.organizationName ?? "Platform"} · {formatDateTime(a.createdAt)}</p></div><Badge tone="outline">{a.resourceType}</Badge></li>)}</ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
