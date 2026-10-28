import Link from "next/link";
import { Logo } from "@/components/brand";
import { TravelPublicHeader } from "@/features/travel/public-header";

export default function TravelPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TravelPublicHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border bg-[#f1eadc]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr] md:px-8 md:py-16">
          <div>
            <Logo href="/travel" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              A quieter way to plan a trip: a day-by-day plan, stay ideas, a budget, a packing list and one link to share.
            </p>
          </div>
          <nav aria-label="Travel product" className="flex flex-col gap-2 text-sm">
            <p className="tw-travel-eyebrow">Plan</p>
            <Link href="/travel/join" className="font-semibold hover:text-accent">Create an account</Link>
            <Link href="/travel/signin" className="font-semibold hover:text-accent">Sign in</Link>
            <Link href="/travel#how" className="font-semibold hover:text-accent">How it works</Link>
          </nav>
          <nav aria-label="Company" className="flex flex-col gap-2 text-sm">
            <p className="tw-travel-eyebrow">TripWeave</p>
            <Link href="/" className="font-semibold hover:text-accent">For tour operators</Link>
            <Link href="/privacy" className="font-semibold hover:text-accent">Privacy</Link>
            <Link href="/terms" className="font-semibold hover:text-accent">Terms</Link>
          </nav>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
            <p>© {new Date().getFullYear()} TripWeave. Made for the trip you keep thinking about.</p>
            <p>Stay prices are indicative or supplier-checked, never invented. Nothing here is a booking.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
