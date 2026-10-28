"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/ui/card";
import { LogoMark } from "@/components/brand";
import { useSession } from "@/lib/session";

/** Auth gate: unauthenticated users go to /login; platform admins without a tenant go to /admin. */
export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading, error, refetch } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  React.useEffect(() => {
    if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (session?.organization?.accountKind === "individual") router.replace("/travel/trips");
    else if (session && !session.organization && session.user.platformAdmin && !pathname.startsWith("/admin") && !pathname.startsWith("/settings")) router.replace("/admin");
  }, [session, router, pathname]);

  if (error) return <div className="mx-auto max-w-lg p-8"><ErrorState error={error} onRetry={() => refetch()} title="Could not load your session" /></div>;
  if (isLoading || !session) {
    return (
      <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <LogoMark className="tw-spin-slow size-9 text-accent" />
        <div className="h-px w-48 overflow-hidden bg-border">
          <div className="tw-indeterminate h-px w-1/3 bg-accent" />
        </div>
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
