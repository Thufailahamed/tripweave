"use client";
import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ScrollHeader } from "@/components/motion";
import { RollText } from "@/features/marketing/ui";
import { isTravelerSession, useSession } from "@/lib/session";

const LINKS = [
  ["/travel#how", "How it works"],
  ["/travel#destinations", "Places"],
  ["/", "For operators"],
] as const;

/** Floating paper pill: hides while scrolling down, returns on scroll up. */
export function TravelPublicHeader() {
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);
  const signedIn = isTravelerSession(session);
  const pill = "group h-11 rounded-full px-5 text-[13px]";

  return (
    <ScrollHeader className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3 transition-[translate] duration-700 ease-out focus-within:translate-y-0 data-[hidden=1]:-translate-y-[calc(100%+32px)] md:top-5">
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-1.5">
        <nav aria-label="Traveller" className="relative flex h-14 flex-1 items-center gap-1 overflow-hidden rounded-full border border-border/80 bg-card/75 pl-5 pr-2 shadow-[0_18px_40px_-28px_rgba(45,30,15,0.5)] backdrop-blur-xl">
          <Logo href="/travel" className="shrink-0" />
          <span aria-hidden className="mx-2 hidden h-5 w-px bg-border md:block" />
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="group hidden rounded-full px-3 py-2 text-[13px] font-semibold text-foreground/65 transition-colors hover:text-accent md:inline-flex">
              <RollText text={label} />
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {signedIn ? (
              <Button asChild className={pill}>
                <Link href="/travel/trips">
                  <RollText text="My trips" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className={`${pill} hidden sm:inline-flex`}>
                  <Link href="/travel/signin">
                    <RollText text="Sign in" />
                  </Link>
                </Button>
                <Button asChild variant="accent" className={pill}>
                  <Link href="/travel/join">
                    <RollText text="Start planning" />
                  </Link>
                </Button>
              </>
            )}
            <button
              type="button"
              className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </nav>
      </div>
      {open ? (
        <div className="tw-pop pointer-events-auto mx-auto mt-2 w-full max-w-3xl rounded-[28px] border border-border/80 bg-card/95 p-5 shadow-[0_18px_40px_-28px_rgba(45,30,15,0.5)] backdrop-blur-xl md:hidden" data-state="open">
          <nav aria-label="Traveller mobile" className="flex flex-col gap-1" onClick={() => setOpen(false)}>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="tw-travel-display rounded-2xl px-3 py-2 text-3xl transition-colors hover:bg-muted hover:text-accent">
                {label}
              </Link>
            ))}
            {!signedIn ? (
              <Link href="/travel/signin" className="tw-travel-display rounded-2xl px-3 py-2 text-3xl text-accent transition-colors hover:bg-muted">
                Sign in
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </ScrollHeader>
  );
}
