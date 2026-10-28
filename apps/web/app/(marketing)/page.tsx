import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Building2, Check, Coins, FileSpreadsheet, FileText, Lock, Percent, Route, Send, ShieldCheck, Sparkles, Tags, Users } from "lucide-react";
import { CtaButtons } from "@/features/marketing/session-cta";
import { DATA_LABELS, FLOW, OBJECTIVES } from "@/features/marketing/content";
import { IMAGES, Photo, type MarketingImage } from "@/features/marketing/imagery";
import { IntroCurtain } from "@/features/marketing/intro";
import { PackageList } from "@/features/marketing/package-list";
import { Hex, Label, RollText } from "@/features/marketing/ui";
import { CountUp, Reveal, RevealWords, ScrollHighlight, ScrollScene, ScrollSteps, VelocityMarquee } from "@/components/motion";

export const metadata: Metadata = {
  title: { absolute: "TripWeave – One enquiry, several quotable itineraries" },
  description: "Turn one tourist enquiry into several intelligently optimised, commercially accurate, client-ready accommodation packages in minutes.",
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Illustrative figures for the product mock-ups. They are labelled as such wherever they appear. */
const MOCK_PACKAGES = [
  { label: OBJECTIVES[0]!.label, price: "1,286", width: 58 },
  { label: OBJECTIVES[1]!.label, price: "1,512", width: 70, pick: true },
  { label: OBJECTIVES[2]!.label, price: "1,694", width: 78 },
  { label: OBJECTIVES[3]!.label, price: "2,340", width: 100 },
  { label: OBJECTIVES[4]!.label, price: "1,458", width: 66 },
];
const MOCK_ROUTE = [
  { place: "Colombo", nights: 1 },
  { place: "Sigiriya", nights: 2 },
  { place: "Kandy", nights: 2 },
  { place: "Ella", nights: 2 },
];

/** Atmosphere photography behind each "how it works" step. */
const STEP_IMAGES = [IMAGES.colombo, IMAGES.flow, IMAGES.sigiriya, IMAGES.beach];

/** Moving photo gallery: decorative scenes only, captioned with what they show. */
const GALLERY: { image: MarketingImage; caption: string }[] = [
  { image: IMAGES.stilts, caption: "Stilt fishing, south coast" },
  { image: IMAGES.elephants, caption: "Elephants at the river" },
  { image: IMAGES.sigiriya, caption: "Sigiriya from above" },
  { image: IMAGES.coconut, caption: "A palm swing at sunset" },
  { image: IMAGES.temple, caption: "Boats below the temple" },
  { image: IMAGES.flow, caption: "Hill-country tea" },
  { image: IMAGES.beach, caption: "Boats on the sand" },
  { image: IMAGES.operators, caption: "The blue train" },
];

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

/* ---------------------------------------------------------------- hero */

function HeroWord({ word, from }: { word: string; from: number }) {
  return (
    <span className="tw-mask">
      {[...word].map((ch, i) => (
        <span key={i} className="tw-letter" style={{ "--i": from + i } as Vars}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/** A photo set into the headline as a rounded pill that opens after the words have risen. */
function PhotoPill({ image, delay, className }: { image: MarketingImage; delay: number; className?: string }) {
  return (
    <span aria-hidden className={`tw-pill mx-[0.14em] h-[0.8em] w-[1.75em] -translate-y-[0.04em] overflow-hidden rounded-full align-middle ${className ?? "inline-block"}`} style={{ "--d": `${delay}ms` } as Vars}>
      <Photo image={image} decorative priority sizes="240px" className="size-full" />
    </span>
  );
}

/** Desk-tilted product card: the enquiry on the left, ranked packages on the right. */
function HeroCard() {
  return (
    <div className="tw-tilt relative mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-background/85 p-2 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 truncate text-[11px] text-white/45">Enquiry · Culture &amp; tea country · 2 adults · 7 nights</span>
        <span className="ml-auto shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/50">Illustrative</span>
      </div>
      <div className="grid gap-2 md:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[22px] bg-card p-5 text-left">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">Route</p>
          <ol className="relative mt-5 flex flex-col gap-5">
            <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-gradient-to-b from-accent via-accent/40 to-white/10" />
            {MOCK_ROUTE.map((s, i) => (
              <li key={s.place} className="tw-in-fade relative flex items-center gap-4 pl-6" style={{ "--d": `${900 + i * 120}ms` } as Vars}>
                <span className={`absolute left-0 size-[11px] rounded-full border-2 border-card ${i === 0 ? "tw-ping bg-accent" : "bg-accent/70"}`} />
                <span className="text-sm font-semibold">{s.place}</span>
                <span className="ml-auto text-xs text-white/40">
                  {s.nights} {s.nights === 1 ? "night" : "nights"}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 hidden gap-1.5 md:grid md:grid-cols-3">
            {[IMAGES.sigiriya, IMAGES.flow, IMAGES.operators].map((img) => (
              <Photo key={img.name} image={img} decorative sizes="120px" className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="rounded-[22px] bg-card p-5 text-left">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">5 packages ranked</p>
            <p className="text-[11px] text-white/40">USD · per party</p>
          </div>
          <ul className="mt-4 flex flex-col gap-1.5">
            {MOCK_PACKAGES.map((p, i) => (
              <li key={p.label} className={`tw-in-fade grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-2xl px-3 py-2.5 ${p.pick ? "bg-accent text-accent-foreground" : "bg-white/[0.04]"}`} style={{ "--d": `${1000 + i * 110}ms` } as Vars}>
                <span className="truncate text-[13px] font-semibold">{p.label}</span>
                <span className="tw-num text-[13px] font-semibold">{p.price}</span>
                <span className={`col-span-2 h-1 overflow-hidden rounded-full ${p.pick ? "bg-accent-foreground/15" : "bg-white/[0.06]"}`}>
                  <span className={`tw-bar-grow block h-full rounded-full ${p.pick ? "bg-accent-foreground" : "bg-white/40"}`} style={{ width: `${p.width}%`, "--i": i + 14 } as Vars} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Tilted photo print floating beside the product card (desktop), drifting at its own depth. */
function FloatingPrint({ image, caption, className, r, depth }: { image: MarketingImage; caption: string; className: string; r: number; depth: number }) {
  return (
    <figure aria-hidden className={`tw-float pointer-events-none absolute z-10 hidden min-[1360px]:block ${className}`} style={{ "--r": `${r}deg`, "--depth": `${depth}px` } as Vars}>
      <div className="tw-in-fade rounded-[22px] border border-white/15 bg-card/80 p-1.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur" style={{ "--d": "1100ms" } as Vars}>
        <Photo image={image} decorative sizes="280px" className="aspect-[4/5] w-full rounded-[16px]" />
        <figcaption className="flex items-center gap-2 px-2 pb-1 pt-2.5 text-[11px] text-white/60">
          <span className="size-1.5 rounded-full bg-accent" />
          {caption}
        </figcaption>
      </div>
    </figure>
  );
}

/* ---------------------------------------------------------------- how it works screens */

function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-background px-4 pb-5 pt-10 text-left">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/45">Illustrative</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function EnquiryScreen() {
  return (
    <Screen title="New enquiry">
      <div data-seq className="flex flex-col gap-2.5">
        <div className="rounded-2xl rounded-tl-sm bg-muted p-3 text-[12px] leading-relaxed text-white/80" style={{ "--i": 0 } as Vars}>
          Hi! Two of us, 7 nights in March. We love culture and tea country. Budget around USD 1,800 for hotels.
        </div>
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-white/40" style={{ "--i": 1 } as Vars}>
          Understood — please confirm
        </p>
        {[
          ["Travellers", "2 adults"],
          ["Dates", "12 – 19 Mar"],
          ["Interests", "Culture, tea"],
          ["Budget", "USD 1,800"],
        ].map(([k, v], i) => (
          <div key={k} className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5" style={{ "--i": i + 2 } as Vars}>
            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            <span className="text-[11px] text-white/50">{k}</span>
            <span className="ml-auto text-[12px] font-semibold">{v}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function ItineraryScreen() {
  const photos = [IMAGES.colombo, IMAGES.sigiriya, IMAGES.temple, IMAGES.flow];
  return (
    <Screen title="Itinerary">
      <ol data-seq className="relative flex flex-col">
        {MOCK_ROUTE.map((s, i) => (
          <li key={s.place} style={{ "--i": i } as Vars}>
            {i > 0 ? (
              <p className="flex items-center gap-2 py-1.5 pl-[22px] text-[10px] text-white/40">
                <span aria-hidden className="h-5 w-px bg-white/15" />
                est. {["3h 50m", "2h 40m", "5h 10m"][i - 1]} · labelled estimate
              </p>
            ) : null}
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2.5">
              <Photo image={photos[i]!} decorative sizes="80px" className="size-10 rounded-xl" />
              <span className="text-[13px] font-semibold">{s.place}</span>
              <span className="ml-auto rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] text-white/60">
                {s.nights} {s.nights === 1 ? "night" : "nights"}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Screen>
  );
}

function OptimiseScreen() {
  return (
    <Screen title="Optimisation">
      <div data-seq className="flex flex-1 flex-col gap-2">
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3" style={{ "--i": 0 } as Vars}>
          <span aria-hidden className="tw-spin-hex tw-hex size-6 bg-accent" />
          <div>
            <p className="text-[12px] font-semibold">Combinations searched</p>
            <p className="text-[10px] text-white/45">Contracted rates and enabled suppliers</p>
          </div>
        </div>
        {MOCK_PACKAGES.map((p, i) => (
          <div key={p.label} className={`rounded-2xl px-3 py-2.5 ${p.pick ? "bg-accent text-accent-foreground" : "bg-white/[0.05]"}`} style={{ "--i": i + 1 } as Vars}>
            <div className="flex items-center justify-between text-[12px] font-semibold">
              <span>{p.label}</span>
              <span className="tw-num">{p.price}</span>
            </div>
            <div className={`mt-2 h-1 rounded-full ${p.pick ? "bg-accent-foreground/15" : "bg-white/[0.06]"}`}>
              <div className={`tw-step-bar h-full rounded-full ${p.pick ? "bg-accent-foreground" : "bg-white/40"}`} style={{ width: `${p.width}%`, "--i": i } as Vars} />
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function QuoteScreen() {
  return (
    <Screen title="Quotation">
      <div data-seq className="flex flex-1 flex-col gap-2.5">
        <div className="overflow-hidden rounded-2xl bg-white text-[#091b20]" style={{ "--i": 0 } as Vars}>
          <Photo image={IMAGES.stilts} decorative sizes="300px" className="h-20 w-full" />
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/50">Your brand</span>
              <span className="text-[10px] text-black/50">v2</span>
            </div>
            <p className="mt-3 text-[11px] text-black/55">{OBJECTIVES[1]!.label} · 7 nights</p>
            <p className="tw-wide tw-num mt-1 text-[24px]">USD 1,742</p>
            <div className="mt-3 flex justify-between border-t border-black/10 pt-3 text-[11px]">
              <span className="text-black/55">Margin</span>
              <span className="font-semibold">13.2%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3" style={{ "--i": 1 } as Vars}>
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          <span className="text-[11px] text-white/70">Exchange rate frozen at pricing</span>
        </div>
        <div className="mt-auto flex items-center justify-center gap-2 rounded-full bg-accent py-3 text-[12px] font-semibold text-accent-foreground" style={{ "--i": 2 } as Vars}>
          <Send className="size-3.5" aria-hidden /> Send to client
        </div>
      </div>
    </Screen>
  );
}

const SCREENS = [EnquiryScreen, ItineraryScreen, OptimiseScreen, QuoteScreen];

/* ---------------------------------------------------------------- page */

export default function LandingPage() {
  return (
    <>
      <IntroCurtain />

      {/* hero: full-bleed photograph, photos set into the headline */}
      <ScrollScene as="section" mode="exit" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <div className="tw-hero-media size-full">
            <Photo image={IMAGES.hero} priority className="tw-hero-img size-full" />
          </div>
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/75 via-background/25 to-background" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,transparent_30%,rgba(9,27,32,0.65)_100%)]" />

        <div className="tw-hero-copy flex flex-1 flex-col items-center justify-center px-4 pb-44 pt-32 text-center md:pb-56">
          <p className="tw-in-fade inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-background/40 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-md" style={{ "--d": "200ms" } as Vars}>
            <span aria-hidden className="tw-ping relative size-1.5 rounded-full bg-accent" />
            For tour operators &amp; hotel groups
          </p>
          <h1 className="tw-wide mt-8 text-[clamp(32px,6.8vw,112px)] text-white">
            <span className="sr-only">One enquiry. Five itineraries. Several costed, client-ready packages in minutes.</span>
            <span aria-hidden className="block">
              <HeroWord word="One" from={0} />
              <PhotoPill image={IMAGES.elephants} delay={450} />
              <HeroWord word="enquiry" from={3} />
            </span>
            <span aria-hidden className="block">
              <span className="text-accent">
                <HeroWord word="Five" from={10} />
              </span>{" "}
              <HeroWord word="itineraries" from={14} />
              <PhotoPill image={IMAGES.stilts} delay={650} className="hidden sm:inline-block" />
            </span>
          </h1>
          <p className="tw-in-fade mx-auto mt-7 max-w-[48ch] text-base leading-relaxed text-white/75 md:text-lg" style={{ "--d": "600ms" } as Vars}>
            TripWeave turns one tourist enquiry into several costed, client-ready accommodation packages — in minutes, with your margins and your brand.
          </p>
          <div className="tw-in-fade mt-9" style={{ "--d": "800ms" } as Vars}>
            <CtaButtons center accent />
          </div>
        </div>

        <div className="tw-in-fade absolute inset-x-0 bottom-[172px] hidden items-end justify-between px-8 md:flex lg:bottom-[150px]" style={{ "--d": "1000ms" } as Vars}>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span aria-hidden className="relative h-10 w-px overflow-hidden bg-white/15">
              <span className="tw-scroll-cue absolute inset-0 bg-white" />
            </span>
            Scroll to explore
          </div>
          <p className="flex items-center gap-2 text-xs text-white/60">
            <span className="size-1.5 rounded-full bg-accent" />
            Sigiriya · Sri Lanka
          </p>
        </div>
      </ScrollScene>

      {/* product card rising over the hero, flanked by floating prints */}
      <ScrollScene className="tw-tilt-scene relative z-10 -mt-36 px-4 pb-24 md:-mt-48 md:pb-32">
        <div aria-hidden className="tw-beam pointer-events-none absolute inset-x-0 -top-10 mx-auto h-[70%] max-w-4xl bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,rgba(251,161,58,0.18),transparent_70%)] blur-2xl" />
        <FloatingPrint image={IMAGES.coconut} caption="South coast" className="left-[1.5%] top-[34%] w-[12.5vw] max-w-[230px]" r={-7} depth={160} />
        <FloatingPrint image={IMAGES.colombo} caption="Colombo" className="right-[1.5%] top-[10%] w-[11.5vw] max-w-[210px]" r={6} depth={240} />
        <div className="tw-in-fade" style={{ "--d": "700ms" } as Vars}>
          <HeroCard />
        </div>
      </ScrollScene>

      {/* marquee: words with photo pills */}
      <section aria-label="TripWeave in short" className="border-y border-border py-8 md:py-12">
        <VelocityMarquee speed={60}>
          {(
            [
              ["One enquiry", IMAGES.temple],
              ["Five packages", IMAGES.beach],
              ["Exact margins", IMAGES.elephants],
              ["Your brand", IMAGES.sigiriya],
            ] as const
          ).map(([w, img], i) => (
            <span key={w} className="flex items-center text-[clamp(40px,7vw,112px)]">
              <span className={`tw-wide whitespace-nowrap px-6 md:px-10 ${i % 2 ? "tw-outline" : "text-white"}`}>{w}</span>
              <Photo image={img} decorative sizes="200px" className="h-[0.78em] w-[1.6em] shrink-0 rounded-full" />
            </span>
          ))}
        </VelocityMarquee>
      </section>

      {/* about */}
      <section aria-labelledby="about-h" className="px-4 py-24 md:px-8 md:py-36">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <Reveal variant="fade">
            <Label>About</Label>
          </Reveal>
          <div>
            <ScrollHighlight
              as="h2"
              id="about-h"
              className="tw-wide max-w-5xl text-[clamp(22px,3.2vw,46px)] font-medium leading-[1.12] tracking-[-0.03em]"
              text="Not just quotes — numbers you can stand behind. Money is exact, every rate says where it came from, and AI is never allowed to set a price."
            />
            <dl className="mt-16 grid gap-3 sm:grid-cols-3">
              {(
                [
                  [5, "Distinct packages", "per optimisation, each ranked on its own objective"],
                  [4, "Quote currencies", "LKR, USD, EUR and GBP with frozen exchange rates"],
                  [6, "Team roles", "with fixed permission sets and an audit trail"],
                ] as const
              ).map(([n, label, hint], i) => (
                <Reveal key={label} delay={i * 120} className="tw-wipe group relative flex flex-col overflow-hidden rounded-[28px] bg-card p-7 md:p-8">
                  <dt className="order-2 mt-8 text-lg font-semibold tracking-[-0.03em] transition-colors duration-500 group-hover:text-accent-foreground">{label}</dt>
                  <dd className="tw-wide order-1 text-[clamp(64px,7vw,104px)] text-accent transition-colors duration-500 group-hover:text-accent-foreground">
                    <CountUp value={n} />
                  </dd>
                  <dd className="order-3 mt-1 text-sm text-muted-foreground transition-colors duration-500 group-hover:text-accent-foreground/70">{hint}</dd>
                </Reveal>
              ))}
            </dl>
            <div className="mt-16 grid gap-10 md:grid-cols-3">
              {[
                { icon: ShieldCheck, title: "Deterministic pricing", text: "Money is handled in exact whole minor units. The same inputs always produce the same price." },
                { icon: Tags, title: "Labelled data", text: "Every rate says where it came from. Illustrative data is clearly marked and cannot be turned into a quotation." },
                { icon: Lock, title: "Tenant isolation", text: "Your data is scoped to you. Platform staff need a time-limited, reasoned and audited access grant." },
              ].map((p, i) => (
                <Reveal key={p.title} delay={i * 120} className="tw-bento rounded-[28px] border border-border p-7 hover:shadow-none">
                  <Hex className="size-11 bg-muted text-accent">
                    <p.icon className="size-5" strokeWidth={1.6} />
                  </Hex>
                  <h3 className="mt-6 text-lg font-semibold tracking-[-0.03em]">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/60">{p.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* audience */}
      <section aria-labelledby="who-h" className="px-4 pb-24 md:px-8 md:pb-36">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <Reveal variant="fade">
            <Label>Who it is for</Label>
          </Reveal>
          <div>
            <RevealWords id="who-h" text="Built for the people who quote all day" className="tw-wide max-w-4xl text-[clamp(28px,3.8vw,60px)]" />
            <div className="mt-12 grid gap-3 md:grid-cols-2">
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
                <Reveal as="article" key={a.n} delay={i * 120} className="group relative isolate flex min-h-[460px] flex-col justify-end overflow-hidden rounded-[28px] bg-card p-6 md:min-h-[540px] md:p-8">
                  <div className="absolute inset-0 -z-10">
                    <Photo image={a.image} sizes="(min-width: 768px) 50vw, 100vw" className="size-full transition-[scale] duration-[1.2s] ease-out group-hover:scale-[1.06]" />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
                  </div>
                  <span className="absolute right-6 top-6 rounded-full border border-white/20 bg-background/30 px-3 py-1 text-xs text-white/80 backdrop-blur md:right-8 md:top-8">/ {a.n}</span>
                  <h3 className="tw-wide text-[clamp(22px,2.4vw,34px)] leading-[1.05]">{a.title}</h3>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">{a.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* how it works: pinned on desktop, the device screen and backdrop change per step */}
      <ScrollSteps count={FLOW.length} aria-labelledby="flow-h" className="relative border-t border-border lg:h-[420vh]">
        <div className="relative overflow-hidden lg:sticky lg:top-0 lg:h-screen">
          <div className="px-4 pt-24 md:px-8 lg:absolute lg:left-8 lg:top-28 lg:z-30 lg:p-0">
            <Label>How it works</Label>
            <h2 id="flow-h" className="mt-4 max-w-xs text-2xl font-semibold leading-tight tracking-[-0.04em] md:text-3xl">
              From a loose email to a branded quotation
            </h2>
          </div>

          {/* device frame (desktop): the step screens are laid exactly inside it */}
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden h-[620px] w-[310px] -translate-x-1/2 -translate-y-1/2 rounded-[46px] border border-white/15 bg-sidebar shadow-[0_0_0_8px_var(--card),0_60px_120px_-30px_rgba(0,0,0,0.9)] lg:block">
            <span className="absolute left-1/2 top-3 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-sidebar" />
          </div>

          <div className="lg:absolute lg:inset-0">
            {FLOW.map((s, i) => {
              const Scr = SCREENS[i]!;
              return (
                <article key={s.n} data-step-item={i} aria-label={`Step ${s.n}: ${s.title}`} className="tw-step relative isolate grid gap-8 overflow-hidden border-b border-border px-4 py-16 md:px-8 lg:absolute lg:inset-0 lg:block lg:overflow-visible lg:border-0 lg:p-0 lg:[isolation:auto]">
                  <div aria-hidden className="tw-step-bg absolute inset-0 -z-10">
                    <Photo image={STEP_IMAGES[i]!} decorative className="size-full opacity-70" />
                    <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/45 to-background/95" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_70%_at_50%_50%,rgba(9,27,32,0.55),transparent_75%)]" />
                  </div>
                  <p aria-hidden className="tw-step-word tw-wide pointer-events-none select-none text-[clamp(44px,11.5vw,200px)] text-accent lg:absolute lg:inset-x-0 lg:top-1/2 lg:z-0 lg:-translate-y-1/2 lg:text-center">
                    {s.title}
                  </p>
                  <div className="tw-step-copy lg:absolute lg:bottom-32 lg:left-8 lg:z-30 lg:max-w-[300px]">
                    <p className="tw-num text-sm text-accent">/ {s.n}</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{s.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">{s.text}</p>
                  </div>
                  <div className="tw-step-screen mx-auto h-[540px] w-full max-w-[320px] overflow-hidden rounded-[30px] border border-white/10 lg:absolute lg:left-1/2 lg:top-1/2 lg:z-20 lg:h-[600px] lg:w-[290px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:border-0">
                    <Scr />
                  </div>
                </article>
              );
            })}
          </div>

          {/* step tabs (desktop) */}
          <div className="absolute bottom-8 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-1.5 lg:flex">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-card/80 p-1.5 backdrop-blur-xl">
              {FLOW.map((s, i) => (
                <button key={s.n} type="button" data-step-go={i} data-step-item={i} className="relative overflow-hidden rounded-full px-4 py-2 text-[13px] font-medium text-white/45 transition-colors duration-500 hover:text-white data-[state=active]:bg-white/[0.08] data-[state=active]:text-white">
                  {s.title}
                  <span aria-hidden className="tw-tab-fill absolute inset-x-3 bottom-1 h-px bg-accent transition-transform duration-300" />
                </button>
              ))}
            </div>
            <a href="#packages" className="group rounded-full border border-white/10 bg-card/80 px-5 py-3.5 text-[13px] font-medium backdrop-blur-xl transition-colors hover:bg-white hover:text-background">
              <RollText text="Skip ahead" />
            </a>
          </div>
        </div>
      </ScrollSteps>

      {/* five packages */}
      <section id="packages" aria-labelledby="pk-h" className="scroll-mt-20 border-t border-border px-4 py-24 md:px-8 md:py-36">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <Reveal variant="fade">
            <Label>Packages</Label>
          </Reveal>
          <div>
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
              <RevealWords id="pk-h" text="Five packages, five intentions" className="tw-wide text-[clamp(32px,4.6vw,72px)]" />
              <Reveal delay={200} className="max-w-md text-base leading-relaxed text-foreground/60">
                Each optimisation produces up to five packages from the same enquiry, each ranked against a different objective. Dates, room needs and budget are mandatory for all of them.
              </Reveal>
            </div>
            <Reveal className="mt-16">
              <PackageList />
            </Reveal>
            <Reveal className="mt-8 flex flex-col gap-2 rounded-[28px] bg-card p-7 sm:flex-row sm:items-center sm:gap-8 md:p-8">
              <p className="shrink-0 text-lg font-semibold tracking-[-0.03em]">No feasible option?</p>
              <p className="text-sm leading-relaxed text-foreground/60">If the constraints leave nothing that works, the engine says so and explains why instead of inventing one.</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* moving photo gallery */}
      <section aria-labelledby="gallery-h" className="overflow-hidden border-t border-border py-24 md:py-32">
        <div className="grid gap-6 px-4 md:px-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <Label>Every stop</Label>
            <RevealWords id="gallery-h" text="Routes your clients will remember" className="tw-wide mt-6 text-[clamp(30px,4.4vw,68px)]" />
          </div>
          <Reveal delay={200} className="max-w-md text-base leading-relaxed text-foreground/60">
            Multi-stop journeys priced stay by stay. TripWeave handles the nights, the legs between them and the margin on every hotel.
          </Reveal>
        </div>
        <div className="mt-14">
          <VelocityMarquee speed={35} pauseOnHover>
            {GALLERY.map((g, i) => (
              <figure key={g.image.name} className={`group relative mx-1.5 w-[240px] shrink-0 overflow-hidden rounded-[28px] md:w-[300px] ${i % 2 ? "mt-10" : ""}`}>
                <Photo image={g.image} decorative sizes="300px" className="aspect-[3/4] w-full transition-[scale] duration-[1.2s] ease-out group-hover:scale-[1.07]" />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                <figcaption className="absolute inset-x-4 bottom-4 flex items-center gap-2 text-sm font-medium text-white">
                  <span className="size-1.5 rounded-full bg-accent" />
                  {g.caption}
                </figcaption>
              </figure>
            ))}
          </VelocityMarquee>
        </div>
      </section>

      {/* features: light inset panel */}
      <div className="px-2 md:px-4">
        <ScrollScene as="section" aria-labelledby="feat-h" className="tw-panel tw-void-light rounded-[32px] px-4 py-20 md:rounded-[44px] md:px-8 md:py-28">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <Label className="text-[#091b20]/55">Features</Label>
              <RevealWords id="feat-h" text="What is in the box" className="tw-wide mt-6 text-[clamp(32px,4.6vw,72px)]" />
            </div>
            <Reveal delay={200} className="max-w-md text-base leading-relaxed text-[#091b20]/65">
              Practical tools, described honestly. Where something depends on configuration or a supplier connection, we say so.
            </Reveal>
          </div>

          <ul className="mt-14 grid auto-rows-[minmax(220px,auto)] gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const lead = i === 0;
              const dark = i === FEATURES.length - 1;
              const photo = i === 5 ? IMAGES.temple : i === 3 ? IMAGES.hotels : null;
              return (
                <Reveal
                  as="li"
                  key={f.title}
                  delay={(i % 4) * 90}
                  className={`tw-bento group relative isolate flex flex-col overflow-hidden rounded-[28px] p-6 md:p-7 ${lead ? "bg-accent text-accent-foreground sm:col-span-2 lg:row-span-2" : dark || photo ? "bg-sidebar text-white" : "bg-card"} ${i === 5 ? "sm:col-span-2" : ""}`}
                >
                  {photo ? (
                    <div aria-hidden className="absolute inset-0 -z-10">
                      <Photo image={photo} decorative sizes="(min-width: 1024px) 50vw, 100vw" className="size-full transition-[scale] duration-[1.2s] ease-out group-hover:scale-[1.06]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#091b20] via-[#091b20]/55 to-[#091b20]/10" />
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between">
                    <Hex className={`size-11 ${lead ? "bg-accent-foreground text-accent" : dark || photo ? "bg-accent text-accent-foreground" : "bg-[#091b20] text-accent"}`}>
                      <f.icon className="size-5" strokeWidth={1.6} />
                    </Hex>
                    <span className={`tw-num text-xs ${dark || photo ? "text-white/50" : "text-[#091b20]/45"}`}>{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  {lead ? (
                    <svg aria-hidden viewBox="0 0 400 180" className="my-6 w-full flex-1" fill="none">
                      <path className="tw-route-path" pathLength={1} d="M30 140 C 90 140, 90 50, 150 60 S 230 150, 270 110 S 340 30, 370 40" stroke="#091b20" strokeWidth="2" strokeDasharray="1" strokeLinecap="round" />
                      {(
                        [
                          [30, 140, "Colombo"],
                          [150, 60, "Sigiriya"],
                          [270, 110, "Kandy"],
                          [370, 40, "Ella"],
                        ] as const
                      ).map(([x, y, name], k) => (
                        <g key={name} className="tw-route-stop" style={{ "--i": k } as Vars}>
                          <circle cx={x} cy={y} r="9" fill="#091b20" />
                          <circle cx={x} cy={y} r="3.5" fill="#fba13a" />
                          <text x={x} y={y + 28} textAnchor="middle" fontSize="13" fontWeight="600" fill="#091b20">
                            {name}
                          </text>
                        </g>
                      ))}
                    </svg>
                  ) : null}
                  {f.icon === Coins ? (
                    <div aria-hidden className="mt-6 h-9 overflow-hidden">
                      <div className="tw-ticker">
                        {["LKR", "USD", "EUR", "GBP"].map((c) => (
                          <p key={c} className="tw-wide h-9 text-[30px] leading-9">
                            {c}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className={`mt-auto ${photo ? "pt-24" : "pt-8"}`}>
                    <h3 className={`font-semibold tracking-[-0.03em] ${lead ? "tw-wide text-[clamp(22px,2.4vw,34px)] leading-[1.05]" : "text-lg"}`}>{f.title}</h3>
                    <p className={`mt-2 max-w-md text-sm leading-relaxed ${lead ? "text-accent-foreground/75" : dark || photo ? "text-white/70" : "text-[#091b20]/65"}`}>{f.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>

          <div className="mt-24 grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <RevealWords text="Every rate carries its source" className="tw-wide text-[clamp(26px,3.4vw,52px)]" />
            <Reveal delay={200} className="max-w-md text-base leading-relaxed text-[#091b20]/65">
              So you always know how much to trust a number before you promise it to a client.
            </Reveal>
          </div>
          <dl className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {DATA_LABELS.map((d, i) => (
              <Reveal key={d.label} delay={i * 80} className="tw-bento rounded-[24px] bg-card p-6">
                <dt className="inline-flex items-center gap-2 rounded-full bg-[#091b20] px-3 py-1.5 text-xs font-semibold text-white">
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: ["#5ccf95", "#7cbdf0", "#fba13a", "#f2786d", "#9aa5a8"][i] }} />
                  {d.label}
                </dt>
                <dd className="mt-4 text-sm leading-relaxed text-[#091b20]/65">{d.text}</dd>
              </Reveal>
            ))}
          </dl>
          <Reveal className="mt-14">
            <Link href="/features" className="group inline-flex h-14 items-center gap-3 rounded-full bg-[#091b20] pl-7 pr-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d2e37]">
              <RollText text="See every feature in detail" />
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-500 group-hover:rotate-45">
                <ArrowUpRight className="size-4" aria-hidden />
              </span>
            </Link>
          </Reveal>
        </ScrollScene>
      </div>

      {/* closing: crossing bands, then the call to action */}
      <section aria-labelledby="cta-h" className="relative overflow-hidden pt-28 md:pt-40">
        <div className="relative py-10">
          <div aria-hidden className="absolute inset-x-[-5%] top-1/2 -translate-y-1/2 rotate-[3deg] bg-muted py-4 text-white/50">
            <VelocityMarquee speed={40} reverse>
              {["Enquiry", "Itinerary", "Optimise", "Quote"].map((w) => (
                <span key={w} className="tw-wide flex items-center gap-6 whitespace-nowrap px-6 text-[clamp(20px,2.6vw,40px)]">
                  {w} <span className="text-white/25">/</span>
                </span>
              ))}
            </VelocityMarquee>
          </div>
          <Link href="/register" aria-label="Create your organisation" className="relative block -rotate-[2deg] bg-accent py-4 text-accent-foreground transition-[rotate] duration-700 ease-out hover:rotate-0">
            <VelocityMarquee speed={70}>
              {[0, 1, 2].map((k) => (
                <span key={k} className="tw-wide flex items-center gap-6 whitespace-nowrap px-6 text-[clamp(24px,3.4vw,52px)]">
                  Get started <span aria-hidden className="tw-hex size-[0.6em] bg-accent-foreground" /> Create your organisation <span aria-hidden className="tw-hex size-[0.6em] bg-accent-foreground" />
                </span>
              ))}
            </VelocityMarquee>
          </Link>
        </div>

        <div className="px-4 pb-24 pt-20 text-center md:px-8 md:pb-36 md:pt-28">
          <Reveal variant="fade" className="flex justify-center">
            <Label>Get started</Label>
          </Reveal>
          <RevealWords id="cta-h" text="Your first optimisation, today" className="tw-wide mx-auto mt-8 max-w-5xl text-[clamp(34px,6vw,96px)]" />
          <Reveal delay={300}>
            <p className="mx-auto mt-8 max-w-xl text-base text-foreground/60">Registration takes a minute. You become the owner and can invite your team afterwards.</p>
            <div className="mt-10">
              <CtaButtons center accent />
            </div>
          </Reveal>
        </div>

        <Reveal variant="clip" className="mx-2 overflow-hidden rounded-[32px] md:mx-4 md:rounded-[44px]">
          <ScrollScene className="relative h-56 overflow-hidden md:h-[420px]">
            <div className="tw-parallax h-[125%] -translate-y-[10%]">
              <Photo image={IMAGES.footer} className="size-full" sizes="100vw" />
            </div>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
            <p className="absolute bottom-5 left-5 flex items-center gap-2 text-xs text-white/75 md:bottom-8 md:left-8">
              For tour operators and hotel management companies <ArrowRight className="size-3.5" aria-hidden />
            </p>
          </ScrollScene>
        </Reveal>
      </section>
    </>
  );
}
