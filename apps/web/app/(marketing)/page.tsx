import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Building2, Coins, FileSpreadsheet, FileText, Lock, Percent, Route, ShieldCheck, Sparkles, Tags, Users } from "lucide-react";
import { CtaButtons } from "@/features/marketing/session-cta";
import { DATA_LABELS, FLOW, OBJECTIVES } from "@/features/marketing/content";
import { IMAGES, Photo } from "@/features/marketing/imagery";
import { IntroCurtain } from "@/features/marketing/intro";
import { CountUp, HorizontalScroll, Reveal, RevealWords, ScrollHighlight, ScrollScene } from "@/components/motion";

export const metadata: Metadata = {
  title: { absolute: "TripWeave – One enquiry, several quotable itineraries" },
  description: "Turn one tourist enquiry into several intelligently optimised, commercially accurate, client-ready accommodation packages in minutes.",
};

const HERO_WORD = "TripWeave";
const HERO_LINE = "One enquiry. Several costed, client-ready itineraries in minutes.";

/** Two-column section head: square-marker label on the left, large statement on the right. */
function SectionHead({ id, label, title, aside }: { id: string; label: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr] md:gap-0">
      <Reveal as="p" variant="fade" className="tw-eyebrow pt-2">
        {label}
      </Reveal>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <RevealWords id={id} text={title} className="text-4xl font-semibold leading-[1.1] tracking-[-0.06em] md:text-6xl" />
        {aside ? (
          <Reveal delay={250} className="max-w-md text-base leading-snug text-foreground/70">
            {aside}
          </Reveal>
        ) : null}
      </div>
    </div>
  );
}

const FEATURES: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; text: string }[] = [
  { icon: Route, title: "Route-aware hotel combinations", text: "Searches where to stay along a multi-stop route, accounting for nights per stop and travel between them." },
  { icon: FileSpreadsheet, title: "Contracts and rate plans", text: "Store properties, room types, seasonal rates, rules and supplier agreements, or import them from spreadsheets." },
  { icon: Percent, title: "Margins you can see and control", text: "Target margin, percentage or fixed markup, with floors, discount limits and an approval step." },
  { icon: FileText, title: "Branded quotations", text: "Versioned quotations with your name, colours and terms, PDF export and a secure client link." },
  { icon: Coins, title: "Multi-currency", text: "Quote in LKR, USD, EUR or GBP. Each quotation freezes the exchange-rate snapshot it was priced with." },
  { icon: Building2, title: "Portfolio and partner sharing", text: "Hotel management companies manage inventory and share chosen properties with partner tour operators." },
  { icon: Users, title: "Team roles and audit trail", text: "Owner, admin, manager, staff, read-only and hotel portfolio roles, with a log of significant actions." },
  { icon: Sparkles, title: "AI where it helps, never for prices", text: "Optional AI reads free-text enquiries and drafts an itinerary for review. Prices are always calculated by the system." },
];

const MARQUEE = [...OBJECTIVES.map((o) => o.label), "Branded quotations", "LKR", "USD", "EUR", "GBP", "Route-aware stays", "Deterministic pricing"];

