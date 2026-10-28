import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Backpack, BedDouble, CalendarDays, Map, NotebookPen, Share2, Sparkles, Wallet } from "lucide-react";
import { DestinationPhoto, PhotoCreditLine } from "@/features/planning/components/destination-photo";
import { TravelPublicCta } from "@/features/travel/public-cta";

export const metadata: Metadata = {
  title: { absolute: "TripWeave for travellers – plan the trip you keep thinking about" },
  description: "Describe the trip you want. TripWeave turns it into a day-by-day plan, stay ideas, a budget, a packing list and one link to share.",
};

const STEPS = [
  { n: "01", title: "Tell us the shape of it", text: "A few dates, who is coming, a budget and the things you do not want to miss. Write it like a message to a friend." },
  { n: "02", title: "Get a real plan back", text: "A day-by-day route with places, timings and ideas you can move, swap or slow down — not a wall of links." },
  { n: "03", title: "Keep the whole trip together", text: "Stay ideas, a running budget, a packing list and a link your travel companions can open." },
];

const FEATURES = [
  { icon: Sparkles, title: "A plan, not a chat", text: "The assistant composes a travel page you can read, with days, maps, places and practical notes. Every price still comes from the server." },
  { icon: BedDouble, title: "Stays that fit the route", text: "Ask for stay ideas along your actual route. See the places, the price and how each option fits your budget before you decide." },
  { icon: Wallet, title: "A budget you can keep", text: "Add transport, stays, food and activities. See what is paid, what is left and whether the trip still fits." },
  { icon: Backpack, title: "A packing list with a memory", text: "Generate a list from your route and activities, then tick things off. It survives the next edit and the next trip." },
  { icon: NotebookPen, title: "Somewhere for the details", text: "Train times, a restaurant someone mentioned, the name of the guesthouse. Keep it beside the plan, not in six chats." },
  { icon: Share2, title: "One link for the group", text: "Share a clean read-only page with your route, dates and — if you want — the budget. Print it or save it as a PDF." },
];

const DAYS = [
  { day: "Day 1", title: "Arrive in Kandy", text: "Market walk, lake loop, a slow dinner above the valley.", photo: "Kandy" },
  { day: "Day 2", title: "Tea country", text: "Train through the hills, a tea factory, the quiet end of Ella.", photo: "Ella" },
  { day: "Day 3", title: "The coast", text: "South to the fort at Galle, then nowhere in particular.", photo: "Galle" },
];

const PLACES = ["Kandy", "Ella", "Galle", "Sigiriya"];

