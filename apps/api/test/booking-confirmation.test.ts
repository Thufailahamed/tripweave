import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalisedOffer } from "@tripweave/shared";
import type { PriceCheckResult } from "@tripweave/provider-contracts";

vi.mock("@tripweave/database", () => ({
  quotes: { getQuote: vi.fn(), getVersion: vi.fn(), createBookingConfirmation: vi.fn() },
  trips: { getTrip: vi.fn() },
}));
vi.mock("../src/services/optimisation", () => ({ recheckOffer: vi.fn() }));

import { quotes, trips } from "@tripweave/database";
import { recheckOffer } from "../src/services/optimisation";
import { confirmQuoteForBooking } from "../src/services/booking-confirmation";

const NOW = new Date("2026-10-28T10:00:00.000Z");

function offer(id: string, total: number): NormalisedOffer {
  return {
    offerId: id, providerKey: "google_hotels", externalOfferReference: id, source: "external", supplierId: null,
    supplierName: "Booking.com via Google Hotels",
    property: { id: `g:${id}`, name: `Hotel ${id}`, destination: "Kandy", latitude: null, longitude: null, category: "comfort", starRating: 3, reviewScore: 8, amenities: [], ownerOrganizationId: null },
    roomType: { id: null, name: "Room", maxOccupancy: 2, maxAdults: 1 }, stayStart: "2027-03-05", stayEnd: "2027-03-09", nights: 4,
    mealPlan: "BB", mealPlanStatus: "confirmed", roomsRequired: 2,
    occupancy: { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1 }, { adults: 1, children: 1 }] },
    totalAmountMinor: total, currency: "USD", taxAmountMinor: null, feeAmountMinor: null, taxesIncluded: null,
    cancellation: { refundable: true, freeCancellationUntil: null }, payment: { type: "unknown" },
    retrievedAt: "2026-10-28T09:50:00.000Z", expiresAt: "2026-10-28T10:15:00.000Z",
    availabilityStatus: "unknown", verificationStatus: "live_checked", providerMetadata: {}, isMock: false,
  };
}

const quote = { id: "q1", organizationId: "org", tripRequestId: "t1", status: "accepted", currentVersion: 1, validUntil: "2026-11-10", currency: "USD", quoteNumber: "Q-2026-0001" };
const version = { versionNumber: 1, totalCostMinor: 40_000, package: { selections: [{ stopId: "s1", destination: "Kandy", costMinor: 40_000, offer: offer("a", 40_000), metrics: {} }] } };
const trip = { party: { adults: 2, children: 2, childAges: [8, 11], rooms: [{ adults: 1, children: 1 }, { adults: 1, children: 1 }] } };
const ctx = { env: {}, db: {}, deps: { now: () => NOW } } as never;

const check = (status: PriceCheckResult["status"], total: number | null): PriceCheckResult => ({
  status, offer: status === "confirmed" ? offer("a", total ?? 0) : null, previousTotalMinor: 40_000, currentTotalMinor: total, checkedAt: NOW.toISOString(),
});

describe("pre-booking confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(quotes.getQuote).mockResolvedValue(quote as never);
    vi.mocked(quotes.getVersion).mockResolvedValue(version as never);
    vi.mocked(trips.getTrip).mockResolvedValue(trip as never);
    vi.mocked(quotes.createBookingConfirmation).mockImplementation((async (_db: unknown, org: string, input: Parameters<typeof quotes.createBookingConfirmation>[2]) => ({
      id: "bc1", organizationId: org, quoteId: input.quoteId, quoteVersion: input.quoteVersion, reference: input.reference,
      status: input.status, checkedAt: input.checkedAt, validUntil: input.validUntil, currency: input.currency,
      totalCostMinor: input.totalCostMinor, checks: input.checks as unknown[], createdBy: input.createdBy, createdAt: NOW.toISOString(),
    })) as never);
  });

  it("confirms an accepted quote when every live check is unchanged", async () => {
    vi.mocked(recheckOffer).mockResolvedValue(check("confirmed", 40_000));
    const out = await confirmQuoteForBooking(ctx, "org", "u1", "q1");
    expect(out.allConfirmed).toBe(true);
    expect(out.confirmation).toMatchObject({ status: "confirmed", reference: expect.stringMatching(/^BC-Q-2026-0001-v1-/), validUntil: "2026-10-28T10:15:00.000Z" });
    expect(quotes.createBookingConfirmation).toHaveBeenCalledWith(expect.anything(), "org", expect.objectContaining({ status: "confirmed", totalCostMinor: 40_000 }));
  });

  it("fails without changing the quote when an accepted price moved", async () => {
    vi.mocked(recheckOffer).mockResolvedValue(check("price_changed", 42_000));
    const out = await confirmQuoteForBooking(ctx, "org", "u1", "q1");
    expect(out.allConfirmed).toBe(false);
    expect(out.changed).toBe(true);
    expect(out.confirmation).toMatchObject({ status: "failed", validUntil: null });
    expect(quotes.createBookingConfirmation).toHaveBeenCalledWith(expect.anything(), "org", expect.objectContaining({ status: "failed" }));
  });

  it("refuses to confirm a quote that is not accepted", async () => {
    vi.mocked(quotes.getQuote).mockResolvedValue({ ...quote, status: "sent" } as never);
    await expect(confirmQuoteForBooking(ctx, "org", "u1", "q1")).rejects.toThrow(/accepted quotation/i);
  });
});
