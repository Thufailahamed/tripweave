"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { passwordSchema } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiPost, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { titleCase } from "@/lib/utils";
import { applyFieldErrors } from "@/features/settings/shared";
import { MfaCard } from "@/features/settings/mfa-card";

const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password").max(200), newPassword: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password different from the current one" });
type PasswordValues = z.infer<typeof changePasswordSchema>;

function ChangePasswordCard() {
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, setError: setFieldError, formState } = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema) as never,
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const change = useMutation({
    mutationFn: (v: PasswordValues) => apiPost("/auth/change-password", { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      toast.success("Password changed. Other devices have been signed out.");
      reset();
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await change.mutateAsync(v);
    } catch (e) {
      setError(applyFieldErrors(e, (name, err) => setFieldError(name as keyof PasswordValues, err)));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Use at least 10 characters with letters and numbers. Changing it signs you out of every other device.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="flex max-w-md flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Current password" htmlFor="pw-current" error={formState.errors.currentPassword?.message} required>
            <Input id="pw-current" type="password" autoComplete="current-password" {...register("currentPassword")} />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={formState.errors.newPassword?.message} required>
            <Input id="pw-new" type="password" autoComplete="new-password" {...register("newPassword")} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" error={formState.errors.confirmPassword?.message} required>
            <Input id="pw-confirm" type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </Field>
          <div>
            <Button type="submit" loading={change.isPending}>
              Change password
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const [switching, setSwitching] = React.useState<string | null>(null);
  const switchOrg = useMutation({
    mutationFn: (organizationId: string) => apiPost("/auth/switch-organization", { organizationId }),
    onMutate: (id) => setSwitching(id),
    onSuccess: () => {
      qc.clear();
      router.push("/dashboard");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setSwitching(null),
  });

  if (!session) return <LoadingBlock label="Loading account" />;
  const currentOrg = session.organization?.id;
  return (
    <>
      <PageHeader title="Account" eyebrow="Settings" icon={KeyRound} description="Your sign-in details and the organisations you belong to." />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Name</dt>
                <dd className="font-semibold">{session.user.displayName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                <dd className="break-all">{session.user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Access</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {session.organization ? <Badge tone="primary">{titleCase(session.organization.role)} in {session.organization.name}</Badge> : <Badge>No active organisation</Badge>}
                  {session.user.platformAdmin ? <Badge tone="accent">Platform admin</Badge> : null}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <ChangePasswordCard />
        <MfaCard />

        <Card>
          <CardHeader>
            <CardTitle>Your organisations</CardTitle>
            <CardDescription>Switching changes which organisation's data you see and clears cached data from the previous one.</CardDescription>
          </CardHeader>
          <CardContent>
            {session.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">You are not a member of any organisation.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {session.memberships.map((m) => {
                  const current = m.organizationId === currentOrg;
                  return (
                    <li key={m.organizationId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{m.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{titleCase(m.type)}</span>
                          <Badge tone="outline">{titleCase(m.role)}</Badge>
                          {m.status !== "active" ? <StatusBadge status={m.status} /> : null}
                        </p>
                      </div>
                      {current ? (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                          <Check className="size-4" aria-hidden /> Current
                        </span>
                      ) : (
                        <Button variant="outline" size="sm" loading={switching === m.organizationId} disabled={switchOrg.isPending} onClick={() => switchOrg.mutate(m.organizationId)}>
                          Switch to this organisation
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
