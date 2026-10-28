"use client";
import * as React from "react";
import { SignInForm } from "@/features/auth/sign-in-form";

export default function LoginPage() {
  return (
    <React.Suspense>
      <SignInForm variant="operator" defaultNext="/dashboard" joinHref="/register" joinLabel="Create an organisation" />
    </React.Suspense>
  );
}
