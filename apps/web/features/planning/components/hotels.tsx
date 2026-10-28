"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { Car, Coffee, Dumbbell, MapPin, Sparkles, Star, TreePalm, UtensilsCrossed, Waves, Wifi } from "lucide-react";
import { HotelCardSchema, HotelComparisonSchema } from "@tripweave/planning-contract";
import { cancellationText } from "@/features/trips/availability-badge";
import { formatDate, mealLabel, money, nightsLabel, titleCase } from "@/lib/utils";
import { resolvePlanningOffer, resolvePlanningPackage, usePlanningSnapshot } from "../context";
import { MissingEntity } from "../ui";
import { DestinationPhoto, PhotoCreditLine } from "./destination-photo";

const HOTEL_CARD_DESCRIPTION = "One hotel offer from CONTEXT with authoritative price, room, meal plan, cancellation and availability. Pass an offerId and, optionally, the packageId it came from.";
const HOTEL_COMPARISON_DESCRIPTION = "Side-by-side comparison of hotel offers from CONTEXT. Use only offerIds listed in CONTEXT.offers.";

const AMENITY_ICONS: { match: RegExp; icon: typeof Wifi }[] = [
  { match: /wi-?fi|internet/i, icon: Wifi },
  { match: /pool/i, icon: Waves },
  { match: /breakfast|coffee/i, icon: Coffee },
  { match: /restaurant|dining/i, icon: UtensilsCrossed },
  { match: /parking|car/i, icon: Car },
  { match: /gym|fitness/i, icon: Dumbbell },
  { match: /spa|wellness/i, icon: Sparkles },
  { match: /beach|garden/i, icon: TreePalm },
];

function AmenityIcons({ amenities }: { amenities: string[] }) {
  if (amenities.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Amenities">
      {amenities.slice(0, 5).map((amenity) => {
        const icon = AMENITY_ICONS.find((entry) => entry.match.test(amenity))?.icon;
        const Icon = icon ?? Sparkles;
        return (
          <li key={amenity} className="pl-chip capitalize">
            <Icon className="size-3 text-[var(--pl-sage)]" aria-hidden /> {amenity.replace(/[_-]+/g, " ")}
          </li>
        );
      })}
      {amenities.length > 5 ? <li className="pl-chip">+{amenities.length - 5}</li> : null}
    </ul>
  );
}

function AvailabilityChip({ offer }: { offer: { availabilityStatus: string; verificationStatus: string; isMock: boolean } }) {
  if (offer.isMock) return <span className="pl-chip pl-chip-accent">Illustrative data</span>;
  if (offer.availabilityStatus === "confirmed") return <span className="pl-chip pl-chip-sage">Available</span>;
  if (offer.availabilityStatus === "unavailable") return <span className="pl-chip pl-chip-accent">Unavailable</span>;
  if (offer.availabilityStatus === "on_request") return <span className="pl-chip pl-chip-accent">On request</span>;
  return <span className="pl-chip">Availability to confirm</span>;
}

function ReviewBubble({ score }: { score: number | null }) {
  if (score === null) return <span className="pl-chip bg-white/85 text-[#1c1a15]">Unrated</span>;
  return (
    <span className="tw-num inline-flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-bold text-[#1c1a15] shadow-sm ring-1 ring-black/5">
      <Star className="size-3 fill-[#c25736] text-[#c25736]" aria-hidden /> {score.toFixed(1)}
      <span className="font-medium opacity-60">/10</span>
    </span>
  );
}

