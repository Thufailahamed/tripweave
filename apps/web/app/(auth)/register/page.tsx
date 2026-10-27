"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { registerSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { SESSION_KEY, type SessionData } from "@/lib/session";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";
import { cn } from "@/lib/utils";

type Input_ = z.input<typeof registerSchema>;

const TYPES = [
  { value: "tour_operator", title: "Tour operator", text: "Plan itineraries, optimise hotels and quote clients." },
  { value: "hotel_management", title: "Hotel management company", text: "Manage a portfolio, rates and partner sharing." },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = React.useState(0);
  const platform = useQuery({ queryKey: ["platform-config"], queryFn: () => apiGet<{ signupsEnabled: boolean; maintenanceMode: boolean; supportEmail: string }>("/public/platform"), staleTime: 60_000, retry: false });
  const registrationClosed = !!platform.data && (!platform.data.signupsEnabled || platform.data.maintenanceMode);
  const { register, handleSubmit, watch, setValue, setError: setFieldError, formState } = useForm<Input_>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: { organizationType: "tour_operator", country: "LK", defaultCurrency: "USD", timezone: "Asia/Colombo" },
  });
  const type = watch("organizationType");

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    if (turnstileEnabled && !captcha) return setError("Please complete the human verification below.");
    try {
      const session = await apiPost<SessionData>("/auth/register", { ...v, turnstileToken: captcha ?? undefined });
      qc.clear();
      qc.setQueryData(SESSION_KEY, session);
      router.replace("/dashboard");
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof Input_, { message });
      setError(errorMessage(e));
      setCaptchaKey((k) => k + 1); // a Turnstile token is single-use
    }
  });

  return (
    <div>
      <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Create your organisation</h1>
      <p className="mt-1 text-sm text-muted-foreground">You become the owner and can invite your team afterwards.</p>
      {platform.data?.maintenanceMode ? <Alert tone="warning" className="mt-4" title="Registration is paused">TripWeave is undergoing scheduled maintenance. Please try again shortly{platform.data.supportEmail ? `, or contact ${platform.data.supportEmail}` : ""}.</Alert> : !platform.data?.signupsEnabled && platform.data ? <Alert tone="info" className="mt-4" title="Registration is currently closed">New organisations can only be created by the platform team. Contact support if you need an account.</Alert> : null}
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organisation type</legend>
          {TYPES.map((t) => (
            <label key={t.value} className={cn("cursor-pointer rounded-lg border p-3 text-left transition-colors", type === t.value ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-muted")}>
              <input type="radio" className="sr-only" checked={type === t.value} onChange={() => setValue("organizationType", t.value)} />
              <span className="block text-sm font-semibold">{t.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t.text}</span>
            </label>
          ))}
        </fieldset>
        <Field label="Organisation name" htmlFor="organizationName" error={formState.errors.organizationName?.message} required>
          <Input id="organizationName" autoComplete="organization" {...register("organizationName")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="displayName" error={formState.errors.displayName?.message} required>
            <Input id="displayName" autoComplete="name" {...register("displayName")} />
          </Field>
          <Field label="Default currency" htmlFor="defaultCurrency">
            <Select id="defaultCurrency" {...register("defaultCurrency")}>
              {["USD", "EUR", "GBP", "LKR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Work email" htmlFor="email" error={formState.errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message} hint="At least 10 characters, with letters and numbers." required>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Turnstile onToken={setCaptcha} resetKey={captchaKey} action="register" />
        <Button type="submit" size="lg" loading={formState.isSubmitting} disabled={registrationClosed}>
          Create organisation
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
          . By continuing you agree to the{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
