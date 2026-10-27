"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api";
import { SESSION_KEY } from "@/lib/session";

type State = { status: "verifying" } | { status: "done" } | { status: "failed"; message: string };

function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const qc = useQueryClient();
  const [state, setState] = React.useState<State>(token ? { status: "verifying" } : { status: "failed", message: "This link is missing its token. Open the link from your email again, or request a new email from inside the app." });
  const started = React.useRef(false);

  React.useEffect(() => {
    // Tokens are single-use: guard against React running this effect twice in development.
    if (!token || started.current) return;
    started.current = true;
    apiPost("/auth/verify-email", { token })
      .then(() => {
        setState({ status: "done" });
        return qc.invalidateQueries({ queryKey: SESSION_KEY });
      })
      .catch((e) => setState({ status: "failed", message: errorMessage(e) }));
  }, [token, qc]);

  return (
    <div>
      <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em]">Verify your email</h1>
      <div className="mt-8 flex flex-col gap-4">
        {state.status === "verifying" ? <p role="status" className="text-sm text-muted-foreground">Verifying your email address…</p> : null}
        {state.status === "done" ? (
          <>
            <Alert tone="success">Your email address is verified. Thank you.</Alert>
            <Button asChild size="lg">
              <Link href="/dashboard">Continue to TripWeave</Link>
            </Button>
          </>
        ) : null}
        {state.status === "failed" ? (
          <>
            <Alert tone="danger">{state.message}</Alert>
            <p className="text-sm text-muted-foreground">Sign in and use the banner at the top of the page to send a new verification email.</p>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense>
      <VerifyEmail />
    </React.Suspense>
  );
}
