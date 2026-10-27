import { Badge, StatusBadge } from "@/components/ui/card";
import type { NormalisedOffer } from "@tripweave/shared";
import { formatDate } from "@/lib/utils";

export const VERIFICATION_LABELS: Record<string, string> = {
  company_managed: "Company managed",
  supplier_reported: "Supplier reported",
  live_checked: "Live checked",
  estimated: "Estimated",
  expired: "Rate expired",
  unavailable: "Unavailable",
  requires_confirmation: "Requires confirmation",
  booked: "Booked",
};
export const AVAILABILITY_LABELS: Record<string, string> = {
  confirmed: "Availability confirmed",
  unknown: "Availability unknown",
  on_request: "On request",
  unavailable: "Unavailable",
};

/** Availability + verification state of an offer; mock data is always flagged prominently. */
export function AvailabilityBadges({ offer }: { offer: Pick<NormalisedOffer, "availabilityStatus" | "verificationStatus" | "isMock"> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {offer.isMock ? (
        <Badge tone="danger" className="border border-destructive/40">
          Illustrative data
        </Badge>
      ) : null}
      <StatusBadge status={offer.availabilityStatus} label={AVAILABILITY_LABELS[offer.availabilityStatus]} />
      <StatusBadge status={offer.verificationStatus} label={VERIFICATION_LABELS[offer.verificationStatus]} />
    </div>
  );
}

export function cancellationText(c: NormalisedOffer["cancellation"]): string {
  if (c.refundable === false) return `Non-refundable${c.penaltyDescription ? `: ${c.penaltyDescription}` : ""}`;
  if (c.refundable === true) return c.freeCancellationUntil ? `Free cancellation until ${formatDate(c.freeCancellationUntil)}` : "Refundable (free-cancellation date not stated)";
  return `Cancellation terms unknown${c.penaltyDescription ? `: ${c.penaltyDescription}` : ""}`;
}
