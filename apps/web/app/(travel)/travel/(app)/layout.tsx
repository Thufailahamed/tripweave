"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand";
import { Alert, ErrorState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TravelShell } from "@/features/travel/shell";
import { useSession } from "@/lib/session";

export default function TravelAppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading, error, refetch } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (session === null) router.replace(`/travel/signin?next=${encodeURIComponent(pathname)}`);
  }, [session, router, pathname]);

  if (error) {
    return <div className="mx-auto max-w-lg p-8"><ErrorState error={error} onRetry={() => refetch()} title="Could not load your account" /></div>;
  }
  if (isLoading || !session) {
    return (
      <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <LogoMark className="tw-spin-slow size-9 text-accent" />
        <div className="h-px w-48 overflow-hidden bg-border">
          <div className="tw-indeterminate h-px w-1/3 bg-accent" />
        </div>
        <p className="text-sm text-muted-foreground">Opening your trips…</p>
      </div>
    );
  }
  if (session.organization?.accountKind !== "individual") {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
        <Alert tone="info" title="This is the personal trip planner">
          You are signed in to a business workspace. Personal trips live in their own space so operator pricing, margins and clients never mix with them.
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild><Link href="/dashboard">Open the operator workspace</Link></Button>
          <Button asChild variant="outline"><Link href="/travel">Back to the traveller home</Link></Button>
        </div>
      </div>
    );
  }
  return <TravelShell>{children}</TravelShell>;
}
