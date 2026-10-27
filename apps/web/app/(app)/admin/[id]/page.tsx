"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Stat, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ApiError, apiGet, apiPatch, apiPost, apiPut, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, titleCase } from "@/lib/utils";
import { AdminGuard, type AdminOrganization } from "@/features/admin/admin-guard";

/** Subscription rows are returned raw from the database (snake_case). */
interface SubscriptionRow {
  plan: string;
  status: string;
  seat_limit: number;
  monthly_optimisation_limit: number;
  current_period_end: string | null;
}
interface Overview {
  organization: AdminOrganization;
  subscription: SubscriptionRow | null;
  counts: { trips: number; quotes: number; properties: number; jobs: number } | null;
}
interface SupportTrip {
  id: string;
  title: string;
  status: string;
  arrivalDate: string | null;
  updatedAt: string;
}
interface SupportAudit {
  id: string;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

/* ---------- subscription ---------- */
const subscriptionSchema = z.object({
  plan: z.string().trim().min(1, "Plan is required").max(40),
  status: z.enum(["active", "past_due", "cancelled"]),
  seatLimit: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(1, "At least 1").max(10_000, "At most 10,000"),
  monthlyOptimisationLimit: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "At least 0").max(1_000_000, "At most 1,000,000"),
});
type SubscriptionValues = z.input<typeof subscriptionSchema>;

