"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiPost, errorMessage } from "@/lib/api";
import { Turnstile, turnstileEnabled } from "@/components/turnstile";

type Values = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [done, setDone] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [captcha, setCaptcha] = React.useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = React.useState(0);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema) });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    if (turnstileEnabled && !captcha) return setError("Please complete the human verification below.");
    try {
      const r = await apiPost<{ message: string }>("/auth/forgot-password", { ...v, turnstileToken: captcha ?? undefined });
      setDone(r.message);
    } catch (e) {
      setError(errorMessage(e));
      setCaptchaKey((k) => k + 1);
    }
  });
  return (
    <div>
      <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your email and we'll send a link that is valid for one hour.</p>
      {done ? (
        <div className="mt-8 flex flex-col gap-4">
          <Alert tone="success">{done}</Alert>
          <Link href="/login" className="text-sm font-semibold text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
          </Field>
          <Turnstile onToken={setCaptcha} resetKey={captchaKey} action="forgot-password" />
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Send reset link
          </Button>
          <Link href="/login" className="text-sm font-semibold text-accent hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </div>
  );
}