export const HotelCard = defineComponent({
  name: "HotelCard",
  description: HOTEL_CARD_DESCRIPTION,
  props: HotelCardSchema,
  component: function HotelCardView({ props }) {
    const snapshot = usePlanningSnapshot();
    const entry = resolvePlanningOffer(snapshot, props.offerId);
    if (!entry) return <MissingEntity what="hotel offer" />;
    const pkg = props.packageId ? resolvePlanningPackage(snapshot, props.packageId) : null;
    if (props.packageId && !pkg) return <MissingEntity what="hotel offer for that package" />;
    if (pkg && !entry.packageIds.includes(pkg.id)) return <MissingEntity what="hotel offer for that package" />;
    const offer = entry.offer;
    const id = `planning-hotel-${offer.offerId}`;
    return (
      <article aria-labelledby={id} className="pl-card pl-photo overflow-hidden">
        <div className="relative">
          <DestinationPhoto destination={entry.destination} imageId={entry.coverImageId} className="h-52 w-full sm:h-56" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="pl-chip bg-white/90 text-[#1c1a15]">{offer.property.category ? titleCase(offer.property.category) : "Category unknown"}</span>
            <AvailabilityChip offer={offer} />
          </div>
          <div className="absolute right-3 top-3">
            <ReviewBubble score={offer.property.reviewScore} />
          </div>
        </div>
        <div className="flex flex-col gap-2.5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 id={id} className="pl-display text-[1.65rem] leading-[1.02]">
                {offer.property.name}
              </h4>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[var(--pl-muted)]">
                <MapPin className="size-3.5 text-[var(--pl-accent)]" aria-hidden /> {entry.destination} · {nightsLabel(offer.nights)}
                {pkg ? ` · package #${pkg.number}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="tw-num font-semibold text-[1.15rem] leading-none">{offer.totalAmountMinor === undefined ? "Included" : money(offer.totalAmountMinor, offer.currency)}</p>
              <p className="mt-1 text-[10px] text-[var(--pl-muted)]">{offer.totalAmountMinor === undefined ? "in package" : "supplier cost"}</p>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--pl-muted)]">
            {offer.roomType.name} · {mealLabel(offer.mealPlan)} · {offer.roomsRequired} room{offer.roomsRequired === 1 ? "" : "s"}
          </p>
          <AmenityIcons amenities={offer.property.amenities} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pl-chip">{cancellationText(offer.cancellation)}</span>
            {offer.verificationStatus === "live_checked" ? <span className="pl-chip pl-chip-sage">Live checked</span> : null}
            {offer.isMock ? <span className="pl-chip pl-chip-accent">Illustrative</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pl-line)] pt-2 text-[10px] text-[var(--pl-muted)]">
            <span className="tw-num">
              {formatDate(offer.stayStart, { day: "numeric", month: "short" })} → {formatDate(offer.stayEnd, { day: "numeric", month: "short" })} · {offer.providerKey}
            </span>
            <PhotoCreditLine destination={entry.destination} imageId={entry.coverImageId} />
          </div>
        </div>
      </article>
    );
  },
});

export const HotelComparison = defineComponent({
  name: "HotelComparison",
  description: HOTEL_COMPARISON_DESCRIPTION,
  props: HotelComparisonSchema,
  component: function HotelComparisonView({ props }) {
    const snapshot = usePlanningSnapshot();
    const entries = props.offerIds.map((offerId) => resolvePlanningOffer(snapshot, offerId)).filter((entry): entry is NonNullable<typeof entry> => !!entry);
    if (entries.length === 0) return <MissingEntity what="hotel comparison" />;
    const prices = entries.map((entry) => entry.offer.totalAmountMinor).filter((value): value is number => typeof value === "number");
    const cheapest = prices.length > 1 ? Math.min(...prices) : null;
    return (
      <section aria-label="Hotel comparison" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="pl-eyebrow">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--pl-accent)]" /> Side by side
            </p>
            <h3 className="pl-display mt-1 text-[1.9rem] leading-none">Which stay fits?</h3>
          </div>
          <span className="pl-chip">Rates and availability exactly as returned</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry, index) => {
            const offer = entry.offer;
            const best = cheapest !== null && offer.totalAmountMinor === cheapest;
            return (
              <article key={entry.offerId} className={`pl-card pl-rise pl-photo overflow-hidden ${best ? "ring-2 ring-[var(--pl-sage)] ring-offset-2 ring-offset-[var(--pl-bg)]" : ""}`} style={{ "--i": index } as React.CSSProperties}>
                <div className="relative">
                  <DestinationPhoto destination={entry.destination} imageId={entry.coverImageId} className="h-40 w-full" />
                  {best ? <span className="absolute left-3 top-3 rounded-full bg-[var(--pl-sage)] px-2.5 py-1 text-[10px] font-bold text-white">Lowest price</span> : null}
                  <div className="absolute right-3 top-3">
                    <ReviewBubble score={offer.property.reviewScore} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <div>
                    <h4 className="pl-display text-[1.35rem] leading-[1.05]">{offer.property.name}</h4>
                    <p className="mt-0.5 text-[11px] text-[var(--pl-muted)]">{entry.destination}</p>
                  </div>
                  <p className="text-[12px] text-[var(--pl-muted)]">
                    {offer.roomType.name} · {mealLabel(offer.mealPlan)} · {nightsLabel(offer.nights)}
                  </p>
                  <p className="tw-num text-[1.3rem] font-semibold leading-none">
                    {offer.totalAmountMinor === undefined ? "Included" : money(offer.totalAmountMinor, offer.currency)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <AvailabilityChip offer={offer} />
                    <span className="pl-chip">{cancellationText(offer.cancellation)}</span>
                  </div>
                  <div className="border-t border-[var(--pl-line)] pt-1.5">
                    <PhotoCreditLine destination={entry.destination} imageId={entry.coverImageId} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <details className="pl-card overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-[var(--pl-muted)] hover:text-[var(--pl-ink)]">Compare as a table</summary>
          <div className="overflow-x-auto border-t border-[var(--pl-line)]">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <caption className="sr-only">Comparison of hotel offers</caption>
              <thead className="bg-[var(--pl-surface-2)] text-left text-[10px] uppercase tracking-[0.12em] text-[var(--pl-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Hotel</th>
                  <th scope="col" className="px-3 py-2">Stay</th>
                  <th scope="col" className="px-3 py-2">Room &amp; board</th>
                  <th scope="col" className="px-3 py-2">Review</th>
                  <th scope="col" className="px-3 py-2 text-right">Price</th>
                  <th scope="col" className="px-3 py-2">Availability</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const offer = entry.offer;
                  return (
                    <tr key={entry.offerId} className="border-t border-[var(--pl-line)] align-top">
                      <th scope="row" className="px-3 py-2 text-left">
                        <span className="font-semibold">{offer.property.name}</span>
                        <span className="block text-[11px] font-normal text-[var(--pl-muted)]">{entry.destination}</span>
                      </th>
                      <td className="tw-num px-3 py-2 text-[11px]">
                        {formatDate(offer.stayStart, { day: "numeric", month: "short" })} → {formatDate(offer.stayEnd, { day: "numeric", month: "short" })} · {nightsLabel(offer.nights)}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {offer.roomType.name} · {mealLabel(offer.mealPlan)} · {offer.roomsRequired} room{offer.roomsRequired === 1 ? "" : "s"}
                        <span className="block text-[var(--pl-muted)]">{cancellationText(offer.cancellation)}</span>
                      </td>
                      <td className="tw-num px-3 py-2 text-[11px]">{offer.property.reviewScore === null ? "Unrated" : `${offer.property.reviewScore}/10`}</td>
                      <td className="tw-num px-3 py-2 text-right text-[11px]">
                        {offer.totalAmountMinor === undefined ? "Included in package" : money(offer.totalAmountMinor, offer.currency)}
                        {offer.isMock ? <span className="block text-[var(--pl-accent)]">Illustrative</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <AvailabilityChip offer={offer} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
        {entries.length < props.offerIds.length ? <p className="text-[11px] text-[var(--pl-muted)]">Some offers are no longer available from the server and were omitted.</p> : null}
      </section>
    );
  },
});