export default function LandingPage() {
  return (
    <>
      <IntroCurtain />

      {/* hero */}
      <ScrollScene as="section" mode="exit" className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 pb-24 pt-28 text-center">
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <div className="tw-hero-media size-full">
            <Photo image={IMAGES.hero} priority className="tw-hero-img size-full" />
          </div>
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/10 to-background" />
        <div className="tw-hero-copy">
          <h1 className="text-white">
            <span className="sr-only">
              {HERO_WORD}. {HERO_LINE}
            </span>
            <span aria-hidden className="tw-display block text-[clamp(64px,15vw,200px)]">
              <span className="tw-mask">
                {[...HERO_WORD].map((ch, i) => (
                  <span key={i} className="tw-letter" style={{ "--i": i } as React.CSSProperties}>
                    {ch}
                  </span>
                ))}
              </span>
            </span>
            <span aria-hidden className="tw-in-fade mx-auto mt-4 block max-w-[22ch] text-xl font-semibold leading-[1.2] tracking-[-0.06em] md:mt-6 md:text-[28px]" style={{ "--d": "550ms" } as React.CSSProperties}>
              {HERO_LINE}
            </span>
          </h1>
          <div className="tw-in-fade mt-8 flex justify-center" style={{ "--d": "750ms" } as React.CSSProperties}>
            <CtaButtons center />
          </div>
        </div>
        <div className="tw-in-fade absolute inset-x-0 bottom-6 flex flex-col items-center gap-3 px-4" style={{ "--d": "1000ms" } as React.CSSProperties}>
          <span aria-hidden className="relative h-10 w-px overflow-hidden bg-white/15">
            <span className="tw-scroll-cue absolute inset-0 bg-white" />
          </span>
          <p className="text-xs text-white/60">For tour operators and hotel management companies · Supplier data is always labelled</p>
        </div>
      </ScrollScene>

      {/* marquee */}
      <div aria-hidden className="tw-marquee-wrap overflow-hidden border-b border-border py-6">
        <div className="tw-marquee">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {MARQUEE.map((m) => (
                <span key={m} className="flex items-center whitespace-nowrap px-6 text-3xl font-semibold tracking-[-0.06em] text-foreground/85 md:text-5xl">
                  <span className="mr-6 text-accent/70">+</span>
                  {m}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* audience */}
      <section aria-labelledby="who-h" className="border-b border-border px-4 py-20 md:px-8 md:py-32">
        <SectionHead id="who-h" label="Who it is for" title="From a loose email to a branded quotation, in one place" />
        <div className="mt-14 grid gap-px border-y border-border bg-border md:mt-20 md:grid-cols-2">
          {[
            {
              n: "01",
              title: "Tour operators",
              image: IMAGES.operators,
              text: "You answer enquiries all day and rebuild the same hotel shortlist by hand. TripWeave drafts the options, shows your margin on each, and lets you refine before the client sees anything.",
            },
            {
              n: "02",
              title: "Hotel management companies",
              image: IMAGES.hotels,
              text: "You manage a portfolio and its rates for many owners. Keep inventory in one place, control which partners see which properties, and receive their enquiries in a shared workspace.",
            },
          ].map((a, i) => (
            <Reveal as="article" key={a.n} delay={i * 120} className="group flex flex-col bg-background p-4 md:p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-semibold tracking-[-0.03em]">{a.title}</h3>
                <span className="text-sm text-muted-foreground">/ {a.n}</span>
              </div>
              <Reveal variant="clip" delay={i * 120 + 100} className="mt-4 aspect-[4/3] overflow-hidden">
                <Photo image={a.image} sizes="(min-width: 768px) 50vw, 100vw" className="size-full transition-[scale] duration-700 ease-out group-hover:scale-[1.04]" />
              </Reveal>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-foreground/70">{a.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* promises */}
      <section aria-labelledby="trust-h" className="border-b border-border px-4 py-20 md:px-8 md:py-32">
        <div className="grid gap-6 md:grid-cols-[260px_1fr] md:gap-0">
          <Reveal as="p" variant="fade" className="tw-eyebrow pt-1">
            Why you can rely on it
          </Reveal>
          <div>
            <ScrollHighlight
              as="h2"
              id="trust-h"
              className="max-w-4xl text-2xl font-medium leading-[1.25] tracking-[-0.04em] md:text-[40px]"
              text="Not just quotes — numbers you can stand behind. Money is exact, every rate says where it came from, and AI is never allowed to set a price."
            />
            <dl className="mt-16 grid gap-px border-y border-border bg-border sm:grid-cols-3">
              {(
                [
                  [5, "Distinct packages", "per optimisation, each ranked on its own objective"],
                  [4, "Quote currencies", "LKR, USD, EUR and GBP with frozen exchange rates"],
                  [6, "Team roles", "with fixed permission sets and an audit trail"],
                ] as const
              ).map(([n, label, hint], i) => (
                <Reveal key={label} delay={i * 120} className="flex flex-col gap-2 bg-background py-8 sm:px-6 sm:first:pl-0">
                  <dt className="order-2 text-lg font-medium tracking-[-0.03em]">{label}</dt>
                  <dd className="order-1 text-6xl font-semibold tracking-[-0.07em] md:text-7xl">
                    <CountUp value={n} />
                  </dd>
                  <dd className="order-3 text-sm text-muted-foreground">{hint}</dd>
                </Reveal>
              ))}
            </dl>
            <div className="mt-16 grid gap-10 md:grid-cols-3">
              {[
                { icon: ShieldCheck, title: "Deterministic pricing", text: "Money is handled in exact whole minor units. The same inputs always produce the same price." },
                { icon: Tags, title: "Labelled data", text: "Every rate says where it came from. Illustrative data is clearly marked and cannot be turned into a quotation." },
                { icon: Lock, title: "Tenant isolation", text: "Your data is scoped to you. Platform staff need a time-limited, reasoned and audited access grant." },
              ].map((p, i) => (
                <Reveal key={p.title} delay={i * 120} className="group">
                  <p.icon className="size-7 text-accent transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-[-8deg]" strokeWidth={1.4} aria-hidden />
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.03em]">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/60">{p.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* five packages: pinned horizontal track on desktop */}
      <section aria-labelledby="pk-h" className="border-b border-border">
        <HorizontalScroll
          trackClassName="lg:px-8"
          header={
            <div className="grid gap-6 px-4 pb-12 pt-20 md:px-8 lg:grid-cols-2 lg:items-end lg:pt-0">
              <RevealWords id="pk-h" text="Five packages, five intentions" className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em] md:text-6xl" />
              <Reveal delay={200} className="max-w-md text-base leading-snug text-foreground/70">
                Each optimisation produces up to five packages from the same enquiry, each ranked against a different objective. Dates, room needs and budget are mandatory for all of them.
              </Reveal>
            </div>
          }
          footer={
            <div className="hidden items-center gap-6 px-8 pt-10 lg:flex">
              <span className="text-xs text-muted-foreground">Scroll</span>
              <div className="h-px flex-1 bg-border">
                <div className="tw-hbar h-px bg-accent" />
              </div>
              <span className="tw-num text-xs text-muted-foreground">0{OBJECTIVES.length + 1}</span>
            </div>
          }
        >
          {OBJECTIVES.map((o, i) => (
            <article key={o.key} className="group flex min-h-[320px] flex-col gap-6 border-t border-border bg-background p-6 transition-colors duration-500 hover:bg-card md:p-8 lg:h-[56vh] lg:w-[400px] lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-4">
                <span className="tw-num text-sm text-muted-foreground">/ {String(i + 1).padStart(2, "0")}</span>
                <ArrowUpRight className="size-5 text-foreground/30 transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </div>
              <span aria-hidden className="tw-num text-[96px] font-semibold leading-none tracking-[-0.08em] text-transparent transition-colors duration-500 [-webkit-text-stroke:1px_rgba(255,255,255,0.22)] group-hover:[-webkit-text-stroke:1px_var(--accent)] lg:mt-auto">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-2xl font-semibold leading-tight tracking-[-0.06em] md:text-[28px]">{o.label}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-foreground/60">{o.intent}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-xs font-semibold">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {o.bias}
              </span>
            </article>
          ))}
          <article className="flex min-h-[320px] flex-col justify-end gap-6 border-t border-border bg-card p-6 md:p-8 lg:h-[56vh] lg:w-[400px] lg:border-x lg:border-t-0">
            <h3 className="text-3xl font-semibold leading-tight tracking-[-0.06em]">No feasible option?</h3>
            <p className="max-w-sm text-sm leading-relaxed text-foreground/60">If the constraints leave nothing that works, the engine says so and explains why instead of inventing one.</p>
          </article>
        </HorizontalScroll>
      </section>

      {/* flow: pinned scene on desktop, steps light up in turn */}
      <ScrollScene as="section" mode="sticky" aria-labelledby="flow-h" className="tw-flow relative border-b border-border lg:h-[300vh]">
        <div className="relative isolate flex flex-col overflow-hidden lg:sticky lg:top-0 lg:h-screen lg:justify-end">
          <div className="absolute inset-0 -z-20 overflow-hidden">
            <div className="tw-flow-media size-full">
              <Photo image={IMAGES.flow} className="size-full" />
            </div>
          </div>
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/35 to-background/95" />
          <div className="px-4 pb-10 pt-20 md:px-8 lg:pb-14">
            <p className="tw-eyebrow mb-6 text-white/80">How it works</p>
            <h2 id="flow-h" className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em] text-white md:text-7xl">
              {FLOW.map((s, i) => (
                <span key={s.n} className="tw-flow-step block" style={{ "--i": i } as React.CSSProperties}>
                  {i > 0 ? <span className="text-accent">+</span> : null}
                  {s.title}
                </span>
              ))}
            </h2>
          </div>
          <div className="relative border-t border-white/15">
            <div aria-hidden className="tw-flow-bar absolute inset-x-0 -top-px h-px bg-accent" />
            <ol className="grid md:grid-cols-4">
              {FLOW.map((s, i) => (
                <li key={s.n} className={`tw-flow-step border-white/15 px-4 py-8 backdrop-blur-sm md:px-8 ${i > 0 ? "border-t md:border-l md:border-t-0" : ""}`} style={{ "--i": i } as React.CSSProperties}>
                  <p className="text-4xl font-semibold tracking-[-0.07em] text-white md:text-5xl">{s.n}</p>
                  <p className="mt-1 text-xs text-white/50">Step</p>
                  <p className="mt-6 text-sm leading-relaxed text-white/80">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </ScrollScene>

      {/* features */}
      <section aria-labelledby="feat-h" className="border-b border-border px-4 py-20 md:px-8 md:py-32">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <RevealWords id="feat-h" text="What is in the box" className="text-4xl font-semibold leading-[1.05] tracking-[-0.06em] md:text-6xl" />
          <Reveal delay={200} className="max-w-md text-base leading-snug text-foreground/70">
            Practical tools, described honestly. Where something depends on configuration or a supplier connection, we say so.
          </Reveal>
        </div>
        <ul className="mt-16 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 4) * 90} className="group">
              <div className="flex items-start gap-3">
                <f.icon className="size-9 text-foreground transition-colors duration-500 group-hover:text-accent" strokeWidth={1.2} aria-hidden />
                <span className="tw-num text-[10px] font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div aria-hidden className="mt-6 h-px w-full bg-border">
                <div className="h-px w-0 bg-accent transition-[width] duration-700 ease-out group-hover:w-full" />
              </div>
              <h3 className="mt-6 text-base font-semibold tracking-[-0.03em]">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/60">{f.text}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal>
          <Link href="/features" className="group mt-16 inline-flex items-center gap-2 rounded-full bg-primary-soft py-3 pl-5 pr-4 text-sm font-semibold transition-colors hover:bg-white hover:text-background">
            See every feature in detail <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
        </Reveal>
      </section>

      {/* data labels */}
      <section aria-labelledby="labels-h" className="border-b border-border px-4 py-20 md:px-8 md:py-32">
        <SectionHead id="labels-h" label="Labelled data" title="Every rate carries its source" aside="So you always know how much to trust a number before you promise it to a client." />
        <dl className="mt-14 grid gap-px border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {DATA_LABELS.map((d, i) => (
            <Reveal key={d.label} delay={i * 80} className="bg-background py-6 transition-colors duration-500 hover:bg-card sm:px-6">
              <dt className="text-base font-semibold tracking-[-0.03em]">{d.label}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-foreground/60">{d.text}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* closing CTA */}
      <section className="px-4 py-20 md:px-8 md:py-32">
        <div className="grid gap-6 md:grid-cols-[260px_1fr] md:gap-0">
          <Reveal as="p" variant="fade" className="tw-eyebrow pt-2">
            Get started
          </Reveal>
          <div>
            <RevealWords text="Set up your organisation and run your first optimisation today" className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.06em] md:text-7xl" />
            <Reveal delay={300}>
              <p className="mt-6 max-w-xl text-base text-foreground/70">Registration takes a minute. You become the owner and can invite your team afterwards.</p>
              <div className="mt-10">
                <CtaButtons />
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
