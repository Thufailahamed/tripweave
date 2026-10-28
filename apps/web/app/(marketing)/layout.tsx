import Link from "next/link";
import { Logo } from "@/components/brand";
import { HeaderActions } from "@/features/marketing/session-cta";
import { IMAGES, Photo } from "@/features/marketing/imagery";
import { Reveal, ScrollHeader, ScrollScene } from "@/components/motion";

function PlusLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`group inline-flex items-baseline font-semibold tracking-[-0.04em] text-foreground transition-[color,translate] duration-500 ease-out hover:text-accent ${className ?? ""}`}>
      <span aria-hidden className="text-foreground/40 transition-colors group-hover:text-accent">
        +
      </span>
      {children}
    </Link>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <ScrollHeader className="tw-header-in fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-background/30 backdrop-blur-md transition-[translate,background-color] duration-500 ease-out focus-within:translate-y-0 data-[hidden=1]:-translate-y-full data-[scrolled=1]:bg-background/80">
        <div className="flex h-16 items-stretch">
          <div className="flex items-center border-r border-white/10 px-4 md:w-[260px] md:px-8">
            <Logo />
          </div>
          <nav aria-label="Primary" className="ml-auto flex items-stretch">
            <div className="hidden items-center gap-6 px-6 text-sm sm:flex md:px-8">
              <PlusLink href="/travel">For travellers</PlusLink>
              <PlusLink href="/features">Features</PlusLink>
              <PlusLink href="/privacy">Privacy</PlusLink>
            </div>
            <div className="flex items-center gap-1 border-l border-white/10 px-3 md:px-6">
              <HeaderActions />
            </div>
          </nav>
        </div>
        <div aria-hidden className="tw-page-bar absolute inset-x-0 -bottom-px h-px bg-accent" />
      </ScrollHeader>
      <main id="content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border bg-background">
        <div className="px-4 pt-16 md:px-8 md:pt-24">
          <Reveal variant="clip">
            <ScrollScene className="h-56 overflow-hidden md:h-96">
              <div className="tw-parallax h-[125%] -translate-y-[10%]">
                <Photo image={IMAGES.footer} className="size-full" sizes="100vw" />
              </div>
            </ScrollScene>
          </Reveal>
        </div>
        <div className="grid gap-10 px-4 py-12 md:grid-cols-[1fr_1.4fr_1fr] md:px-8 md:py-16">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">Quotation and itinerary optimisation for tour operators and hotel management companies.</p>
          </div>
          <nav aria-label="Product" className="flex flex-col gap-1 text-3xl md:text-5xl">
            {[
              ["/features", "Features"],
              ["/travel", "For travellers"],
              ["/register", "Get started"],
              ["/login", "Sign in"],
            ].map(([href, label], i) => (
              <Reveal key={href} delay={i * 90}>
                <PlusLink href={href!} className="hover:translate-x-2">
                  {label}
                </PlusLink>
              </Reveal>
            ))}
          </nav>
          <p className="max-w-xs text-sm leading-relaxed text-foreground/80">Illustrative data is always labelled; live supplier rates are never invented.</p>
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>© {new Date().getFullYear()} TripWeave. All rights reserved.</p>
          <nav aria-label="Legal" className="flex gap-6">
            <Link href="/terms" className="hover:text-foreground">
              Terms of service
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
