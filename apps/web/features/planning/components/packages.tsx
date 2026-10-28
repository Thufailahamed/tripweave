"use client";
import * as React from "react";
import { defineComponent, useTriggerAction } from "@openuidev/react-lang";
import { Check, ChevronDown, Layers, Sparkles, Wallet } from "lucide-react";
import { OBJECTIVE_LABELS } from "@tripweave/shared";
import { PackageComparisonSchema, PackageSummarySchema, RecommendationExplanationSchema } from "@tripweave/planning-contract";
import { money, nightsLabel, titleCase } from "@/lib/utils";
import { resolvePlanningPackage, usePlanningSnapshot } from "../context";
import { IconBadge, MissingEntity, SectionHeader } from "../ui";
import { DestinationPhoto, PhotoCreditLine } from "./destination-photo";

const SUMMARY_DESCRIPTION = "Summary of one optimised package from CONTEXT, including its selling price, budget position and hotels. Pass the packageId.";
const COMPARISON_DESCRIPTION = "Comparison of two or more optimised packages from CONTEXT. Use only packageIds listed in CONTEXT.packages.";
const EXPLANATION_DESCRIPTION = "The grounded, deterministic reasons for recommending one package from CONTEXT. Never add facts or numbers yourself. Pass the packageId.";

function objectiveLabel(objective: string): string {
  return OBJECTIVE_LABELS[objective as keyof typeof OBJECTIVE_LABELS] ?? titleCase(objective);
}

function budgetText(difference: number | null, currency: string): string {
  if (difference === null) return "No budget set to compare against";
  return difference >= 0 ? `${money(difference, currency)} under budget` : `${money(-difference, currency)} over budget`;
}

function ScoreRing({ score }: { score: number }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative grid size-12 shrink-0 place-items-center" role="img" aria-label={`Package score ${value} out of 100`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--pl-line)" strokeWidth="3" />
        <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--pl-sage)" strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
      </svg>
      <span className="tw-num text-[11px] font-bold">{value}</span>
    </span>
  );
}

const BREAKDOWN_LABELS: [keyof import("@tripweave/planning-contract").PlanningBreakdown, string][] = [
  ["budgetFit", "Budget fit"],
  ["quality", "Quality"],
  ["location", "Location"],
  ["amenities", "Amenities"],
  ["cancellation", "Cancellation"],
  ["preference", "Preferences"],
  ["value", "Value"],
];