export default function TravelLandingPage() {
  return (
    <>
      <section className="relative overflow-hidden px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[1.06fr_0.94fr]">
          <div>
            <p className="tw-travel-eyebrow">TripWeave for travellers</p>
            <h1 className="tw-travel-display mt-5 max-w-[12ch] text-[clamp(3.3rem,7vw,6.4rem)] leading-[0.92] tracking-[-0.055em]">
              Your next trip, <span className="text-accent">woven</span> together.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground/70">
              Describe the trip you keep thinking about. Get a day-by-day plan, stay ideas along the route, a budget that stays honest, and a packing list you will actually use.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <TravelPublicCta label="Plan your trip" />
              <Link href="#how" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">
                See how it works <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Free to start · no card · your trip stays yours.</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="tw-travel-photo aspect-[4/5] translate-y-8">
                <DestinationPhoto destination="Kandy" alt="Kandy, Sri Lanka" className="size-full" placeholder="art" eager />
              </div>
              <div className="tw-travel-photo aspect-[4/5]">
                <DestinationPhoto destination="Ella" alt="Ella, Sri Lanka" className="size-full" placeholder="art" eager />
              </div>
            </div>
            <div className="tw-travel-card absolute -bottom-4 left-4 right-4 p-4 md:-left-8 md:right-10 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="tw-travel-eyebrow">A sample plan</p>
                  <p className="tw-travel-display mt-1 text-2xl">Three days in the hills</p>
                </div>
                <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent"><Map className="size-4" /></span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {DAYS.map((day) => (
                  <div key={day.day} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2">
                    <span className="tw-travel-eyebrow mt-1 w-12 shrink-0">{day.day}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{day.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{day.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute -left-10 top-8 size-24 rounded-full border border-accent/20" />
          </div>
        </div>
      </section>

      <section id="how" className="border-y border-border bg-[#f1eadc]/70 px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <p className="tw-travel-eyebrow">How it works</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <h2 className="tw-travel-display max-w-[15ch] text-4xl leading-[1.02] tracking-[-0.04em] md:text-6xl">From a loose idea to a trip you can hold.</h2>
            <p className="max-w-md text-base leading-relaxed text-foreground/65">Start with a sentence. TripWeave turns it into something structured, then keeps the parts you like. You stay in charge of the route; the system keeps the dates, prices and details straight.</p>
          </div>
          <div className="mt-14 grid gap-px border-y border-border bg-border md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="bg-[#f6f1e7] p-6 md:p-8">
                <p className="tw-travel-display text-4xl text-accent/70">{step.n}</p>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="tw-travel-photo relative aspect-[4/5] max-h-[640px]">
            <DestinationPhoto destination="Ella" alt="The hills around Ella" className="size-full" placeholder="art" />
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/30 bg-[#211d17]/80 p-4 text-[#fffdf8] backdrop-blur">
              <p className="tw-travel-hand text-2xl">the train is the point</p>
              <p className="mt-1 text-xs text-white/70">A note from your plan, not a booking.</p>
            </div>
          </div>
          <div>
            <p className="tw-travel-eyebrow">A travel page, not a transcript</p>
            <h2 className="tw-travel-display mt-4 max-w-[13ch] text-4xl leading-[1.02] tracking-[-0.04em] md:text-6xl">Every day has a shape.</h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground/65">
              The planner writes an interface, not a paragraph. Days, places, maps, budget notes and choices arrive as a composed page from a fixed set of safe travel blocks. You can ask for slower mornings, a different base, or one more day at the coast.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {DAYS.map((day) => (
                <div key={day.day} className="tw-travel-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><CalendarDays className="size-4" /></span>
                    <div>
                      <p className="tw-travel-eyebrow">{day.day}</p>
                      <p className="text-sm font-semibold">{day.title}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{day.text}</p>
                </div>
              ))}
            </div>
            <Link href="#destinations" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
              Find a place to start <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-[#f1eadc]/70 px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <p className="tw-travel-eyebrow">Everything in one place</p>
          <h2 className="tw-travel-display mt-4 max-w-[14ch] text-4xl leading-[1.02] tracking-[-0.04em] md:text-6xl">The trip, not just the itinerary.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="tw-travel-card flex flex-col gap-4 p-6">
                <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><feature.icon className="size-5" /></span>
                <div>
                  <h3 className="text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="destinations" className="px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="tw-travel-eyebrow">Start somewhere</p>
              <h2 className="tw-travel-display mt-4 text-4xl leading-[1.02] tracking-[-0.04em] md:text-6xl">A few places to borrow.</h2>
            </div>
            <TravelPublicCta label="Start with a place" accent />
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLACES.map((place) => (
              <div key={place} className="group">
                <Link href="/travel/join">
                  <div className="tw-travel-photo aspect-[4/5]">
                    <DestinationPhoto destination={place} alt={place} className="size-full" placeholder="art" />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="tw-travel-display text-2xl">{place}</p>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                  </div>
                </Link>
                <PhotoCreditLine destination={place} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 md:px-8 md:pb-28">
        <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] bg-[#211d17] px-6 py-14 text-[#fffdf8] md:px-14 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f0c9b7]">The next trip is the good part</p>
              <h2 className="tw-travel-display mt-5 max-w-[16ch] text-4xl leading-[0.98] tracking-[-0.045em] md:text-6xl">Go on. Tell us where you are thinking.</h2>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/65">Free to start. Bring a date, a budget, a person or just a place name. The plan can change as often as you do.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <TravelPublicCta accent label="Plan your trip" />
              <Link href="/travel/signin" className="inline-flex items-center rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
