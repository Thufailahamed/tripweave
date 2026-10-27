"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateOrganizationSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Building2, Gauge } from "lucide-react";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, IconTile, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { apiPatch } from "@/lib/api";
import { SESSION_KEY, useCan, useSession } from "@/lib/session";
import { titleCase } from "@/lib/utils";
import { applyFieldErrors, CURRENCY_OPTIONS, ORG_KEY, useOrganization, useTimezones, type OrganizationDetail } from "@/features/settings/shared";

const profileSchema = updateOrganizationSchema.pick({ name: true, defaultCurrency: true, timezone: true, country: true }).required();
type ProfileValues = z.infer<typeof profileSchema>;

function UsageBar({ label, used, limit, hint }: { label: string; used: number; limit: number; hint: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="tw-num font-display text-xl font-semibold">
          {used} <span className="text-sm font-normal text-muted-foreground">/ {limit}</span>
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ProfileForm({ org, canEdit }: { org: OrganizationDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const zones = useTimezones();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema) as never,
    defaultValues: { name: org.name, defaultCurrency: org.defaultCurrency as ProfileValues["defaultCurrency"], timezone: org.timezone, country: org.country },
  });
  React.useEffect(() => {
    reset({ name: org.name, defaultCurrency: org.defaultCurrency as ProfileValues["defaultCurrency"], timezone: org.timezone, country: org.country });
  }, [org, reset]);

  const save = useMutation({
    mutationFn: (v: ProfileValues) => apiPatch("/organization", { ...v, country: v.country.toUpperCase() }),
    onSuccess: () => {
      toast.success("Organisation profile saved");
      qc.invalidateQueries({ queryKey: ORG_KEY });
      qc.invalidateQueries({ queryKey: SESSION_KEY });
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync(v);
    } catch (e) {
      setError(applyFieldErrors(e, setFieldError));
    }
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <IconTile icon={Building2} tone="primary" size="sm" />
        <div>
          <CardTitle>Organisation profile</CardTitle>
          <CardDescription>{canEdit ? "These details appear on quotations and drive defaults for new trips." : "Read-only: only owners and admins (organisation:manage) can edit the profile."}</CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Organisation name" htmlFor="org-name" error={formState.errors.name?.message} required>
            <Input id="org-name" disabled={!canEdit} {...register("name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Default currency" htmlFor="org-currency" error={formState.errors.defaultCurrency?.message} hint="Used for new trips and quotations.">
              <Select id="org-currency" disabled={!canEdit} {...register("defaultCurrency")}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone" htmlFor="org-timezone" error={formState.errors.timezone?.message} hint="IANA name, e.g. Asia/Colombo.">
              <Input id="org-timezone" list="tz-list" disabled={!canEdit} autoComplete="off" {...register("timezone")} />
              <datalist id="tz-list">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
            <Field label="Country" htmlFor="org-country" error={formState.errors.country?.message} hint="Two-letter code, e.g. LK.">
              <Input id="org-country" maxLength={2} className="uppercase" disabled={!canEdit} autoComplete="country" {...register("country")} />
            </Field>
          </div>
          <dl className="grid gap-3 rounded-md bg-muted/60 p-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Type</dt>
              <dd>{titleCase(org.organizationType)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Identifier (slug)</dt>
              <dd className="tw-num">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={org.status} />
              </dd>
            </div>
          </dl>
        </CardContent>
        {canEdit ? (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="outline" disabled={!formState.isDirty} onClick={() => reset()}>
              Reset
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
              Save profile
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

export default function OrganisationSettingsPage() {
  const can = useCan();
  const { data: session } = useSession();
  const q = useOrganization();

  if (session && !session.organization) {
    return (
      <>
        <PageHeader title="Organisation" />
        <Alert tone="info" title="No organisation selected">
          Your account is not currently working inside an organisation. Use the switcher in the top bar, or open Account settings.
        </Alert>
      </>
    );
  }
  const sub = q.data?.subscription;
  return (
    <>
      <PageHeader title="Organisation" description="Profile, plan and usage for your workspace." eyebrow="Settings" icon={Building2} />
      {q.isLoading ? <LoadingBlock label="Loading organisation" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ProfileForm org={q.data} canEdit={can("org:manage")} />
          <Card className="self-start">
            <CardHeader className="flex-row items-center gap-3">
              <IconTile icon={Gauge} tone="accent" size="sm" />
              <div>
                <CardTitle>Subscription & usage</CardTitle>
                <CardDescription>Limits are set by the platform operator.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {sub ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">{titleCase(sub.plan)} plan</Badge>
                    <StatusBadge status={sub.status} />
                  </div>
                  <UsageBar label="Seats" used={sub.seatsUsed} limit={sub.seatLimit} hint="Active team members counted against the plan." />
                  <UsageBar label="Optimisations this month" used={sub.optimisationsThisMonth} limit={sub.monthlyOptimisationLimit} hint="Optimisation runs started in the current calendar month." />
                </>
              ) : (
                <Alert tone="info">No subscription record exists for this organisation.</Alert>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
