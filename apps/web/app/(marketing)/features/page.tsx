import Link from "next/link";
import type { Metadata } from "next";
import { CtaButtons } from "@/features/marketing/session-cta";
import { DATA_LABELS, OBJECTIVES } from "@/features/marketing/content";
import { IMAGES, Photo } from "@/features/marketing/imagery";
import { Reveal, RevealWords, ScrollScene } from "@/components/motion";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything TripWeave does, from enquiry intake and itinerary building to optimisation, pricing and branded quotations.",
};

interface Section {
  id: string;
  title: string;
  lead: string;
  points: string[];
}

const SECTIONS: Section[] = [
  {
    id: "enquiries",
    title: "Enquiries and customers",
    lead: "Capture a request once and keep everything about it together.",
    points: [
      "Trip requests with travellers, room needs, dates, interests, budget and a budget scope (accommodation only or the whole trip).",
      "Paste a free-text email and review what was understood. With AI switched off, a rules-based reader is used instead; either way you confirm before anything is applied.",
      "Clarifying questions are surfaced when something important is missing, instead of guessing.",
      "Customer records with notes, linked to their trips and quotations.",
    ],
  },
  {
    id: "itinerary",
    title: "Itinerary building",
    lead: "A route is a sequence of stops, with nights at each.",
    points: [
      "Add and edit stops, with the nights spent at each.",
      "Travel time and distance between stops come from a routing provider where one is configured, otherwise from a clearly labelled estimate.",
      "Optional AI can suggest a draft route from the enquiry. It is only ever a suggestion for you to edit.",
    ],
  },
  {
    id: "optimisation",
    title: "Optimisation",
    lead: "Searches hotel and room combinations and ranks five distinct packages.",
    points: [
      "Mandatory constraints (dates, room requirements, budget, availability) apply to every package.",
      "Five objectives give clients a real choice: " + OBJECTIVES.map((o) => o.label).join(", ") + ".",
      "Each package explains why it was chosen and which rate source each price relies on.",
      "When nothing fits, you get an explanation, not a made-up result. Long runs execute as background jobs with visible progress.",
    ],
  },
  {
    id: "inventory",
    title: "Hotels, rates and suppliers",
    lead: "Your own contracted inventory is the foundation.",
    points: [
      "Properties, room types and rate plans with seasonal rules and meal plans.",
      "Supplier records and agreements with contract references and validity dates; the dashboard warns before they expire.",
      "Bulk import of rates and inventory from spreadsheets, with validation before anything is saved.",
      "Optional live supplier search (for example Hotelbeds) when the platform operator has configured it and you switch it on.",
    ],
  },
  {
    id: "pricing",
    title: "Pricing and margins",
    lead: "Deterministic, auditable and entirely under your control.",
    points: [
      "Choose target margin, percentage markup or fixed markup, plus payment fee, selling tax, minimum profit, minimum selling price and rounding.",
      "Margin and markup are different things; the settings page shows a worked example so nobody confuses them.",
      "Guard rails: a maximum discount and an approval margin floor. Quotations that breach them need approval before they can be sent.",
      "Internal costs and margins are visible only to roles that are allowed to see them.",
      "Exchange-rate snapshots for LKR, USD, EUR and GBP. A quotation keeps the snapshot it was priced with, so later rate changes never alter an issued price.",
    ],
  },
  {
    id: "quotations",
    title: "Quotations",
    lead: "From chosen package to a document the client can act on.",
    points: [
      "Versioned quotations: revise without losing what was sent before.",
      "Branding: your name, logo, colours, contact details and footer text.",
      "PDF export, plus a secure link where the client can view the quotation and respond.",
      "Status tracking from draft to sent, viewed, accepted, rejected or expired.",
      "Illustrative (mock) data is always labelled and cannot be quoted.",
    ],
  },
  {
    id: "hotel-management",
    title: "For hotel management companies",
    lead: "A workspace for managing a portfolio on behalf of owners.",
    points: [
      "A portfolio view of the hotels you manage, with their rates and agreements.",
      "Partner sharing: choose which properties each partner tour operator can see.",
      "An enquiries inbox for requests that arrive through partners.",
    ],
  },
  {
    id: "team",
    title: "Team, security and audit",
    lead: "Control who can do what, and keep a record.",
    points: [
      "Roles: owner, admin, manager, staff, read-only and hotel portfolio manager, each with a fixed permission set.",
      "Suspend or remove people at any time. Suspending signs them out immediately.",
      "An audit log of sign-ins, team changes, settings changes and quotation events.",
      "Tenant isolation: each organisation sees only its own data. Platform support access needs a written reason, expires automatically and is itself logged in your audit log.",
      "Credentials for external services are held as platform secrets, never shown in the app.",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <ScrollScene as="section" mode="exit" className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <div className="tw-hero-media size-full">
            <Photo image={IMAGES.features} priority className="tw-hero-img size-full" />
          </div>
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/60 via-background/50 to-background" />
        <div className="tw-hero-copy px-4 pb-14 pt-36 md:px-8 md:pb-20 md:pt-48">
          <p className="tw-eyebrow tw-in-fade">Features</p>
          <RevealWords as="h1" text="Everything between a first enquiry and a signed-off quotation" delay={100} className="mt-5 max-w-5xl text-5xl font-semibold leading-[1] tracking-[-0.06em] text-white md:text-7xl" />
          <p className="tw-in-fade mt-6 max-w-2xl text-lg leading-snug text-white/75" style={{ "--d": "500ms" } as React.CSSProperties}>
            What follows is what TripWeave does today. Where something depends on platform configuration or a supplier connection, we say so.
          </p>
          <nav aria-label="On this page" className="mt-10 flex flex-wrap gap-2">
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="tw-in-fade rounded-full bg-primary-soft/80 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white hover:text-background" style={{ "--d": `${650 + i * 50}ms` } as React.CSSProperties}>
                {s.title}
              </a>
            ))}
          </nav>
        </div>
      </ScrollScene>

      <div className="px-4 md:px-8">
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="grid scroll-mt-24 gap-8 border-b border-border py-14 md:py-20 lg:grid-cols-[1fr_1.4fr]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Reveal as="p" variant="fade" className="tw-num text-sm text-muted-foreground">
                / {String(i + 1).padStart(2, "0")}
              </Reveal>
              <RevealWords id={`${s.id}-h`} text={s.title} className="mt-3 text-3xl font-semibold leading-[1.05] tracking-[-0.06em] md:text-[44px]" />
              <Reveal as="p" delay={200} className="mt-4 max-w-sm text-base text-foreground/60">
                {s.lead}
              </Reveal>
            </div>
            <ul className="flex flex-col border-t border-border">
              {s.points.map((p, j) => (
                <Reveal as="li" key={p} delay={j * 70} className="group flex gap-4 border-b border-border py-4 text-sm leading-relaxed text-foreground/85 transition-colors hover:text-foreground">
                  <span aria-hidden className="mt-0.5 font-semibold text-accent transition-transform duration-500 group-hover:rotate-90">+</span>
                  <span>{p}</span>
                </Reveal>
              ))}
            </ul>
          </section>
        ))}

        <section aria-labelledby="labels-h" className="py-14 md:py-20">
          <RevealWords id="labels-h" text="How we label data" className="text-3xl font-semibold tracking-[-0.06em] md:text-[44px]" />
          <p className="mt-4 max-w-2xl text-base text-foreground/60">Every rate and offer carries a source label so you always know how much to trust it.</p>
          <dl className="mt-10 grid gap-px border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {DATA_LABELS.map((d, i) => (
              <Reveal key={d.label} delay={i * 80} className="bg-background py-6 transition-colors duration-500 hover:bg-card sm:px-6">
                <dt className="text-base font-semibold tracking-[-0.03em]">{d.label}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-foreground/60">{d.text}</dd>
              </Reveal>
            ))}
          </dl>
        </section>
      </div>

      <section className="border-t border-border">
        <div className="flex flex-col items-start gap-8 px-4 py-20 md:px-8 md:py-28">
          <RevealWords text="Ready to try it with a real enquiry?" className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.06em] md:text-6xl" />
          <CtaButtons />
          <p className="text-xs text-muted-foreground">
            Questions about data handling? Read the{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="underline">
              terms
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
