"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema } from "@tripweave/shared";
import { z } from "zod";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiPost, errorMessage } from "@/lib/api";

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await apiPost("/auth/reset-password", { token, password: v.password });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  if (!token) return <Alert tone="danger" title="Invalid link">This reset link is missing its token. Request a new one.</Alert>;
  return (
    <div>
      <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Choose a new password</h1>
      {done ? (
        <div className="mt-8 flex flex-col gap-4">
          <Alert tone="success">Your password was updated. All other sessions were signed out.</Alert>
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="New password" htmlFor="password" error={formState.errors.password?.message} hint="At least 10 characters, with letters and numbers.">
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
          </Field>
          <Button type="submit" size="lg" loading={formState.isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetForm />
    </React.Suspense>
  );
}
