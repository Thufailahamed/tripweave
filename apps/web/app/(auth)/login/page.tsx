"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { loginSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiPost, errorMessage } from "@/lib/api";
import { SESSION_KEY, type SessionData } from "@/lib/session";

type Values = z.infer<typeof loginSchema>;
interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  expiresInSeconds: number;
}
const isChallenge = (r: SessionData | MfaChallenge): r is MfaChallenge => (r as MfaChallenge).mfaRequired === true;

function SecondFactorForm({ mfaToken, onDone, onRestart }: { mfaToken: string; onDone: (s: SessionData) => void; onRestart: () => void }) {
  const [useRecovery, setUseRecovery] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onDone(await apiPost<SessionData>("/auth/mfa/verify", { mfaToken, ...(useRecovery ? { recoveryCode: value.trim() } : { code: value.replace(/\s/g, "") }) }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Two-step verification</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {useRecovery ? "Enter one of your saved recovery codes. Each code works once." : "Enter the 6-digit code from your authenticator app."}
      </p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label={useRecovery ? "Recovery code" : "Authentication code"} htmlFor="mfa-code">
          <Input
            id="mfa-code"
            key={useRecovery ? "recovery" : "totp"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="one-time-code"
            inputMode={useRecovery ? "text" : "numeric"}
            placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
            maxLength={useRecovery ? 16 : 7}
          />
        </Field>
        <Button type="submit" size="lg" loading={busy} disabled={value.trim().length < 6}>
          Verify and sign in
        </Button>
        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="font-semibold text-accent hover:underline"
            onClick={() => {
              setUseRecovery((v) => !v);
              setValue("");
              setError(null);
            }}
          >
            {useRecovery ? "Use authenticator code" : "Use a recovery code"}
          </button>
          <button type="button" className="font-semibold text-accent hover:underline" onClick={onRestart}>
            Start over
          </button>
        </div>
      </form>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(loginSchema) });
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const finish = (session: SessionData) => {
    qc.clear();
    qc.setQueryData(SESSION_KEY, session);
    router.replace(!session.organization && session.user.platformAdmin ? "/admin" : safeNext);
  };

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const result = await apiPost<SessionData | MfaChallenge>("/auth/login", v);
      if (isChallenge(result)) setChallenge(result.mfaToken);
      else finish(result);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (challenge) {
    return (
      <SecondFactorForm
        mfaToken={challenge}
        onDone={finish}
        onRestart={() => {
          setChallenge(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div>
      <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your TripWeave workspace.</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!formState.errors.email} {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        </Field>
        <Button type="submit" size="lg" loading={formState.isSubmitting}>
          Sign in
        </Button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
            Forgot password?
          </Link>
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Create an organisation
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
