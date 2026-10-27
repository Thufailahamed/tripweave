import { describe, expect, it } from "vitest";
import type { NormalisedOffer } from "@tripweave/shared";
import { assertQuotable } from "../src/services/quotes";
import { presentPackage, type StoredPackage } from "../src/services/pricing";

const NOW = new Date("2026-10-27T10:00:00.000Z");

function offer(over: Partial<NormalisedOffer> = {}): NormalisedOffer {
  return {
    offerId: "gh:tok:2027-03-05:2027-03-09:2:booking-com",
    providerKey: "google_hotels",
    externalOfferReference: "gh:tok:2027-03-05:2027-03-09:2:booking-com",
    source: "external",
    supplierId: null,
    supplierName: "Booking.com via Google Hotels",
    property: { id: "g:tok", name: "Test Hotel", destination: "Kandy", latitude: null, longitude: null, category: "comfort", starRating: 3, reviewScore: 8, amenities: [], ownerOrganizationId: null },
    roomType: { id: null, name: "Room", maxOccupancy: 2, maxAdults: 1 },
    stayStart: "2027-03-05",
    stayEnd: "2027-03-09",
    nights: 4,
    mealPlan: "BB",
    mealPlanStatus: "confirmed",
    roomsRequired: 2,
    occupancy: { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1 }, { adults: 1, children: 1 }] },
    totalAmountMinor: 40_000,
    currency: "USD",
    taxAmountMinor: null,
    feeAmountMinor: null,
    taxesIncluded: null,
    cancellation: { refundable: true, freeCancellationUntil: null },
    payment: { type: "unknown" },
    retrievedAt: "2026-10-27T09:50:00.000Z",
    expiresAt: "2026-10-27T10:15:00.000Z",
    availabilityStatus: "unknown",
    verificationStatus: "supplier_reported",
    providerMetadata: {},
    isMock: false,
    ...over,
  };
}

function pkg(o: NormalisedOffer): StoredPackage {
  return {
    objective: "budget_explorer",
    currency: "USD",
    totalCostMinor: 40_000,
    selections: [{ stopId: "s1", destination: "Kandy", costMinor: 40_000, offer: o, metrics: {} }],
  };
}

const verified = {
  status: "verified" as const,
  allVerified: true,
  checkedAt: "2026-10-27T10:00:00.000Z",
  validUntil: "2026-10-27T10:15:00.000Z",
  checks: [],
};

describe("quote price gate", () => {
  it("blocks an external package until a fresh live check exists", () => {
    expect(() => assertQuotable(pkg(offer()), NOW)).toThrow(/live price check/i);
  });

  it("blocks an external package whose live check expired", () => {
    expect(() => assertQuotable(pkg(offer()), NOW, { ...verified, validUntil: "2026-10-27T09:59:00.000Z" })).toThrow(/live price check.*expired|expired.*live price check/i);
  });

  it("allows a freshly verified external package", () => {
    expect(() => assertQuotable(pkg(offer({ verificationStatus: "live_checked" })), NOW, verified)).not.toThrow();
  });

  it("keeps a company-contract package quotable without an external check", () => {
    expect(() => assertQuotable(pkg(offer({ providerKey: "internal", source: "internal", verificationStatus: "company_managed" })), NOW)).not.toThrow();
  });

  it("redacts supplier totals from the verification summary for non-margin viewers", () => {
    const rec = {
      id: "p1", jobId: "j1", parentId: null, number: 1, objective: "budget_explorer", totalCostMinor: 40_000, currency: "USD",
      score: 0, objectiveScore: 0, breakdown: {}, package: pkg(offer()), feasibility: "feasible", manuallyModified: false, createdAt: NOW.toISOString(),
      verification: { ...verified, checks: [{ stopId: "s1", offerId: "o1", status: "confirmed", previousTotalMinor: 40_000, currentTotalMinor: 42_000 }] },
    };
    const shown = presentPackage(rec as never, { canSeeMargins: false, canSeeContracts: false }, null);
    expect(shown.verification.checks?.[0]).not.toHaveProperty("previousTotalMinor");
    expect(shown.verification.checks?.[0]).not.toHaveProperty("currentTotalMinor");
  });
});
