"use client";
import * as React from "react";
import { defineComponent } from "@openuidev/react-lang";
import { ArrowRight, ArrowUpRight, BadgeCheck, Car, ChevronDown, Coffee, ExternalLink, Images, Repeat, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { PACKAGE_PROP_SCHEMAS, packageShowcaseDescriptions, type PackageShowcaseAction, type PlanningHotelOffer, type PlanningPackageSelection } from "@tripweave/planning-contract";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatDateTime, mealLabel, minutesLabel, money, nightsLabel } from "@/lib/utils";
import { DestinationPhoto } from "@/features/planning/components/destination-photo";
import { budgetPosition, liveStatus, needsLiveCheck, nightsOf, perNightMinor, perTravellerMinor, resolveShowcasePackage, sellingPriceOf, travellerCount } from "../helpers";
import { usePackageShowcase } from "../context";
import { googleRatingOf, hotelPhotosOf, HotelPhotoImage, type HotelPhoto } from "../photos";
import { useDisplayCurrency, useMoney } from "../currency";
import { BREAKDOWN_LABELS, MissingEntity, Meter, ScoreBar, ScoreRing, Stars, budgetText, objectiveLabel, shortCancellation, useHostAction } from "./shared";

type Selection = PlanningPackageSelection;

/** Where a stay's rate came from, in words the reader recognises. */
function sourceOf(selection: Selection): { label: string; tone: "info" | "neutral" | "danger" } {
  const offer = selection.offer;
  if (offer.isMock) return { label: "Illustrative rate", tone: "danger" };
  if (offer.providerKey === "google_hotels") {
    const seller = typeof offer.providerMetadata?.cheapestSource === "string" ? offer.providerMetadata.cheapestSource : null;
    return { label: seller && seller !== "Google Hotels" ? `${seller} via Google Hotels` : "Google Hotels", tone: "info" };
  }
  if (offer.source === "internal") return { label: "Your catalogue", tone: "neutral" };
  return { label: offer.supplierName || "External supplier", tone: "info" };
}

/** Photo tile for the hero mosaic, labelled with the stop it belongs to. */
function MosaicTile({ selection, photo, index, width, height, eager, caption }: { selection: Selection; photo: HotelPhoto | undefined; index: number; width: number; height: number; eager?: boolean; caption: boolean }) {
  return (
    <figure className="relative min-h-0 overflow-hidden bg-muted">
      <HotelPhotoImage photo={photo} alt={selection.offer.property.name} destination={selection.destination} width={width} height={height} eager={eager} className="transition-transform duration-[1600ms] ease-out group-hover/pkg:scale-[1.05]" />
      {caption ? (
        <figcaption className="absolute bottom-2 right-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-md">
          <span className="tw-num text-white/60">{index + 1}</span> {selection.destination}
        </figcaption>
      ) : null}
    </figure>
  );
}

type BookingLink = NonNullable<PlanningHotelOffer["bookingLinks"]>[number];

/**
 * Dated links to book or compare a stay. A seller link is a short-lived Google redirect captured by the
 * live check, so it is offered only while that check is valid; the Google Hotels page always works.
 */