export const PackageSummary = defineComponent({
  name: "PackageSummary",
  description: SUMMARY_DESCRIPTION,
  props: PackageSummarySchema,
  component: function PackageSummaryView({ props }) {
    const snapshot = usePlanningSnapshot();
    const triggerAction = useTriggerAction();
    const pkg = resolvePlanningPackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;
    const id = `planning-package-${pkg.id}`;
    const anyMock = pkg.package.selections.some((selection) => selection.offer.isMock);
    const hero = pkg.package.selections.find((selection) => selection.coverImageId) ?? pkg.package.selections[0];
    return (
      <article aria-labelledby={id} className="pl-card pl-photo overflow-hidden">
        <div className="grid sm:grid-cols-[1.05fr_1fr]">
          <div className="relative min-h-[220px]">
            <DestinationPhoto destination={hero?.destination ?? snapshot.trip.title} imageId={hero?.coverImageId} className="absolute inset-0 size-full" />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,10,0.18),transparent_45%,rgba(20,16,10,0.4))]" />
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              <span className="pl-chip bg-white/90 text-[#1c1a15]">Package #{pkg.number}</span>
              {anyMock ? <span className="pl-chip bg-[var(--pl-accent)] text-white">Illustrative</span> : null}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
              <div>
                <p className="pl-eyebrow text-white/75">Selling price</p>
                <p className="tw-num pl-display mt-1 text-[2.15rem] leading-none text-white">{pkg.pricing ? money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency) : "Unavailable"}</p>
              </div>
              <span className="pb-0.5">
                <PhotoCreditLine destination={hero?.destination ?? ""} imageId={hero?.coverImageId} />
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="pl-eyebrow">{objectiveLabel(pkg.objective)}</p>
                <h3 id={id} className="pl-display mt-1 text-[1.75rem] leading-[1.02]">
                  {pkg.package.selections.map((selection) => selection.destination).join(" · ")}
                </h3>
              </div>
              <ScoreRing score={pkg.package.score} />
            </div>
            <p className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${pkg.package.budgetDifferenceMinor === null ? "text-[var(--pl-muted)]" : pkg.package.budgetDifferenceMinor >= 0 ? "text-[var(--pl-sage)]" : "text-[var(--pl-accent)]"}`}>
              <Wallet className="size-3.5" aria-hidden /> {budgetText(pkg.package.budgetDifferenceMinor, pkg.package.currency)}
            </p>
            <ul className="flex flex-col gap-1.5" aria-label="Hotels in this package">
              {pkg.package.selections.map((selection) => (
                <li key={selection.stopId} className="flex items-center gap-2.5 rounded-xl border border-[var(--pl-line)] bg-[var(--pl-surface-2)] px-2 py-1.5">
                  <DestinationPhoto destination={selection.destination} imageId={selection.coverImageId} className="size-9 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">{selection.offer.property.name}</span>
                    <span className="block text-[10px] text-[var(--pl-muted)]">
                      {selection.destination} · {nightsLabel(selection.offer.nights)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className="pl-btn pl-btn-solid" onClick={() => void triggerAction("Open package comparison", undefined, { type: "open_packages", params: {} })}>
                <Layers className="size-3.5" /> Open packages
              </button>
              <span className="text-[10px] text-[var(--pl-muted)]">Not a booking. Availability is checked on the package page.</span>
            </div>
          </div>
        </div>
      </article>
    );
  },
});

export const PackageComparison = defineComponent({
  name: "PackageComparison",
  description: COMPARISON_DESCRIPTION,
  props: PackageComparisonSchema,
  component: function PackageComparisonView({ props }) {
    const snapshot = usePlanningSnapshot();
    const triggerAction = useTriggerAction();
    const packages = props.packageIds.map((packageId) => resolvePlanningPackage(snapshot, packageId)).filter((pkg): pkg is NonNullable<typeof pkg> => !!pkg);
    const [selectedId, setSelectedId] = React.useState(() => packages[0]?.id ?? "");
    if (packages.length === 0) return <MissingEntity what="package comparison" />;
    const selected = packages.find((pkg) => pkg.id === selectedId) ?? packages[0]!;
    return (
      <section aria-label="Package comparison" className="flex flex-col gap-3">
        <SectionHeader icon={Layers} eyebrow="Choose a pace" title="Ways to take this trip" meta={<span className="pl-chip">{packages.length} server-priced option{packages.length === 1 ? "" : "s"}</span>} />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
          <div className="flex gap-2 overflow-x-auto pb-1 pl-scroll lg:flex-col lg:overflow-visible lg:pb-0" role="tablist" aria-label="Packages">
            {packages.map((pkg) => {
              const active = pkg.id === selected.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(pkg.id)}
                  className={`min-w-[220px] shrink-0 rounded-2xl border p-3 text-left transition lg:min-w-0 ${active ? "border-[var(--pl-ink)] bg-[var(--pl-surface)] shadow-[0_18px_30px_-26px_rgba(30,22,12,0.55)]" : "border-[var(--pl-line)] bg-[var(--pl-surface-2)] hover:border-[color-mix(in_oklab,var(--pl-ink)_30%,var(--pl-line))]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--pl-muted)]">#{pkg.number}</span>
                    {pkg.package.budgetDifferenceMinor !== null ? (
                      <span className={`pl-chip ${pkg.package.budgetDifferenceMinor >= 0 ? "pl-chip-sage" : "pl-chip-accent"}`}>{pkg.package.budgetDifferenceMinor >= 0 ? "In budget" : "Over budget"}</span>
                    ) : null}
                  </div>
                  <p className="pl-display mt-1.5 text-[1.35rem] leading-none">{objectiveLabel(pkg.objective)}</p>
                  <p className="mt-1 truncate text-[11px] text-[var(--pl-muted)]">{pkg.package.selections.map((selection) => selection.destination).join(" · ")}</p>
                  <p className="tw-num mt-2 text-[15px] font-semibold">{pkg.pricing ? money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency) : "Pricing unavailable"}</p>
                </button>
              );
            })}
          </div>

          <article className="pl-card overflow-hidden" role="tabpanel" aria-label={`Package ${selected.number} details`}>
            <div className="grid grid-cols-3 gap-px bg-[var(--pl-line)]">
              {selected.package.selections.slice(0, 3).map((selection) => (
                <div key={selection.stopId} className="relative">
                  <DestinationPhoto destination={selection.destination} imageId={selection.coverImageId} className="h-28 w-full sm:h-36" />
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-[4px]">{selection.destination}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="pl-eyebrow">Package #{selected.number} · {objectiveLabel(selected.objective)}</p>
                  <p className="tw-num pl-display mt-1 text-[2rem] leading-none">{selected.pricing ? money(selected.pricing.sellingPriceMinor, selected.pricing.currency) : "Pricing unavailable"}</p>
                  <p className={`mt-1 text-[11px] font-semibold ${selected.package.budgetDifferenceMinor !== null && selected.package.budgetDifferenceMinor >= 0 ? "text-[var(--pl-sage)]" : "text-[var(--pl-accent)]"}`}>{budgetText(selected.package.budgetDifferenceMinor, selected.package.currency)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreRing score={selected.package.score} />
                  <span className="text-[10px] leading-tight text-[var(--pl-muted)]">overall<br />score</span>
                </div>
              </div>

              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {BREAKDOWN_LABELS.map(([key, label]) => {
                  // The engine stores these sub-scores as 0..1; older snapshots may already be 0..100.
                  const raw = selected.package.breakdown[key];
                  const value = Math.max(0, Math.min(100, Math.round(raw <= 1 ? raw * 100 : raw)));
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-[10px] text-[var(--pl-muted)]">
                        <span>{label}</span>
                        <span className="tw-num font-semibold text-[var(--pl-ink)]">{value}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-2)] ring-1 ring-inset ring-[var(--pl-line)]">
                        <span className="pl-bar block h-full rounded-full bg-[var(--pl-sage)]" style={{ width: `${Math.max(2, value)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <ul className="flex flex-col gap-1.5" aria-label="Hotels in the selected package">
                {selected.package.selections.map((selection) => (
                  <li key={selection.stopId} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--pl-line)] px-2.5 py-1.5 text-[12px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <DestinationPhoto destination={selection.destination} imageId={selection.coverImageId} className="size-8 shrink-0 rounded-md" />
                      <span className="truncate font-semibold">{selection.offer.property.name}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--pl-muted)]">{nightsLabel(selection.offer.nights)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="pl-btn pl-btn-solid" onClick={() => void triggerAction("Open package comparison", undefined, { type: "open_packages", params: {} })}>
                  <Layers className="size-3.5" /> Open packages
                </button>
                <span className="text-[10px] text-[var(--pl-muted)]">Prices are the latest server calculation; live availability is checked on the package page.</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    );
  },
});

export const RecommendationExplanation = defineComponent({
  name: "RecommendationExplanation",
  description: EXPLANATION_DESCRIPTION,
  props: RecommendationExplanationSchema,
  component: function RecommendationExplanationView({ props }) {
    const snapshot = usePlanningSnapshot();
    const pkg = resolvePlanningPackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package explanation" />;
    return (
      <section aria-label="Why this package" className="pl-card overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5"><IconBadge icon={Sparkles} size="sm" /><p className="pl-eyebrow">Why this one</p></div>
            <span className="pl-chip pl-chip-sage">Grounded in server facts</span>
          </div>
          <h3 className="pl-display mt-2 max-w-xl text-[2rem] leading-[1.02]">
            {objectiveLabel(pkg.objective)} · #{pkg.number}
          </h3>
          <p className="pl-hand mt-1.5">the short version</p>
          {pkg.package.explanation.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {pkg.package.explanation.map((line, index) => (
                <li key={line} className="pl-rise flex items-start gap-2 rounded-xl bg-[var(--pl-sage-soft)] px-3 py-2 text-[12.5px] leading-relaxed" style={{ "--i": index } as React.CSSProperties}>
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--pl-sage)]" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="mt-3 text-sm text-[var(--pl-muted)]">
              The optimiser did not record a narrative explanation for this package. The score breakdown and hotel details are still available.
            </p>
          )}
          {pkg.package.diversityNote ? <p className="mt-2 text-[11px] text-[var(--pl-muted)]">{pkg.package.diversityNote}</p> : null}

          {pkg.package.unverified.length > 0 || pkg.package.assumptions.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2 border-t border-[var(--pl-line)] pt-3">
              {pkg.package.unverified.length > 0 ? (
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[var(--pl-muted)] hover:text-[var(--pl-ink)]">
                    <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden /> Still to verify ({pkg.package.unverified.length})
                  </summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-[var(--pl-muted)]">
                    {pkg.package.unverified.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {pkg.package.assumptions.length > 0 ? (
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[var(--pl-muted)] hover:text-[var(--pl-ink)]">
                    <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden /> Assumptions ({pkg.package.assumptions.length})
                  </summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-[var(--pl-muted)]">
                    {pkg.package.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-[10px] text-[var(--pl-muted)]">Built from the package's stored facts. It adds no prices, availability or promises.</p>
        </div>
      </section>
    );
  },
});
