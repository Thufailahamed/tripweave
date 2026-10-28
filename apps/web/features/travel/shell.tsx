"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, LogOut, Map, Menu, Plus, UserRound, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { useResetCache, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/travel/trips", label: "My trips", icon: Map },
  { href: "/travel/discover", label: "Discover", icon: Compass },
  { href: "/travel/profile", label: "Profile", icon: UserRound },
] as const;

function active(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TravelShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const reset = useResetCache();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const signOut = async () => {
    setBusy(true);
    try {
      await apiPost("/auth/logout");
    } finally {
      try {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (key?.startsWith("tw.traveler.plan.")) window.localStorage.removeItem(key);
        }
      } catch {
        /* Storage can be unavailable; signing out still proceeds. */
      }
      reset();
      router.replace("/travel/signin");
      setBusy(false);
    }
  };

  const name = session?.user.displayName ?? "Traveller";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "T";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-[#f6f1e7]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 md:px-8">
          <Logo href="/travel/trips" className="shrink-0" />
          <nav aria-label="Traveller" className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground/65 transition-colors hover:bg-card hover:text-foreground",
                  active(pathname, item.href) && "bg-card text-foreground shadow-sm",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/travel/trips/new"><Plus className="size-4" /> New trip</Link>
            </Button>
            <span className="hidden max-w-32 truncate text-sm font-semibold lg:block">{name}</span>
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{initials}</span>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-border text-foreground md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <button
              type="button"
              className="hidden size-9 place-items-center rounded-full border border-border text-foreground/60 transition-colors hover:border-destructive hover:text-destructive md:grid"
              aria-label="Sign out"
              title="Sign out"
              disabled={busy}
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t border-border bg-[#f6f1e7] px-4 py-4 md:hidden">
            <nav aria-label="Traveller mobile" className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold", active(pathname, item.href) ? "bg-card text-foreground" : "text-foreground/65")}>
                  <item.icon className="size-4" aria-hidden /> {item.label}
                </Link>
              ))}
              <Link href="/travel/trips/new" className="mt-2 flex items-center gap-3 rounded-xl bg-[#211d17] px-3 py-2.5 text-sm font-semibold text-[#fffdf8]">
                <Plus className="size-4" aria-hidden /> New trip
              </Link>
              <button type="button" onClick={() => void signOut()} className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-foreground/60">
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </nav>
          </div>
        ) : null}
      </header>
      {session && !session.user.emailVerified ? (
        <div className="border-b border-border bg-accent-soft/70">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs md:px-8">
            <p className="font-semibold text-foreground">Verify your email to keep planning across devices.</p>
            <Link href="/travel/profile" className="font-semibold text-accent hover:underline">Resend verification</Link>
          </div>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8 md:py-12">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>© {new Date().getFullYear()} TripWeave · personal trip planner</p>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/travel" className="hover:text-foreground">About</Link>
            <Link href="/" className="hover:text-foreground">For operators</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