function StayLinks({ links, sellerValid }: { links: BookingLink[]; sellerValid: boolean }) {
  const shown = links.filter((link) => link.kind !== "seller" || sellerValid);
  if (!shown.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {shown.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noreferrer noopener nofollow"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            link.kind === "seller" ? "border-accent bg-accent text-accent-foreground hover:bg-accent/90" : "border-border bg-card text-foreground hover:border-foreground/30",
          )}
        >
          {link.label}
          <ArrowUpRight className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

function StayRow({ selection, index, photos, showCost, isLast, links, sellerValid }: { selection: Selection; index: number; photos: HotelPhoto[]; showCost: boolean; isLast: boolean; links: BookingLink[]; sellerValid: boolean }) {
  const offer = selection.offer;
  const rating = googleRatingOf(offer);
  const source = sourceOf(selection);
  const live = offer.verificationStatus === "live_checked";
  const link = typeof offer.providerMetadata?.link === "string" ? offer.providerMetadata.link : null;
  const mealUnconfirmed = offer.mealPlanStatus === "unconfirmed";

  return (
    <li className="relative grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3.5">
      {!isLast ? <span aria-hidden className="absolute left-[2.6rem] top-[5.6rem] h-[calc(100%-4.6rem)] w-px bg-border" /> : null}
      <div className="relative size-[5.25rem] overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
        <HotelPhotoImage photo={photos[0]} alt={offer.property.name} destination={selection.destination} width={200} height={200} />
        {photos.length > 1 ? (
          <span className="tw-num absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-px text-[9.5px] font-semibold text-white">
            <Images className="size-2.5" aria-hidden /> {photos.length}
          </span>
        ) : photos.length === 0 ? (
          <span className="absolute inset-x-1 bottom-1 truncate rounded-full bg-black/60 px-1.5 py-px text-center text-[9px] font-medium text-white" title="No hotel photo yet; this shows the area">
            Area photo
          </span>
        ) : null}
      </div>
      <div className="min-w-0 pb-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="text-accent">Stop {index + 1}</span>
          <span aria-hidden>·</span>
          {selection.destination}
          <span aria-hidden>·</span>
          <span className="tw-num normal-case tracking-normal">
            {formatDate(offer.stayStart, { day: "numeric", month: "short" })} – {formatDate(offer.stayEnd, { day: "numeric", month: "short" })} · {nightsLabel(offer.nights)}
          </span>
        </p>
        <div className="mt-0.5 flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 font-semibold leading-snug">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer noopener" className="hover:underline">
                {offer.property.name}
                <ExternalLink className="ml-1 inline size-3 align-[-1px] text-muted-foreground" aria-label="(opens the hotel's site)" />
              </a>
            ) : (
              offer.property.name
            )}
          </p>
          {showCost && typeof offer.totalAmountMinor === "number" ? (
            <span className="tw-num shrink-0 text-[11px] text-muted-foreground" title="Supplier cost for this stay. Internal: not shown to customers.">
              cost {money(offer.totalAmountMinor, offer.currency)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <Stars count={offer.property.starRating} />
          {rating ? (
            <span className="tw-num inline-flex items-center gap-1 font-medium text-foreground/85">
              <Star className="size-3 fill-accent text-accent" aria-hidden />
              {rating.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">
                Google{rating.reviews !== null ? ` · ${rating.reviews.toLocaleString()} reviews` : ""}
              </span>
            </span>
          ) : offer.property.reviewScore !== null ? (
            <span className="tw-num font-medium text-foreground/85">{offer.property.reviewScore.toFixed(1)}/10</span>
          ) : (
            <span>Unrated</span>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {offer.roomsRequired > 1 ? `${offer.roomsRequired} × ` : ""}
          {offer.roomType.name}
          <span aria-hidden> · </span>
          <span className={cn("inline-flex items-center gap-1", mealUnconfirmed && "text-warning")}>
            <Coffee className="size-3" aria-hidden />
            {mealLabel(offer.mealPlan)}
            {mealUnconfirmed ? " (to confirm)" : ""}
          </span>
          <span aria-hidden> · </span>
          <span className={cn(offer.cancellation.refundable === false && "text-destructive", offer.cancellation.refundable === true && "text-success")}>{shortCancellation(offer.cancellation)}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={source.tone} className="font-medium">
            {source.label}
          </Badge>
          {offer.source === "external" ? (
            live ? (
              <Badge tone="success">
                <BadgeCheck className="size-3" aria-hidden /> Live {formatDateTime(offer.retrievedAt).split(", ").pop()}
              </Badge>
            ) : (
              <Badge tone="warning">Search rate</Badge>
            )
          ) : null}
        </div>
        <StayLinks links={links} sellerValid={sellerValid} />
      </div>
    </li>
  );
}

export const PackageCard = defineComponent({
  name: "PackageCard",
  description: packageShowcaseDescriptions.PackageCard,
  props: PACKAGE_PROP_SCHEMAS.PackageCard,
  component: function PackageCardView({ props }) {
    const { snapshot, pending, photos, surface } = usePackageShowcase();
    const act = useHostAction();
    const headingId = React.useId();
    const [open, setOpen] = React.useState(false);
    const fmt = useMoney();
    const { currency: display, fx } = useDisplayCurrency();
    const pkg = resolveShowcasePackage(snapshot, props.packageId);
    if (!pkg) return <MissingEntity what="package" />;

    const body = pkg.package;
    const price = sellingPriceOf(pkg);
    const currency = pkg.pricing?.currency ?? body.currency;
    const converted = !!display && display !== currency && !!fx?.rates[display] && !!fx?.rates[currency];
    const nights = nightsOf(pkg);
    const travellers = travellerCount(snapshot.trip);
    const perNight = perNightMinor(price, nights);
    const perPerson = perTravellerMinor(price, travellers);
    const blocked = needsLiveCheck(pkg);
    const live = liveStatus(pkg);
    const budget = budgetPosition(pkg, snapshot.trip);
    const lead = props.emphasis === "lead";
    const anyMock = body.selections.some((selection) => selection.offer.isMock);
    /** Every stay is from the operator's own catalogue, so there is no external rate to check live. */
    const catalogueOnly = !body.selections.some((selection) => selection.offer.source === "external");
    const showCost = snapshot.permissions.canSeeMargins;
    const can = (action: PackageShowcaseAction) => snapshot.allowedActions.includes(action);
    const stayPhotos = body.selections.map((selection) => hotelPhotosOf(selection.offer, selection.coverImageId, photos));
    const mosaic = body.selections.slice(0, 3);
    const stopName = (stopId: string) => body.selections.find((selection) => selection.stopId === stopId)?.destination ?? "Stop";
    const budgetTone = budget.difference === null ? "text-muted-foreground" : budget.difference >= 0 ? "text-success" : "text-destructive";

    return (
      <article
        aria-labelledby={headingId}
        data-package-ref={pkg.ref}
        className={cn(
          "group/pkg relative flex h-full min-w-0 flex-col overflow-hidden rounded-[22px] border bg-card shadow-[0_1px_2px_rgba(20,26,45,0.05),0_24px_50px_-30px_rgba(20,26,45,0.35)] transition-[border-color,box-shadow,translate] duration-500 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(20,26,45,0.06),0_32px_64px_-30px_rgba(20,26,45,0.45)]",
          lead ? "border-accent/60 ring-1 ring-accent/35" : "border-border/80",
          anyMock && "border-destructive/50",
        )}
      >
        <div className={cn("relative grid h-60 gap-px bg-border/60 sm:h-64", mosaic.length >= 2 && "grid-cols-[1.65fr_1fr]")}>
          {mosaic.length === 0 ? (
            <DestinationPhoto destination={snapshot.trip.title} className="size-full" />
          ) : (
            <>
              <MosaicTile selection={mosaic[0]!} photo={stayPhotos[0]?.[0]} index={0} width={720} height={520} eager={lead} caption={false} />
              {mosaic.length >= 2 ? (
                <div className={cn("grid min-h-0 gap-px", mosaic.length === 3 && "grid-rows-2")}>
                  {mosaic.slice(1).map((selection, i) => (
                    <MosaicTile key={selection.stopId} selection={selection} photo={stayPhotos[i + 1]?.[0]} index={i + 1} width={420} height={300} caption />
                  ))}
                </div>
              ) : null}
            </>
          )}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/5" />
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {lead ? <Badge className="bg-accent text-accent-foreground shadow-sm">Recommended</Badge> : null}
              <Badge className="bg-white/90 text-[#16130f] shadow-sm">
                #{pkg.number} · {objectiveLabel(pkg.objective)}
              </Badge>
              {pkg.parentId ? <Badge className="bg-white/90 text-[#16130f]">{pkg.manuallyModified ? "Modified" : "Re-priced"}</Badge> : null}
              {anyMock ? <Badge tone="danger">Illustrative</Badge> : null}
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-md",
                live.state === "live" || catalogueOnly ? "bg-success/90 text-white" : "bg-black/55 text-white/90",
              )}
            >
              {live.state === "live" || catalogueOnly ? <ShieldCheck className="size-3" aria-hidden /> : null}
              {catalogueOnly ? "Contracted rates" : live.state === "live" ? "Live prices" : live.state === "expired" ? "Check expired" : "Indicative"}
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Package price</p>
              <p className="tw-num mt-1 font-display text-[34px] font-semibold leading-none tracking-[-0.04em]">{price === null ? "Unavailable" : fmt(price, currency)}</p>
              <p className="tw-num mt-1.5 text-xs text-white/80">
                {perNight !== null ? `${fmt(perNight, currency)} / night` : nightsLabel(nights)}
                {perPerson !== null ? ` · ${fmt(perPerson, currency)} / traveller` : ""}
              </p>
              {converted && price !== null ? <p className="tw-num mt-1 text-[11px] text-white/65">Billed {money(price, currency)}</p> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={headingId} className="font-display text-xl font-semibold leading-tight tracking-[-0.03em]">
                {objectiveLabel(pkg.objective)}
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {body.selections.map((selection, i) => (
                  <React.Fragment key={selection.stopId}>
                    {i > 0 ? <ArrowRight className="size-3" aria-hidden /> : null}
                    <span>{selection.destination}</span>
                  </React.Fragment>
                ))}
                <span aria-hidden>·</span>
                <span className="tw-num">
                  {nightsLabel(nights)} · {travellers} traveller{travellers === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            <ScoreRing score={body.score} />
          </div>

          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={cn("text-sm font-semibold", budgetTone)}>{budgetText(budget.difference, currency, false, fmt)}</p>
              {snapshot.trip.budgetAmountMinor !== null ? (
                <p className="tw-num text-[11px] text-muted-foreground">Budget {fmt(snapshot.trip.budgetAmountMinor, snapshot.trip.budgetCurrency)}</p>
              ) : null}
            </div>
            {budget.meterFraction !== null ? <Meter label="Share of the trip budget" fraction={budget.meterFraction} className="mt-2" /> : null}
          </div>

          <ol aria-label="Hotels in this package" className="flex flex-col gap-4">
            {body.selections.map((selection, index) => (
              <StayRow
                key={selection.stopId}
                selection={selection}
                index={index}
                photos={stayPhotos[index] ?? []}
                showCost={showCost}
                isLast={index === body.selections.length - 1}
                links={snapshot.offers.find((entry) => entry.offerId === selection.offer.offerId)?.bookingLinks ?? []}
                sellerValid={live.state === "live"}
              />
            ))}
          </ol>

          {open ? (
            <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-background/40 p-4">
              {body.explanation.length > 0 ? (
                <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-foreground/85">
                  {body.explanation.slice(0, 5).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {BREAKDOWN_LABELS.map((item) => (
                  <ScoreBar key={item.key} label={item.label} value={body.breakdown[item.key]} />
                ))}
              </div>
              {body.travel.legs.length > 0 ? (
                <div className="text-xs">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Car className="size-3.5 text-accent" aria-hidden />
                    {body.travel.totalDriveMinutes === null ? "Drive time unavailable" : `${minutesLabel(body.travel.totalDriveMinutes)} driving in total`}
                    {body.travel.anyEstimated ? <Badge tone="warning">Estimated</Badge> : null}
                  </p>
                  <ul className="tw-num mt-1 flex flex-col gap-0.5 text-muted-foreground">
                    {body.travel.legs.map((leg, i) => (
                      <li key={i}>
                        {stopName(leg.fromStopId)} → {stopName(leg.toStopId)}: {leg.durationMinutes === null ? "unavailable" : minutesLabel(leg.durationMinutes)}
                        {leg.distanceKm !== null ? `, ${leg.distanceKm} km` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pkg.pricing ? (
                <dl className="tw-num grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-xs">
                  <dt className="text-muted-foreground">Selling price</dt>
                  <dd className="text-right font-semibold">{money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency)}</dd>
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="text-right">{money(pkg.pricing.sellingTaxMinor, pkg.pricing.currency)}</dd>
                  <dt className="text-muted-foreground">Total payable</dt>
                  <dd className="text-right font-semibold">{money(pkg.pricing.totalPayableMinor, pkg.pricing.currency)}</dd>
                  {showCost && typeof body.totalCostMinor === "number" ? (
                    <>
                      <dt className="text-muted-foreground">Hotel cost (internal)</dt>
                      <dd className="text-right">{money(body.totalCostMinor, currency)}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
              {body.unverified.length > 0 ? <p className="text-xs text-warning">Not yet verified: {body.unverified.join("; ")}</p> : null}
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 border-t border-border/70 pt-4">
            {blocked ? <p className="text-xs text-warning">Check live prices before creating a quotation.</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {can("create_quote") ? (
                <Button size="sm" loading={pending === `create_quote:${pkg.ref}`} disabled={blocked} title={blocked ? "Check live prices before creating a quotation" : undefined} onClick={() => act("Create quotation", "create_quote", { packageId: pkg.ref })}>
                  Create quotation
                </Button>
              ) : null}
              {can("validate_package") && !catalogueOnly ? (
                <Button size="sm" variant={blocked ? "accent" : "outline"} loading={pending === `validate_package:${pkg.ref}`} onClick={() => act("Check live prices", "validate_package", { packageId: pkg.ref })}>
                  <RefreshCw /> {live.state === "live" ? "Re-check" : "Check live prices"}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                Details <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
              </Button>
              {surface !== "gallery" ? (
                <Button size="sm" variant="ghost" onClick={() => act("Show in packages", "focus_package", { packageId: pkg.ref })}>
                  Show in list
                </Button>
              ) : null}
            </div>
            {can("replace_hotel") || can("reprice_package") ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {can("replace_hotel") ? (
                  <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => act("Replace a hotel", "replace_hotel", { packageId: pkg.ref })}>
                    <Repeat className="size-3" aria-hidden /> Replace a hotel
                  </button>
                ) : null}
                {can("reprice_package") ? (
                  <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => act("Re-price", "reprice_package", { packageId: pkg.ref })}>
                    <RefreshCw className="size-3" aria-hidden /> Re-price
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  },
});
