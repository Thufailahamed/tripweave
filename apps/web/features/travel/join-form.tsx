"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { travelerRegisterSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { SESSION_KEY, type SessionData } from "@/lib/session";

type Values = z.input<typeof travelerRegisterSchema>;

const COUNTRIES = [
  ["LK", "Sri Lanka"], ["IN", "India"], ["GB", "United Kingdom"], ["US", "United States"], ["AU", "Australia"],
  ["CA", "Canada"], ["NZ", "New Zealand"], ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"],
  ["ES", "Spain"], ["IT", "Italy"], ["PT", "Portugal"], ["SE", "Sweden"], ["CH", "Switzerland"],
  ["IE", "Ireland"], ["AE", "United Arab Emirates"], ["SG", "Singapore"], ["JP", "Japan"], ["ZA", "South Africa"],
] as const;

export function TravelerJoinForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = React.useState(0);
  const platform = useQuery({ queryKey: ["platform-config"], queryFn: () => apiGet<{ signupsEnabled: boolean; maintenanceMode: boolean; supportEmail: string }>("/public/platform"), staleTime: 60_000, retry: false });
  const closed = !!platform.data && (!platform.data.signupsEnabled || platform.data.maintenanceMode);
  const { register, handleSubmit, setError: setFieldError, formState } = useForm<Values>({
    resolver: zodResolver(travelerRegisterSchema) as never,
    defaultValues: { country: "LK", defaultCurrency: "USD", timezone: "Asia/Colombo", homeCity: "", interests: [], pace: "balanced" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    if (turnstileEnabled && !captcha) return setError("Please complete the human verification below.");
    try {
      const session = await apiPost<SessionData>("/auth/register-traveler", { ...values, turnstileToken: captcha ?? undefined });
      qc.clear();
      qc.setQueryData(SESSION_KEY, session);
      router.replace("/travel/trips/new?welcome=1");
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) setFieldError(path as keyof Values, { message });
      setError(errorMessage(e));
      setCaptchaKey((key) => key + 1);
    }
  });

  return (
    <div className="w-full max-w-lg">
      <p className="tw-travel-eyebrow">Your personal trip planner</p>
      <h1 className="tw-travel-display mt-3 text-5xl leading-[0.98] tracking-[-0.045em]">Start with one trip.</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">No organisation, no team setup. Just a place for the trip you are thinking about.</p>
      {platform.data?.maintenanceMode ? (
        <Alert tone="warning" className="mt-5" title="Registration is paused">TripWeave is undergoing scheduled maintenance. Please try again shortly{platform.data.supportEmail ? `, or contact ${platform.data.supportEmail}` : ""}.</Alert>
      ) : platform.data && !platform.data.signupsEnabled ? (
        <Alert tone="info" className="mt-5" title="Registration is currently closed">New accounts are temporarily closed. Please check back shortly.</Alert>
      ) : null}
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="displayName" error={formState.errors.displayName?.message} required>
            <Input id="displayName" autoComplete="name" {...register("displayName")} />
          </Field>
          <Field label="Home city" htmlFor="homeCity" error={formState.errors.homeCity?.message} hint="Optional">
            <Input id="homeCity" autoComplete="address-level2" {...register("homeCity")} />
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message} hint="At least 10 characters, with letters and numbers." required>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" htmlFor="country" error={formState.errors.country?.message}>
            <Select id="country" autoComplete="country" {...register("country")}>
              {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Default currency" htmlFor="defaultCurrency" error={formState.errors.defaultCurrency?.message}>
            <Select id="defaultCurrency" {...register("defaultCurrency")}>
              {["USD", "EUR", "GBP", "LKR"].map((currency) => <option key={currency}>{currency}</option>)}
            </Select>
          </Field>
        </div>
        <Turnstile onToken={setCaptcha} resetKey={captchaKey} action="register-traveler" />
        <Button type="submit" size="lg" loading={formState.isSubmitting} disabled={closed}>Create my account</Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By continuing you agree to the <Link href="/terms" className="tw-travel-link">Terms</Link> and <Link href="/privacy" className="tw-travel-link">Privacy Policy</Link>. Your trips stay private until you share them.
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <Link href="/travel/signin" className="font-semibold text-accent hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
