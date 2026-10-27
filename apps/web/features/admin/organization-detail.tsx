"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Building2, KeyRound, Plus, ShieldAlert, ShieldCheck, Trash2, UserMinus, UserPlus } from "lucide-react";
import { ROLES, SUPPORTED_CURRENCIES, slugSchema } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import type { AdminMember, AdminOrganizationDetail, AdminSubscription, SupportSummary } from "@/features/admin/types";

/* ---------- helpers ---------- */

function useRefreshOrg(id: string) {
  const qc = useQueryClient();
  return React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin-org", id] });
    qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    qc.invalidateQueries({ queryKey: ["admin-org-options"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }, [qc, id]);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}

/* ---------- profile ---------- */

const profileSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters"),
  slug: slugSchema,
  organizationType: z.enum(["tour_operator", "hotel_management"]),
  country: z.string().trim().length(2, "Use a 2-letter country code").toUpperCase(),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
  timezone: z.string().trim().min(1, "Required").max(64),
});
type ProfileValues = z.input<typeof profileSchema>;

function ProfileCard({ detail }: { detail: AdminOrganizationDetail }) {
  const org = detail.organization;
  const refresh = useRefreshOrg(org.id);
  const [error, setError] = React.useState<string | null>(null);
  const values = (): ProfileValues => ({ name: org.name, slug: org.slug, organizationType: org.organizationType as ProfileValues["organizationType"], country: org.country, defaultCurrency: org.defaultCurrency as ProfileValues["defaultCurrency"], timezone: org.timezone });
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) as never, defaultValues: values() });
  React.useEffect(() => reset(values()), [org, reset]);
  const save = useMutation({
    mutationFn: (v: z.output<typeof profileSchema>) => apiPatch(`/admin/organizations/${org.id}`, v),
    onSuccess: () => {
      toast.success("Organisation profile updated");
      refresh();
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync(profileSchema.parse(v));
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof ProfileValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation profile</CardTitle>
        <CardDescription>Identity and locale. Changing the slug affects partner lookups and existing links.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} noValidate>
        <CardContent className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="org-name" error={formState.errors.name?.message} required><Input id="org-name" {...register("name")} /></Field>
            <Field label="Slug" htmlFor="org-slug" error={formState.errors.slug?.message} required><Input id="org-slug" {...register("slug")} /></Field>
            <Field label="Type" htmlFor="org-type" error={formState.errors.organizationType?.message}><Select id="org-type" {...register("organizationType")}><option value="tour_operator">Tour operator</option><option value="hotel_management">Hotel management</option></Select></Field>
            <Field label="Country" htmlFor="org-country" error={formState.errors.country?.message}><Input id="org-country" maxLength={2} {...register("country")} /></Field>
            <Field label="Currency" htmlFor="org-currency" error={formState.errors.defaultCurrency?.message}><Select id="org-currency" {...register("defaultCurrency")}>{SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
            <Field label="Timezone" htmlFor="org-tz" error={formState.errors.timezone?.message}><Input id="org-tz" {...register("timezone")} /></Field>
          </div>
        </CardContent>
        <CardFooter><Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>Save profile</Button></CardFooter>
      </form>
    </Card>
  );
}

/* ---------- status ---------- */

const statusSchema = z.object({ reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(300, "At most 300 characters") });

function StatusCard({ detail }: { detail: AdminOrganizationDetail }) {
  const org = detail.organization;
  const refresh = useRefreshOrg(org.id);
  const [target, setTarget] = React.useState<"active" | "suspended" | "closed" | null>(null);
  const [reason, setReason] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const change = useMutation({
    mutationFn: (v: { status: string; reason: string }) => apiPatch(`/admin/organizations/${org.id}/status`, v),
    onSuccess: (_d, v) => {
      toast.success(`Organisation is now ${v.status}`);
      refresh();
      setTarget(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const open = (t: "active" | "suspended" | "closed") => {
    setTarget(t);
    setReason("");
    setFieldError(null);
    setError(null);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = statusSchema.safeParse({ reason });
    if (!r.success) return setFieldError(r.error.issues[0]?.message ?? "Invalid reason");
    setFieldError(null);
    setError(null);
    if (target) change.mutate({ status: target, reason: r.data.reason });
  };
  const verbs = { active: "Reactivate", suspended: "Suspend", closed: "Close" } as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account status</CardTitle>
        <CardDescription>
          Currently <StatusBadge status={org.status} />. Suspending or closing revokes every member session immediately. A reason is mandatory and is audited.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {org.status !== "active" ? <Button onClick={() => open("active")}>Reactivate</Button> : null}
        {org.status === "active" ? <Button variant="outline" onClick={() => open("suspended")}>Suspend</Button> : null}
        {org.status !== "closed" ? <Button variant="destructive" onClick={() => open("closed")}><Trash2 /> Close organisation</Button> : null}
      </CardContent>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent title={target ? `${verbs[target]} ${org.name}?` : ""} description={target === "closed" ? "Closing is intended to be permanent. Members lose access." : target === "suspended" ? "Members lose access until the organisation is reactivated." : "Members regain access."}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Reason" htmlFor="org-status-reason" error={fieldError} required hint="Recorded in the audit log with your name.">
              <Textarea id="org-status-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
              <Button type="submit" variant={target === "active" ? "default" : "destructive"} loading={change.isPending}>{target ? verbs[target] : "Confirm"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- subscription ---------- */

const subscriptionSchema = z.object({
  plan: z.string().trim().min(1, "Plan is required").max(40),
  status: z.enum(["active", "past_due", "cancelled"]),
  seatLimit: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(1, "At least 1").max(10_000, "At most 10,000"),
  monthlyOptimisationLimit: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "At least 0").max(1_000_000, "At most 1,000,000"),
});
type SubscriptionValues = z.input<typeof subscriptionSchema>;

function SubscriptionCard({ id, sub }: { id: string; sub: AdminSubscription | null }) {
  const refresh = useRefreshOrg(id);
  const [error, setError] = React.useState<string | null>(null);
  const values = (s: AdminSubscription | null): SubscriptionValues => ({ plan: s?.plan ?? "trial", status: (s?.status as SubscriptionValues["status"]) ?? "active", seatLimit: s?.seatLimit ?? 5, monthlyOptimisationLimit: s?.monthlyOptimisationLimit ?? 200 });
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<SubscriptionValues>({ resolver: zodResolver(subscriptionSchema) as never, defaultValues: values(sub) });
  React.useEffect(() => reset(values(sub)), [sub, reset]);
  const save = useMutation({
    mutationFn: (v: z.output<typeof subscriptionSchema>) => apiPut(`/admin/organizations/${id}/subscription`, v),
    onSuccess: () => {
      toast.success("Subscription updated");
      refresh();
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync(subscriptionSchema.parse(v));
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof SubscriptionValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan &amp; limits</CardTitle>
        <CardDescription>{sub?.currentPeriodEnd ? `Current period ends ${formatDate(sub.currentPeriodEnd)}.` : "Plan, seat allowance and monthly optimisation quota."}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {!sub ? <Alert tone="warning" title="No subscription row">Saving here creates a subscription record for this organisation.</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="org-plan" error={formState.errors.plan?.message}><Input id="org-plan" {...register("plan")} /></Field>
            <Field label="Status" htmlFor="org-plan-status" error={formState.errors.status?.message}><Select id="org-plan-status" {...register("status")}><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option></Select></Field>
            <Field label="Seat limit" htmlFor="org-seats" error={formState.errors.seatLimit?.message}><Input id="org-seats" type="number" min={1} className="tw-num" {...register("seatLimit")} /></Field>
            <Field label="Optimisations per month" htmlFor="org-opt" error={formState.errors.monthlyOptimisationLimit?.message}><Input id="org-opt" type="number" min={0} className="tw-num" {...register("monthlyOptimisationLimit")} /></Field>
          </div>
        </CardContent>
        <CardFooter><Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>Save subscription</Button></CardFooter>
      </form>
    </Card>
  );
}

/* ---------- team ---------- */

const memberSchema = z.object({
  email: z.email("Use a valid email").max(254),
  displayName: z.string().trim().max(120).optional(),
  role: z.enum(ROLES),
  temporaryPassword: z.string().max(200).optional(),
});
type MemberValues = z.input<typeof memberSchema>;

function AddMemberDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const refresh = useRefreshOrg(id);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<MemberValues>({ resolver: zodResolver(memberSchema) as never, defaultValues: { email: "", displayName: "", role: "staff", temporaryPassword: "" } });
  const add = useMutation({
    mutationFn: (v: MemberValues) => apiPost(`/admin/organizations/${id}/members`, { ...v, displayName: v.displayName?.trim() || undefined, temporaryPassword: v.temporaryPassword?.trim() || undefined }),
    onSuccess: () => {
      toast.success("Member added");
      refresh();
      reset();
      onOpenChange(false);
    },
  });
  const submit = handleSubmit(async (v) => {
    setError(null);
    if (v.temporaryPassword && v.temporaryPassword.length > 0 && v.temporaryPassword.length < 10) {
      setFieldError("temporaryPassword", { message: "Use at least 10 characters, or leave blank to email a reset link" });
      return;
    }
    try {
      await add.mutateAsync(v);
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof MemberValues, { message });
      setError(errorMessage(e));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add organisation member" description="Add an existing account by email, or create a new account. A blank password sends a password-reset email.">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Email" htmlFor="member-email" error={formState.errors.email?.message} required><Input id="member-email" type="email" {...register("email")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (new users)" htmlFor="member-name" error={formState.errors.displayName?.message}><Input id="member-name" {...register("displayName")} /></Field>
            <Field label="Role" htmlFor="member-role" error={formState.errors.role?.message} required><Select id="member-role" {...register("role")}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
          </div>
          <Field label="Temporary password" htmlFor="member-pass" error={formState.errors.temporaryPassword?.message} hint="Optional. New users get this password; existing users have it reset and their sessions revoked. Blank sends a reset email.">
            <Input id="member-pass" type="password" autoComplete="new-password" {...register("temporaryPassword")} />
          </Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={add.isPending}><UserPlus /> Add member</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamCard({ id, members }: { id: string; members: AdminMember[] }) {
  const refresh = useRefreshOrg(id);
  const [addOpen, setAddOpen] = React.useState(false);
  const [remove, setRemove] = React.useState<AdminMember | null>(null);
  const update = useMutation({
    mutationFn: (v: { membershipId: string; patch: { role?: string; status?: string } }) => apiPatch(`/admin/organizations/${id}/members/${v.membershipId}`, v.patch),
    onSuccess: () => {
      toast.success("Member updated");
      refresh();
      setRemove(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeMember = useMutation({
    mutationFn: (membershipId: string) => apiDelete(`/admin/organizations/${id}/members/${membershipId}`),
    onSuccess: () => {
      toast.success("Member removed");
      refresh();
      setRemove(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Team members</CardTitle>
          <CardDescription>Roles and access for this organisation. The last active owner cannot be removed or demoted.</CardDescription>
        </div>
        <Button size="sm" variant="accent" onClick={() => setAddOpen(true)}><Plus /> Add member</Button>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <EmptyState title="No members" description="Add the first member to this organisation." />
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Organisation members</caption>
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Member</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">MFA</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Last seen</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{m.displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                        {m.platformRole ? <Badge tone="accent">Platform admin</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select aria-label={`Role for ${m.displayName}`} value={m.role} disabled={update.isPending} onChange={(e) => update.mutate({ membershipId: m.id, patch: { role: e.target.value } })} className="h-8 w-36 text-xs">
                        {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3">{m.mfaEnabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}</td>
                    <td className="tw-num px-4 py-3 text-xs text-muted-foreground">{m.lastSeenAt ? relativeTime(m.lastSeenAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {m.status === "active" ? (
                          <Button size="sm" variant="ghost" onClick={() => update.mutate({ membershipId: m.id, patch: { status: "suspended" } })} disabled={update.isPending}>Suspend</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => update.mutate({ membershipId: m.id, patch: { status: "active" } })} disabled={update.isPending}>Reactivate</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setRemove(m)} aria-label={`Remove ${m.displayName}`}><UserMinus /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <AddMemberDialog id={id} open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog open={!!remove} onOpenChange={(o) => !o && setRemove(null)} title={remove ? `Remove ${remove.displayName}?` : ""} description="Their sessions are revoked and they lose access to this organisation. The account itself is not deleted." confirmLabel="Remove member" destructive loading={removeMember.isPending} onConfirm={() => remove && removeMember.mutate(remove.id)} />
    </Card>
  );
}

/* ---------- support access ---------- */

const grantSchema = z.object({
  reason: z.string().trim().min(10, "Describe why you need access (at least 10 characters)").max(500, "At most 500 characters"),
  minutes: z.coerce.number({ error: "Enter a number" }).int("Whole minutes only").min(5, "At least 5 minutes").max(240, "At most 240 minutes"),
});
type GrantValues = z.input<typeof grantSchema>;

function SupportData({ id }: { id: string }) {
  const readOnce = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: Infinity, gcTime: 0 } as const;
  const summary = useQuery({ queryKey: ["admin-support-summary", id], queryFn: () => apiGet<SupportSummary>(`/admin/organizations/${id}/support/summary`), ...readOnce });
  const audit = useQuery({ queryKey: ["admin-support-audit", id], queryFn: () => apiGet<{ id: string; actorName: string | null; action: string; resourceType: string; resourceId: string | null; createdAt: string }[]>(`/admin/organizations/${id}/support/audit`), ...readOnce });
  const forbidden = (summary.error instanceof ApiError && summary.error.status === 403) || (audit.error instanceof ApiError && audit.error.status === 403);
  if (forbidden) return <Alert tone="warning" title="No active access grant">The API refused the request. Request support access first; reads are refused without an unexpired grant.</Alert>;
  if (summary.error || audit.error) return <ErrorState error={summary.error ?? audit.error} onRetry={() => { void summary.refetch(); void audit.refetch(); }} />;
  if (summary.isLoading) return <LoadingBlock rows={4} label="Loading tenant data" />;
  const s = summary.data!;
  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info">These reads are audited under your name. Tenant content is only available while an unexpired grant exists.</Alert>
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Recent trip requests</h3>
          {s.trips.length === 0 ? <EmptyState title="No trip requests" /> : (
            <div className="relative overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Title</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Arrival</th></tr></thead>
                <tbody>{s.trips.map((t) => <tr key={t.id} className="border-t border-border"><td className="px-3 py-2 font-semibold">{t.title}</td><td className="px-3 py-2"><StatusBadge status={t.status} /></td><td className="tw-num px-3 py-2 text-muted-foreground">{formatDate(t.arrivalDate)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Recent quotations</h3>
          {s.quotes.length === 0 ? <EmptyState title="No quotations" /> : (
            <div className="relative overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Number</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Version</th><th className="px-3 py-2 font-semibold">Updated</th></tr></thead>
                <tbody>{s.quotes.map((q) => <tr key={q.id} className="border-t border-border"><td className="px-3 py-2 font-semibold">{q.quoteNumber}</td><td className="px-3 py-2"><StatusBadge status={q.status} /></td><td className="tw-num px-3 py-2">v{q.currentVersion}</td><td className="tw-num px-3 py-2 text-muted-foreground">{formatDateTime(q.updatedAt)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Recent optimisation jobs</h3>
          {s.jobs.length === 0 ? <EmptyState title="No jobs" /> : (
            <div className="relative overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Job</th><th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Created</th></tr></thead>
                <tbody>{s.jobs.map((j) => <tr key={j.id} className="border-t border-border"><td className="px-3 py-2"><Link className="font-mono text-xs font-semibold hover:underline" href={`/admin/jobs/${j.id}`}>{j.id.slice(0, 8)}</Link></td><td className="px-3 py-2"><StatusBadge status={j.status} /></td><td className="tw-num px-3 py-2 text-muted-foreground">{formatDateTime(j.createdAt)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Customers</h3>
          {s.customers.length === 0 ? <EmptyState title="No customers" /> : (
            <div className="relative overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold">Created</th></tr></thead>
                <tbody>{s.customers.map((c) => <tr key={c.id} className="border-t border-border"><td className="px-3 py-2 font-semibold">{c.name}</td><td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td><td className="tw-num px-3 py-2 text-muted-foreground">{formatDate(c.createdAt)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-display text-base font-semibold">Tenant audit trail</h3>
        {!audit.data || audit.data.length === 0 ? <EmptyState title="No audit events" /> : (
          <div className="relative overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">When</th><th className="px-3 py-2 font-semibold">Who</th><th className="px-3 py-2 font-semibold">Action</th><th className="px-3 py-2 font-semibold">Resource</th></tr></thead>
              <tbody>{audit.data.map((a) => <tr key={a.id} className="border-t border-border"><td className="tw-num whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(a.createdAt)}</td><td className="px-3 py-2">{a.actorName ?? "System"}</td><td className="px-3 py-2 font-mono text-xs font-semibold">{a.action}</td><td className="px-3 py-2">{a.resourceType}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SupportCard({ detail }: { detail: AdminOrganizationDetail }) {
  const id = detail.organization.id;
  const refresh = useRefreshOrg(id);
  const [load, setLoad] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, formState } = useForm<GrantValues>({ resolver: zodResolver(grantSchema) as never, defaultValues: { reason: "", minutes: 30 } });
  const request = useMutation({
    mutationFn: (v: z.output<typeof grantSchema>) => apiPost<{ grantId: string; expiresAt: string }>(`/admin/organizations/${id}/access-grants`, v),
    onSuccess: (g) => {
      toast.success(`Access granted until ${formatDateTime(g.expiresAt)}`);
      reset({ reason: "", minutes: 30 });
      refresh();
      setLoad(true);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) => apiDelete(`/admin/access-grants/${grantId}`),
    onSuccess: () => {
      toast.success("Access grant revoked");
      refresh();
      setLoad(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const onSubmit = handleSubmit((v) => {
    setError(null);
    request.mutate(grantSchema.parse(v));
  });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-warning" aria-hidden /><CardTitle>Support access &amp; tenant data</CardTitle></div>
        <CardDescription>Tenant business content is hidden by default. Request a short, reason-bound grant. Every read under a grant is written to the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-[1fr_10rem]">
          <Field label="Reason for access" htmlFor="grant-reason" error={formState.errors.reason?.message} required hint="For example: customer ticket #1234, investigating a failed optimisation."><Textarea id="grant-reason" rows={2} maxLength={500} {...register("reason")} /></Field>
          <Field label="Duration (minutes)" htmlFor="grant-min" error={formState.errors.minutes?.message} hint="5 to 240."><Input id="grant-min" type="number" min={5} max={240} className="tw-num" {...register("minutes")} /></Field>
          <div className="md:col-span-2"><Button type="submit" variant="accent" loading={request.isPending}><ShieldCheck /> Grant support access</Button></div>
        </form>

        <div>
          <h3 className="mb-2 font-display text-base font-semibold">Recent grants</h3>
          {detail.accessGrants.length === 0 ? <p className="text-sm text-muted-foreground">No grants yet.</p> : (
            <div className="flex flex-col gap-2">
              {detail.accessGrants.map((g) => (
                <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.reason}</p>
                    <p className="text-xs text-muted-foreground">{g.platformUserName ?? g.platformUserEmail} · {formatDateTime(g.createdAt)} → {formatDateTime(g.expiresAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {g.active ? <Badge tone="success">Active</Badge> : g.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="neutral">Expired</Badge>}
                    {g.active ? <Button size="sm" variant="outline" onClick={() => revoke.mutate(g.id)} loading={revoke.isPending}>Revoke</Button> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!load ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p>{detail.supportAccessActive ? "You already have an active grant. Loading the support view is audited." : "Request access above, then the tenant data loads automatically. Loading without an active grant is refused."}</p>
            <Button className="mt-3" variant="outline" onClick={() => setLoad(true)}>Load tenant data</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tenant data</p>
              <Button size="sm" variant="ghost" onClick={() => refresh()}>Refresh access state</Button>
            </div>
            <SupportData id={id} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- page ---------- */

export function AdminOrganizationDetailView({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["admin-org", id],
    queryFn: () => apiGet<AdminOrganizationDetail>(`/admin/organizations/${id}`),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  if (q.isLoading) return <LoadingBlock rows={5} label="Loading organisation" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error instanceof ApiError && q.error.status === 404 ? "Organisation not found" : "Could not load organisation"} />;
  const d = q.data!;
  const o = d.organization;
  return (
    <>
      <PageHeader
        eyebrow="Platform administration"
        title={o.name}
        icon={Building2}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            <Badge tone="outline">{titleCase(o.organizationType)}</Badge>
            <span>{o.slug} · {o.country} · {o.defaultCurrency} · created {formatDate(o.createdAt)}</span>
            {d.supportAccessActive ? <Badge tone="success">Support access active</Badge> : null}
          </span>
        }
        actions={<Button asChild variant="outline"><Link href="/admin/organizations"><ArrowLeft /> All organisations</Link></Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Trip requests" value={d.usage.trips} hint={`${d.usage.customers} customers`} />
        <Stat label="Quotations" value={d.usage.quotes} />
        <Stat label="Optimisation jobs" value={d.usage.jobs} />
        <Stat label="Members" value={d.usage.members} hint={`${d.usage.properties} properties · ${d.usage.documents} documents (${formatBytes(d.usage.storageBytes)})`} />
      </div>
      <Alert tone="info" className="mb-6">Every action here is recorded in the platform audit log. Viewing or changing tenant business data additionally requires a time-boxed support grant.</Alert>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="support">Support &amp; data</TabsTrigger>
          <TabsTrigger value="activity">Admin activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="flex flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-2"><ProfileCard detail={d} /><StatusCard detail={d} /></div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Usage &amp; storage</CardTitle><CardDescription>What this organisation currently holds on the platform.</CardDescription></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  {[
                    ["Trips", d.usage.trips], ["Quotations", d.usage.quotes], ["Properties", d.usage.properties], ["Customers", d.usage.customers], ["Jobs", d.usage.jobs], ["Members", d.usage.members], ["Documents", d.usage.documents], ["Storage", formatBytes(d.usage.storageBytes)], ["Notifications", d.usage.notifications], ["Pending emails", d.usage.pendingEmails], ["Failed emails", d.usage.failedEmails],
                  ].map(([label, value]) => (
                    <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="tw-num font-display text-lg font-semibold">{value}</dd></div>
                  ))}
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">Last tenant audit activity: {d.usage.lastActivityAt ? formatDateTime(d.usage.lastActivityAt) : "never"}.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Quick actions</CardTitle><CardDescription>Jump to the controls most often used for support.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button asChild variant="outline" className="justify-start"><Link href={`/admin/users?organizationId=${o.id}`}><UserPlus /> View users in this organisation</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link href={`/admin/jobs?organizationId=${o.id}`}><KeyRound /> View optimisation jobs</Link></Button>
                <Button asChild variant="outline" className="justify-start"><Link href={`/admin/audit?organizationId=${o.id}`}><ShieldCheck /> View platform audit log</Link></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="team"><TeamCard id={id} members={d.members} /></TabsContent>
        <TabsContent value="plan"><div className="max-w-2xl"><SubscriptionCard id={id} sub={d.subscription} /></div></TabsContent>
        <TabsContent value="support"><SupportCard detail={d} /></TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle>Admin activity for this organisation</CardTitle><CardDescription>The most recent platform-staff actions. Use the audit log for the full tenant and platform history.</CardDescription></CardHeader>
            <CardContent>
              {d.adminActions.length === 0 ? <EmptyState title="No admin actions yet" /> : (
                <ol className="flex flex-col">
                  {d.adminActions.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold">{a.action}</p>
                        <p className="text-xs text-muted-foreground">{a.actorName ?? a.actorEmail ?? "System"} · {formatDateTime(a.createdAt)}</p>
                      </div>
                      <Badge tone="outline">{a.resourceType}</Badge>
                    </li>
                  ))}
                </ol>
              )}
              <Button asChild variant="outline" size="sm" className="mt-3"><Link href={`/admin/audit?organizationId=${o.id}`}>Open full audit log</Link></Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
