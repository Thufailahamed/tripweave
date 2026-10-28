"use client";
import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { isTravelerSession, useSession } from "@/lib/session";

export function TravelPublicHeader() {
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);
  const signedIn = isTravelerSession(session);

  const links = (
    <>
      <Link href="/travel#how" className="text-sm font-semibold text-foreground/70 transition-colors hover:text-accent">
        How it works
      </Link>
      <Link href="/travel#destinations" className="text-sm font-semibold text-foreground/70 transition-colors hover:text-accent">
        Places
      </Link>
      <Link href="/" className="text-sm font-semibold text-foreground/70 transition-colors hover:text-accent">
        For operators
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-[#f6f1e7]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 md:px-8">
        <Logo href="/travel" className="shrink-0" />
        <nav aria-label="Traveller" className="ml-auto hidden items-center gap-7 md:flex">
          {links}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {signedIn ? (
            <Button asChild size="sm">
              <Link href="/travel/trips">My trips</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/travel/signin">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/travel/join">Start planning</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border border-border text-foreground md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-border bg-[#f6f1e7] px-4 py-4 md:hidden">
          <nav aria-label="Traveller mobile" className="flex flex-col gap-4" onClick={() => setOpen(false)}>
            {links}
            {!signedIn ? (
              <Link href="/travel/signin" className="text-sm font-semibold text-accent">
                Sign in
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
