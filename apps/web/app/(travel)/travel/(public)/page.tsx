import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Backpack, BedDouble, Check, Copy, NotebookPen, Share2, Sparkles, Wallet } from "lucide-react";
import { DestinationPhoto, PhotoCreditLine } from "@/features/planning/components/destination-photo";
import { TravelPublicCta } from "@/features/travel/public-cta";
import { IMAGES, Photo, type MarketingImage } from "@/features/marketing/imagery";
import { RollText } from "@/features/marketing/ui";
import { Magnetic, Reveal, RevealWords, ScrollScene, ScrollSteps, VelocityMarquee } from "@/components/motion";

export const metadata: Metadata = {
  title: { absolute: "TripWeave for travellers – plan the trip you keep thinking about" },
  description: "Describe the trip you want. TripWeave turns it into a day-by-day plan, stay ideas, a budget, a packing list and one link to share.",
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

const STEPS = [
  { n: "01", title: "Tell us the shape of it", text: "A few dates, who is coming, a budget and the things you do not want to miss. Write it like a message to a friend.", image: IMAGES.coconut },
  { n: "02", title: "Get a real plan back", text: "A day-by-day route with places, timings and ideas you can move, swap or slow down — not a wall of links.", image: IMAGES.flow },
  { n: "03", title: "Keep the whole trip together", text: "Stay ideas, a running budget, a packing list and a link your travel companions can open.", image: IMAGES.stilts },
];

const DAYS = [
  { day: "Day 1", title: "Arrive in Kandy", text: "Market walk, lake loop, a slow dinner above the valley.", place: "Kandy", note: "the lake at dusk", r: -4 },
  { day: "Day 2", title: "Tea country", text: "Train through the hills, a tea factory, the quiet end of Ella.", place: "Ella", note: "the train is the point", r: 2.5 },
  { day: "Day 3", title: "The coast", text: "South to the fort at Galle, then nowhere in particular.", place: "Galle", note: "nowhere in particular", r: -2 },
];

const PLACES = ["Kandy", "Ella", "Galle", "Sigiriya"];

const MOODS: [string, MarketingImage][] = [
  ["slow mornings", IMAGES.coconut],
  ["long train rides", IMAGES.operators],
  ["the quiet end of the beach", IMAGES.stilts],
  ["one more day", IMAGES.elephants],
];

/* ---------------------------------------------------------------- hero pieces */

function Word({ word, from, className }: { word: string; from: number; className?: string }) {
  return (
    <span className={`tw-mask pr-[0.04em] ${className ?? ""}`}>
      {[...word].map((ch, i) => (
        <span key={i} className="tw-letter" style={{ "--i": from + i } as Vars}>
          {ch}
        </span>
      ))}
    </span>
  );
}

function Pill({ image, delay, className }: { image: MarketingImage; delay: number; className?: string }) {
  return (
    <span aria-hidden className={`tw-pill mx-[0.1em] h-[0.72em] w-[1.6em] -translate-y-[0.02em] overflow-hidden rounded-full align-middle ${className ?? "inline-block"}`} style={{ "--d": `${delay}ms` } as Vars}>
      <Photo image={image} decorative priority sizes="220px" className="size-full" />
    </span>
  );
}

/* ---------------------------------------------------------------- how it works screens */

function SampleTag() {
  return <span className="rounded-full border border-border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sample</span>;
}

function DescribeScreen() {
  return (
    <div className="tw-travel-card w-full max-w-sm p-5">
      <div className="flex items-center justify-between">
        <p className="tw-travel-eyebrow">Your message</p>
        <SampleTag />
      </div>
      <div data-seq className="mt-4 flex flex-col gap-3">
        <p className="rounded-2xl rounded-tr-sm bg-[#211d17] p-4 text-sm leading-relaxed text-[#fffdf8]" style={{ "--i": 0 } as Vars}>
          Two weeks in Sri Lanka in March. Slow mornings, one long train ride, beaches at the end. Around USD 2,000 for two of us.
        </p>
        <p className="tw-travel-hand text-xl" style={{ "--i": 1 } as Vars}>
          got it — here is what I heard
        </p>
        <div className="flex flex-wrap gap-1.5" style={{ "--i": 2 } as Vars}>
          {["14 days", "2 travellers", "March", "Trains", "Beaches", "USD 2,000"].map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
              <Check className="size-3" strokeWidth={3} aria-hidden /> {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanScreen() {
  return (
    <div className="tw-travel-card w-full max-w-sm p-5">
      <div className="flex items-center justify-between">
        <p className="tw-travel-display text-2xl">Fourteen slow days</p>
        <SampleTag />
      </div>
      <ol data-seq className="mt-4 flex flex-col gap-2">
        {[
          ["Day 1", "Colombo → Kandy", "Lake loop at dusk"],
          ["Day 3", "Kandy → Ella", "The morning train"],
          ["Day 6", "Ella", "Little Adam's Peak, early"],
          ["Day 9", "South coast", "Nothing planned. On purpose."],
        ].map(([d, title, note], i) => (
          <li key={d} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5" style={{ "--i": i } as Vars}>
            <span className="tw-travel-eyebrow w-11 shrink-0">{d}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{title}</p>
              <p className="truncate text-xs text-muted-foreground">{note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TogetherScreen() {
  return (
    <div className="tw-travel-card w-full max-w-sm p-5">
      <div className="flex items-center justify-between">
        <p className="tw-travel-eyebrow">Trip budget</p>
        <SampleTag />
      </div>
      <div data-seq className="mt-3 flex flex-col gap-4">
        <div style={{ "--i": 0 } as Vars}>
          <p className="tw-travel-display text-4xl">
            USD 1,240 <span className="text-lg text-muted-foreground">of 2,000</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="tw-step-bar h-full w-[62%] rounded-full bg-accent" />
          </div>
        </div>
        <ul className="flex flex-col gap-2 text-sm" style={{ "--i": 1 } as Vars}>
          {["Passports", "Rain jacket", "Train tickets"].map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <span className="grid size-5 place-items-center rounded-full bg-[#4f7a57] text-white">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 py-1.5 pl-4 pr-1.5 text-xs" style={{ "--i": 2 } as Vars}>
          <Share2 className="size-3.5 text-accent" aria-hidden />
          <span className="truncate text-muted-foreground">Read-only link for the group</span>
          <span className="ml-auto rounded-full bg-[#211d17] px-3 py-1.5 font-semibold text-[#fffdf8]">Copy</span>
        </div>
      </div>
    </div>
  );
}

const SCREENS = [DescribeScreen, PlanScreen, TogetherScreen];

/* ---------------------------------------------------------------- page */

export default function TravelLandingPage() {
  return (
    <>
      {/* hero */}
      <section className="relative px-4 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto w-full max-w-7xl text-center">
          <p className="tw-in-fade tw-travel-eyebrow inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 backdrop-blur" style={{ "--d": "100ms" } as Vars}>
            <span aria-hidden className="tw-ping relative size-1.5 rounded-full bg-accent" />
            TripWeave for travellers
          </p>
          <h1 className="tw-travel-display mt-8 text-[clamp(3.2rem,9.6vw,10.5rem)] leading-[0.9] tracking-[-0.055em]">
            <span className="sr-only">Your next trip, woven together.</span>
            <span aria-hidden className="block">
              <Word word="Your" from={0} /> <Word word="next" from={4} />
              <Pill image={IMAGES.elephants} delay={420} className="hidden sm:inline-block" /> <Word word="trip," from={8} />
            </span>
            <span aria-hidden className="block">
              <Word word="woven" from={13} className="italic text-accent" />
              <Pill image={IMAGES.coconut} delay={620} /> <Word word="together." from={18} />
            </span>
          </h1>
          <p className="tw-in-fade mx-auto mt-8 max-w-xl text-lg leading-relaxed text-foreground/70" style={{ "--d": "550ms" } as Vars}>
            Describe the trip you keep thinking about. Get a day-by-day plan, stay ideas along the route, a budget that stays honest, and a packing list you will actually use.
          </p>
          <div className="tw-in-fade mt-9 flex flex-wrap items-center justify-center gap-3" style={{ "--d": "700ms" } as Vars}>
            <Magnetic>
              <TravelPublicCta accent label="Plan your trip" />
            </Magnetic>
            <Link href="#how" className="group inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card/70 px-6 text-sm font-semibold backdrop-blur transition-colors hover:border-accent hover:text-accent">
              <RollText text="See how it works" /> <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          <p className="tw-in-fade mt-4 text-xs text-muted-foreground" style={{ "--d": "800ms" } as Vars}>
            Free to start · no card · your trip stays yours.
          </p>
        </div>

        {/* photo that widens as it scrolls in, with the sample plan floating over it */}
        <ScrollScene className="tw-in-fade relative mx-auto mt-14 w-full max-w-[1600px] md:mt-20" style={{ "--d": "650ms" }}>
          <div className="tw-expand relative h-[68vh] min-h-[460px] overflow-hidden md:h-[86vh]">
            <Photo image={IMAGES.stilts} priority sizes="100vw" className="size-full" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#211d17]/85 via-[#211d17]/10 to-[#211d17]/10" />
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_0%_100%,rgba(33,29,23,0.7),transparent_70%)]" />
            <div className="absolute bottom-6 left-6 max-w-sm text-[#fffdf8] md:bottom-12 md:left-12">
              <p className="tw-travel-hand text-3xl text-[#f6c9b2] md:text-4xl">day nine — nothing planned</p>
              <p className="mt-2 text-sm text-white/75">A note from a sample plan, not a booking.</p>
            </div>
          </div>
          <div className="tw-travel-card absolute -bottom-10 right-4 hidden w-[340px] p-5 md:block lg:right-[8%]">
            <div className="flex items-center justify-between">
              <div>
                <p className="tw-travel-eyebrow">A sample plan</p>
                <p className="tw-travel-display mt-1 text-2xl">Three days in the hills</p>
              </div>
              <SampleTag />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {DAYS.map((day, i) => (
                <div key={day.day} className="tw-in-fade flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2" style={{ "--d": `${1000 + i * 140}ms` } as Vars}>
                  <span className="tw-travel-eyebrow mt-1 w-12 shrink-0">{day.day}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{day.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{day.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollScene>
      </section>

      {/* moods marquee */}
      <section aria-label="What a plan can hold" className="mt-28 border-y border-border py-8 md:mt-36 md:py-10">
        <VelocityMarquee speed={45}>
          {MOODS.map(([w, img]) => (
            <span key={w} className="flex items-center text-[clamp(44px,6.4vw,104px)]">
              <span className="tw-travel-display whitespace-nowrap px-6 italic tracking-[-0.04em] md:px-10">{w}</span>
              <Photo image={img} decorative sizes="200px" className="h-[0.7em] w-[1.5em] shrink-0 rounded-full" />
            </span>
          ))}
        </VelocityMarquee>
      </section>

      {/* how it works: pinned on desktop */}
      <ScrollSteps id="how" count={STEPS.length} aria-labelledby="how-h" className="relative scroll-mt-0 lg:h-[330vh]">
        <div className="relative overflow-hidden lg:sticky lg:top-0 lg:h-screen">
          <div className="mx-auto w-full max-w-7xl px-4 pt-24 md:px-8 lg:absolute lg:inset-x-0 lg:top-28 lg:z-30 lg:pt-0">
            <p className="tw-travel-eyebrow">How it works</p>
            <h2 id="how-h" className="tw-travel-display mt-4 max-w-[15ch] text-4xl leading-[1.02] tracking-[-0.04em] md:text-5xl">
              From a loose idea to a trip you can hold.
            </h2>
          </div>

          <div className="lg:absolute lg:inset-0">
            {STEPS.map((s, i) => {
              const Scr = SCREENS[i]!;
              return (
                <article key={s.n} data-step-item={i} aria-label={`Step ${s.n}: ${s.title}`} className="tw-step mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 md:px-8 lg:absolute lg:inset-0 lg:block lg:py-0">
                  <div className="tw-step-copy lg:absolute lg:bottom-[14vh] lg:left-8 lg:max-w-md">
                    <p aria-hidden className="tw-travel-display text-[clamp(80px,12vw,180px)] italic leading-none text-accent/25">{s.n}</p>
                    <h3 className="tw-travel-display -mt-4 text-3xl tracking-[-0.03em] md:text-4xl">{s.title}</h3>
                    <p className="mt-3 max-w-sm text-base leading-relaxed text-foreground/65">{s.text}</p>
                  </div>
                  <div className="tw-step-screen relative h-[560px] overflow-hidden rounded-[30px] lg:absolute lg:right-8 lg:top-1/2 lg:h-[72vh] lg:w-[52%] lg:-translate-y-[42%]">
                    <Photo image={s.image} decorative sizes="(min-width: 1024px) 50vw, 100vw" className="absolute inset-0 size-full" />
                    <div aria-hidden className="absolute inset-0 bg-[#211d17]/25" />
                    <div className="relative flex size-full items-center justify-center p-5">
                      <Scr />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="absolute bottom-8 left-8 z-30 hidden items-center gap-1 rounded-full border border-border bg-card/80 p-1.5 backdrop-blur-xl lg:flex">
            {STEPS.map((s, i) => (
              <button key={s.n} type="button" data-step-go={i} data-step-item={i} className="relative overflow-hidden rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/45 transition-colors duration-500 hover:text-foreground data-[state=active]:bg-accent-soft data-[state=active]:text-accent">
                {s.n}
                <span aria-hidden className="tw-tab-fill absolute inset-x-3 bottom-1 h-px bg-accent transition-transform duration-300" />
              </button>
            ))}
          </div>
        </div>
      </ScrollSteps>

      {/* postcards */}
      <section aria-labelledby="days-h" className="border-t border-border bg-[#f1eadc]/70 px-4 py-24 md:px-8 md:py-32">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="tw-travel-eyebrow">A travel page, not a transcript</p>
              <RevealWords id="days-h" text="Every day has a shape." className="tw-travel-display mt-4 text-5xl leading-[1] tracking-[-0.045em] md:text-7xl" />
            </div>
            <Reveal delay={200} className="max-w-md text-base leading-relaxed text-foreground/65">
              The planner writes an interface, not a paragraph. Days, places, maps, budget notes and choices arrive as a composed page from a fixed set of safe travel blocks. Ask for slower mornings, a different base, or one more day at the coast.
            </Reveal>
          </div>

          <Reveal className="relative mt-16">
            <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-28 w-full -translate-y-1/2 md:block" fill="none">
              <path className="tw-dash-draw" d="M40 80 C 220 -10, 380 140, 600 60 S 980 -10, 1160 70" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div className="relative grid gap-8 md:grid-cols-3 md:gap-10">
              {DAYS.map((day, i) => (
                <Reveal key={day.day} delay={i * 140} className="flex flex-col">
                  <figure className="tw-postcard rounded-[22px] border border-border bg-card p-3 shadow-[0_30px_50px_-40px_rgba(45,30,15,0.6)]" style={{ "--r": `${day.r}deg` } as Vars}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[14px]">
                      <DestinationPhoto destination={day.place} alt={`${day.place}, Sri Lanka`} className="size-full" placeholder="art" />
                      <span className="tw-travel-eyebrow absolute right-3 top-3 rounded-full bg-card/90 px-3 py-1.5 text-foreground">{day.day}</span>
                    </div>
                    <figcaption className="px-2 pb-2 pt-4">
                      <p className="tw-travel-display text-3xl tracking-[-0.03em]">{day.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{day.text}</p>
                      <p className="tw-travel-hand mt-3 text-2xl">{day.note}</p>
                    </figcaption>
                  </figure>
                  <p className="mt-3 px-2">
                    <PhotoCreditLine destination={day.place} />
                  </p>
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* features */}
      <section aria-labelledby="feat-h" className="border-t border-border px-4 py-24 md:px-8 md:py-32">
        <div className="mx-auto w-full max-w-7xl">
          <p className="tw-travel-eyebrow">Everything in one place</p>
          <RevealWords id="feat-h" text="The trip, not just the itinerary." className="tw-travel-display mt-4 max-w-[16ch] text-5xl leading-[1] tracking-[-0.045em] md:text-7xl" />

          <ul className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Reveal as="li" className="tw-travel-card relative isolate flex min-h-[340px] flex-col justify-end overflow-hidden p-7 text-[#fffdf8] md:col-span-2">
              <div aria-hidden className="absolute inset-0 -z-10">
                <Photo image={IMAGES.sigiriya} decorative sizes="(min-width: 1024px) 66vw, 100vw" className="size-full transition-[scale] duration-[1.4s] ease-out hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#211d17]/90 via-[#211d17]/35 to-transparent" />
              </div>
              <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <h3 className="tw-travel-display mt-5 text-4xl tracking-[-0.03em]">A plan, not a chat</h3>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/75">The assistant composes a travel page you can read, with days, maps, places and practical notes. Every price still comes from the server.</p>
            </Reveal>

            <Reveal as="li" delay={100} className="tw-travel-card flex flex-col p-7">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <BedDouble className="size-5" aria-hidden />
              </span>
              <div className="mt-5 flex flex-col gap-2">
                {(
                  [
                    ["Lakeside guesthouse", "Kandy"],
                    ["Tea estate bungalow", "Ella"],
                    ["Fort-side rooms", "Galle"],
                  ] as const
                ).map(([name, where], i) => (
                  <div key={name} className="tw-in-fade flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-xs" style={{ "--d": `${i * 100}ms` } as Vars}>
                    <span className="font-semibold">{name}</span>
                    <span className="text-muted-foreground">{where}</span>
                  </div>
                ))}
              </div>
              <h3 className="mt-auto pt-6 text-lg font-semibold">Stays that fit the route</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ask for stay ideas along your actual route. See the places, the price and how each option fits your budget before you decide.</p>
            </Reveal>

            <Reveal as="li" delay={0} className="tw-travel-card flex flex-col p-7">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <Wallet className="size-5" aria-hidden />
              </span>
              <p className="tw-travel-display mt-5 text-4xl">
                62% <span className="text-lg text-muted-foreground">spent · sample</span>
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="tw-meter h-full rounded-full bg-accent" style={{ "--v": 0.62 } as Vars} />
              </div>
              <h3 className="mt-auto pt-6 text-lg font-semibold">A budget you can keep</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Add transport, stays, food and activities. See what is paid, what is left and whether the trip still fits.</p>
            </Reveal>

            <Reveal as="li" delay={100} className="tw-travel-card flex flex-col p-7">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <Backpack className="size-5" aria-hidden />
              </span>
              <ul className="mt-5 flex flex-col gap-2 text-sm">
                {["Passports", "Sun hat", "Something warm for the hills", "Train tickets"].map((item, i) => (
                  <li key={item} className="flex items-center gap-2.5" style={{ "--i": i } as Vars}>
                    <span className="grid size-5 place-items-center rounded-full border border-border">
                      <span className="tw-tick grid size-5 place-items-center rounded-full bg-[#4f7a57] text-white">
                        <Check className="size-3" strokeWidth={3} aria-hidden />
                      </span>
                    </span>
                    <span className="tw-tick-line">{item}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-auto pt-6 text-lg font-semibold">A packing list with a memory</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Generate a list from your route and activities, then tick things off. It survives the next edit and the next trip.</p>
            </Reveal>

            <Reveal as="li" delay={200} className="tw-travel-card flex flex-col bg-[repeating-linear-gradient(transparent,transparent_31px,var(--border)_31px,var(--border)_32px)] p-7">
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
                <NotebookPen className="size-5" aria-hidden />
              </span>
              <div className="tw-travel-hand mt-4 flex flex-col text-2xl leading-8">
                <span>train 09:45 from Kandy</span>
                <span>ask for the corner room</span>
                <span className="text-foreground/60">that curry place Mira loved?</span>
              </div>
              <h3 className="mt-auto pt-6 text-lg font-semibold">Somewhere for the details</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Train times, a restaurant someone mentioned, the name of the guesthouse. Keep it beside the plan, not in six chats.</p>
            </Reveal>

            <Reveal as="li" className="tw-travel-card relative isolate flex min-h-[280px] flex-col justify-end overflow-hidden p-7 text-[#fffdf8] md:col-span-2 lg:col-span-3">
              <div aria-hidden className="absolute inset-0 -z-10">
                <Photo image={IMAGES.beach} decorative sizes="100vw" className="size-full object-[50%_60%]" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#211d17]/90 via-[#211d17]/55 to-transparent" />
              </div>
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Share2 className="size-5" aria-hidden />
                  </span>
                  <h3 className="tw-travel-display mt-5 text-4xl tracking-[-0.03em]">One link for the group</h3>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/75">Share a clean read-only page with your route, dates and — if you want — the budget. Print it or save it as a PDF.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {["#b8502f", "#4f7a57", "#3f6f8f", "#a16a12"].map((c, i) => (
                      <span key={c} className="grid size-9 place-items-center rounded-full border-2 border-[#211d17] text-xs font-semibold text-white" style={{ background: c }}>
                        {"AMJR"[i]}
                      </span>
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold backdrop-blur">
                    <Copy className="size-3.5" aria-hidden /> Copy link
                  </span>
                </div>
              </div>
            </Reveal>
          </ul>
        </div>
      </section>

      {/* destinations */}
      <section id="destinations" aria-labelledby="places-h" className="scroll-mt-24 border-t border-border bg-[#f1eadc]/70 px-4 py-24 md:px-8 md:py-32">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="tw-travel-eyebrow">Start somewhere</p>
              <RevealWords id="places-h" text="A few places to borrow." className="tw-travel-display mt-4 text-5xl leading-[1] tracking-[-0.045em] md:text-7xl" />
            </div>
            <TravelPublicCta label="Start with a place" accent />
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLACES.map((place, i) => (
              <Reveal key={place} delay={i * 100} className={i % 2 ? "lg:mt-14" : undefined}>
                <Link href="/travel/join" className="group relative block overflow-hidden rounded-[24px]">
                  <div className="aspect-[3/4] overflow-hidden">
                    <DestinationPhoto destination={place} alt={place} className="size-full" imgClassName="transition-transform duration-[1.2s] ease-out group-hover:scale-[1.07]" placeholder="art" />
                  </div>
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#211d17]/75 via-transparent to-transparent" />
                  <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-2 text-[#fffdf8]">
                    <p className="tw-travel-display text-4xl tracking-[-0.03em]">{place}</p>
                    <span className="grid size-10 place-items-center rounded-full bg-[#fffdf8] text-[#211d17] transition-[rotate,background-color,color] duration-500 group-hover:rotate-45 group-hover:bg-accent group-hover:text-accent-foreground">
                      <ArrowUpRight className="size-4" aria-hidden />
                    </span>
                  </div>
                </Link>
                <p className="mt-2 px-1">
                  <PhotoCreditLine destination={place} />
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* closing */}
      <section className="px-4 py-24 md:px-8 md:py-32">
        <Reveal variant="clip" className="relative isolate mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] text-[#fffdf8]">
          <ScrollScene className="absolute inset-0 -z-10 overflow-hidden">
            <div className="tw-parallax h-[125%] -translate-y-[10%]">
              <Photo image={IMAGES.temple} decorative sizes="100vw" className="size-full" />
            </div>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#211d17]/92 via-[#211d17]/70 to-[#211d17]/30" />
          </ScrollScene>
          <div className="grid gap-10 px-6 py-16 md:px-14 md:py-24 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="tw-travel-hand text-3xl text-[#f6c9b2]">the next trip is the good part</p>
              <RevealWords text="Go on. Tell us where you are thinking." className="tw-travel-display mt-4 max-w-[14ch] text-5xl leading-[0.98] tracking-[-0.045em] md:text-7xl" />
              <p className="mt-6 max-w-lg text-sm leading-relaxed text-white/70">Free to start. Bring a date, a budget, a person or just a place name. The plan can change as often as you do.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Magnetic>
                <TravelPublicCta accent label="Plan your trip" />
              </Magnetic>
              <Link href="/travel/signin" className="group inline-flex h-12 items-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10">
                <RollText text="Sign in" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