function SubscriptionCard({ id, sub }: { id: string; sub: SubscriptionRow | null }) {
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const values = (s: SubscriptionRow | null): SubscriptionValues => ({ plan: s?.plan ?? "trial", status: (s?.status as SubscriptionValues["status"]) ?? "active", seatLimit: s?.seat_limit ?? 5, monthlyOptimisationLimit: s?.monthly_optimisation_limit ?? 200 });
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<SubscriptionValues>({ resolver: zodResolver(subscriptionSchema) as never, defaultValues: values(sub) });
  React.useEffect(() => reset(values(sub)), [sub, reset]);
  const save = useMutation({
    mutationFn: (v: z.output<typeof subscriptionSchema>) => apiPut(`/admin/organizations/${id}/subscription`, v),
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["admin-org", id] });
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
        <CardTitle>Subscription</CardTitle>
        <CardDescription>Plan and limits for this organisation. {sub?.current_period_end ? `Current period ends ${formatDate(sub.current_period_end)}.` : ""}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {!sub ? <Alert tone="info">This organisation has no subscription record yet; saving will not create one.</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="s-plan" error={formState.errors.plan?.message}>
              <Input id="s-plan" {...register("plan")} />
            </Field>
            <Field label="Status" htmlFor="s-status" error={formState.errors.status?.message}>
              <Select id="s-status" {...register("status")}>
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
            <Field label="Seat limit" htmlFor="s-seats" error={formState.errors.seatLimit?.message}>
              <Input id="s-seats" type="number" min={1} className="tw-num" {...register("seatLimit")} />
            </Field>
            <Field label="Optimisations per month" htmlFor="s-opt" error={formState.errors.monthlyOptimisationLimit?.message}>
              <Input id="s-opt" type="number" min={0} className="tw-num" {...register("monthlyOptimisationLimit")} />
            </Field>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
            Save subscription
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/* ---------- status change ---------- */
const statusSchema = z.object({ reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(300, "At most 300 characters") });

function StatusCard({ org }: { org: AdminOrganization }) {
  const qc = useQueryClient();
  const [target, setTarget] = React.useState<"active" | "suspended" | "closed" | null>(null);
  const [reason, setReason] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const change = useMutation({
    mutationFn: (v: { status: string; reason: string }) => apiPatch(`/admin/organizations/${org.id}/status`, v),
    onSuccess: (_d, v) => {
      toast.success(`Organisation is now ${v.status}`);
      qc.invalidateQueries({ queryKey: ["admin-org", org.id] });
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
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
        <CardTitle>Organisation status</CardTitle>
        <CardDescription>
          Currently <StatusBadge status={org.status} />. A reason is mandatory and is stored in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {org.status !== "active" ? <Button onClick={() => open("active")}>Reactivate</Button> : null}
        {org.status === "active" ? (
          <Button variant="outline" onClick={() => open("suspended")}>
            Suspend
          </Button>
        ) : null}
        {org.status !== "closed" ? (
          <Button variant="destructive" onClick={() => open("closed")}>
            Close organisation
          </Button>
        ) : null}
      </CardContent>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent title={target ? `${verbs[target]} ${org.name}?` : ""} description={target === "closed" ? "Closing is intended to be permanent. Members lose access." : target === "suspended" ? "Members lose access until the organisation is reactivated." : "Members regain access."}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Reason" htmlFor="st-reason" error={fieldError} required hint="Recorded in the audit log with your name.">
              <Textarea id="st-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant={target === "active" ? "default" : "destructive"} loading={change.isPending}>
                {target ? verbs[target] : "Confirm"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------- support access ---------- */
const grantSchema = z.object({
  reason: z.string().trim().min(10, "Describe why you need access (at least 10 characters)").max(500, "At most 500 characters"),
  minutes: z.coerce.number({ error: "Enter a number" }).int("Whole minutes only").min(5, "At least 5 minutes").max(240, "At most 240 minutes"),
});
type GrantValues = z.input<typeof grantSchema>;

function SupportSection({ id }: { id: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [grant, setGrant] = React.useState<{ grantId: string; expiresAt: string } | null>(null);
  const [load, setLoad] = React.useState(false);
  const { register, handleSubmit, reset, formState } = useForm<GrantValues>({ resolver: zodResolver(grantSchema) as never, defaultValues: { reason: "", minutes: 30 } });

  // Every read of tenant data is audited, so these never refetch on focus or on their own.
  const readOnce = { enabled: load, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: Infinity, gcTime: 0 } as const;
  const trips = useQuery({ queryKey: ["admin-support-trips", id], queryFn: () => apiGet<SupportTrip[]>(`/admin/organizations/${id}/support/trips`), ...readOnce });
  const audit = useQuery({ queryKey: ["admin-support-audit", id], queryFn: () => apiGet<SupportAudit[]>(`/admin/organizations/${id}/support/audit`), ...readOnce });

  const request = useMutation({
    mutationFn: (v: z.output<typeof grantSchema>) => apiPost<{ grantId: string; expiresAt: string }>(`/admin/organizations/${id}/access-grants`, v),
    onSuccess: (g) => {
      setGrant(g);
      toast.success("Access granted for a limited time");
      reset({ reason: "", minutes: 30 });
      setLoad(true);
      void trips.refetch();
      void audit.refetch();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const onSubmit = handleSubmit((v) => {
    setError(null);
    request.mutate(grantSchema.parse(v));
  });

  const forbidden = (trips.error instanceof ApiError && trips.error.status === 403) || (audit.error instanceof ApiError && audit.error.status === 403);
  const reload = () => {
    setLoad(true);
    void trips.refetch();
    void audit.refetch();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-warning" aria-hidden />
          <CardTitle>Support access to tenant data</CardTitle>
        </div>
        <CardDescription>Tenant trips and audit history are hidden by default. To investigate, request a short, time-boxed grant with a reason. The grant, and every read made under it, is written to the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-[1fr_10rem]">
          {error ? (
            <div className="md:col-span-2">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
          <Field label="Reason for access" htmlFor="g-reason" error={formState.errors.reason?.message} required hint="For example: customer ticket #1234, investigating a failed optimisation.">
            <Textarea id="g-reason" rows={2} maxLength={500} {...register("reason")} />
          </Field>
          <Field label="Duration (minutes)" htmlFor="g-min" error={formState.errors.minutes?.message} hint="5 to 240.">
            <Input id="g-min" type="number" min={5} max={240} className="tw-num" {...register("minutes")} />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" variant="accent" loading={request.isPending}>
              Request support access
            </Button>
          </div>
        </form>

        {grant ? (
          <Alert tone="success" title="Access grant active">
            Expires <span className="tw-num font-semibold">{formatDateTime(grant.expiresAt)}</span>. After that, reads below are refused until you request a new grant.
          </Alert>
        ) : null}

        {!load ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p>Already have an active grant for this organisation (for example from earlier)? You can load the support view directly. It is refused if no grant is active.</p>
            <Button className="mt-3" variant="outline" onClick={() => setLoad(true)}>
              Load tenant data
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {forbidden ? (
              <Alert tone="warning" title="No active access grant">
                The API refused the request because you have no unexpired grant for this organisation. Request one above with a reason (at least 10 characters), then the data loads automatically.
              </Alert>
            ) : null}
            {!forbidden && (trips.error || audit.error) ? <ErrorState error={trips.error ?? audit.error} onRetry={reload} /> : null}
            {!forbidden ? (
              <>
                <section aria-labelledby="sup-trips">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 id="sup-trips" className="font-display text-base font-semibold">
                      Recent trip requests
                    </h3>
                    <Button size="sm" variant="ghost" onClick={reload} loading={trips.isFetching || audit.isFetching}>
                      Refresh
                    </Button>
                  </div>
                  {trips.isLoading ? (
                    <LoadingBlock rows={2} label="Loading trips" />
                  ) : trips.data && trips.data.length === 0 ? (
                    <EmptyState title="No trip requests" description="This organisation has not created any trips." />
                  ) : trips.data ? (
                    <div className="relative overflow-x-auto rounded-md border border-border">
                      <table className="w-full min-w-[520px] text-sm">
                        <caption className="sr-only">Most recent trip requests (up to 25)</caption>
                        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-3 py-2 font-semibold">Title</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Arrival</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trips.data.map((t) => (
                            <tr key={t.id} className="border-t border-border">
                              <td className="px-3 py-2 font-semibold">{t.title}</td>
                              <td className="px-3 py-2">
                                <StatusBadge status={t.status} />
                              </td>
                              <td className="tw-num px-3 py-2">{formatDate(t.arrivalDate)}</td>
                              <td className="tw-num px-3 py-2 text-muted-foreground">{formatDateTime(t.updatedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
                <section aria-labelledby="sup-audit">
                  <h3 id="sup-audit" className="mb-2 font-display text-base font-semibold">
                    Organisation audit trail
                  </h3>
                  {audit.isLoading ? (
                    <LoadingBlock rows={2} label="Loading audit trail" />
                  ) : audit.data && audit.data.length === 0 ? (
                    <EmptyState title="No audit events" />
                  ) : audit.data ? (
                    <div className="relative overflow-x-auto rounded-md border border-border">
                      <table className="w-full min-w-[560px] text-sm">
                        <caption className="sr-only">Most recent audit events (up to 50)</caption>
                        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-3 py-2 font-semibold">When</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Who</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Action</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Resource</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit.data.map((a) => (
                            <tr key={a.id} className="border-t border-border">
                              <td className="tw-num whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDateTime(a.createdAt)}</td>
                              <td className="px-3 py-2">{a.actorName ?? "System"}</td>
                              <td className="px-3 py-2 font-mono text-xs font-semibold">{a.action}</td>
                              <td className="px-3 py-2">{a.resourceType}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- page ---------- */
function Detail({ id }: { id: string }) {
  // Opening an organisation is itself audited server-side, so do not refetch automatically.
  const q = useQuery({ queryKey: ["admin-org", id], queryFn: () => apiGet<Overview>(`/admin/organizations/${id}`), refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  if (q.isLoading) return <LoadingBlock label="Loading organisation" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error instanceof ApiError && q.error.status === 404 ? "Organisation not found" : "Could not load organisation"} />;
  const { organization: org, subscription, counts } = q.data!;
  return (
    <>
      <PageHeader
        eyebrow="Platform admin"
        title={org.name}
        icon={ShieldAlert}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={org.status} />
            <Badge tone="outline">{titleCase(org.organizationType)}</Badge>
            <span>
              {org.slug} · {org.country} · {org.defaultCurrency} · created {formatDate(org.createdAt)}
            </span>
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/admin">
              <ArrowLeft /> All organisations
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Alert tone="info">Every action here (viewing this page, changing status or subscription, granting access, reading tenant data) is recorded in the organisation's audit log under your name.</Alert>
        {counts ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Trip requests" value={counts.trips} />
            <Stat label="Quotations" value={counts.quotes} />
            <Stat label="Properties" value={counts.properties} />
            <Stat label="Optimisation jobs" value={counts.jobs} />
          </div>
        ) : null}
        <div className="grid gap-6 xl:grid-cols-2">
          <SubscriptionCard id={id} sub={subscription} />
          <StatusCard org={org} />
        </div>
        <SupportSection id={id} />
      </div>
    </>
  );
}

export default function AdminOrganisationPage() {
  const params = useParams<{ id: string }>();
  return <AdminGuard>{params?.id ? <Detail id={params.id} /> : null}</AdminGuard>;
}
