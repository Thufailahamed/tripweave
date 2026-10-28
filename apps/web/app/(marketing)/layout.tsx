import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand";
import { HeaderActions } from "@/features/marketing/session-cta";
import { Label, RollText } from "@/features/marketing/ui";
import { Reveal, ScrollHeader } from "@/components/motion";

const NAV = [
  ["/travel", "For travellers"],
  ["/features", "Features"],
  ["/privacy", "Privacy"],
] as const;

const WORDMARK = "TripWeave";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* floating pill navigation: hides while scrolling down, returns on scroll up */}
      <ScrollHeader className="tw-header-in pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-3 transition-[translate] duration-700 ease-out focus-within:translate-y-0 data-[hidden=1]:-translate-y-[calc(100%+32px)] md:top-5">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <nav aria-label="Primary" className="relative flex h-12 items-center gap-1 overflow-hidden rounded-full border border-white/10 bg-card/70 pl-4 pr-2 backdrop-blur-xl md:pl-5">
            <Logo className="[&_span]:text-lg md:[&_span]:text-xl" />
            <span aria-hidden className="mx-2 hidden h-5 w-px bg-white/10 sm:block" />
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="group hidden rounded-full px-3 py-2 text-[13px] font-medium text-white/75 transition-colors hover:text-white sm:inline-flex">
                <RollText text={label} />
              </Link>
            ))}
            <span aria-hidden className="tw-page-bar absolute inset-x-5 bottom-0 h-px bg-accent" />
          </nav>
          <HeaderActions />
        </div>
      </ScrollHeader>
      <main id="content" className="flex-1">
        {children}
      </main>
      <footer className="px-3 pb-3 md:px-5 md:pb-5">
        <div className="grid gap-3 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-between gap-10 rounded-[28px] bg-card p-6 md:p-10">
            <div>
              <Logo />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">Quotation and itinerary optimisation for tour operators and hotel management companies.</p>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-white/45">Illustrative data is always labelled; live supplier rates are never invented.</p>
          </div>
          <nav aria-label="Product" className="flex flex-col rounded-[28px] bg-card p-6 md:p-10">
            <Label>Explore</Label>
            <ul className="mt-6 flex flex-col">
              {[
                ["/features", "Features"],
                ["/travel", "For travellers"],
                ["/register", "Get started"],
                ["/login", "Sign in"],
              ].map(([href, label]) => (
                <li key={href} className="border-b border-white/10 last:border-0">
                  <Link href={href!} className="group flex items-center justify-between py-3 text-2xl font-semibold tracking-[-0.04em] transition-colors hover:text-accent md:text-3xl">
                    <RollText text={label!} />
                    <ArrowUpRight className="size-5 text-white/30 transition-[translate,color] duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <Reveal as="p" variant="fade" aria-hidden className="tw-words tw-giant tw-wide mt-3 select-none overflow-hidden whitespace-nowrap rounded-[28px] bg-card px-4 pb-5 pt-9 text-center text-[clamp(32px,11.4vw,200px)] leading-[0.8] md:px-8 md:pb-8 md:pt-12">
          {[...WORDMARK].map((ch, i) => (
            <span key={i} className="w">
              <span style={{ "--i": i } as React.CSSProperties}>{ch}</span>
            </span>
          ))}
        </Reveal>
        <div className="flex flex-col gap-3 px-2 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-4">
          <p>© {new Date().getFullYear()} TripWeave. All rights reserved.</p>
          <nav aria-label="Legal" className="flex gap-6">
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms of service
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
