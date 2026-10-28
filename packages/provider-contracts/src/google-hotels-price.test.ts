import { describe, expect, it } from "vitest";
import { chooseGooglePrice } from "./google-hotels";

type GoogleProperty = Parameters<typeof chooseGooglePrice>[0];

/** A property with one priced source; the fields mirror SerpApi's money objects. */
function property(price: Record<string, unknown>): GoogleProperty {
  return { prices: [{ source: "Booking.com", ...price }] } as unknown as GoogleProperty;
}

describe("SerpApi (Google Hotels) stay price", () => {
  it("uses the after-tax-and-fee total, and records that taxes are included", () => {
    const choice = chooseGooglePrice(property({ total_rate: { extracted_lowest: 200, extracted_before_taxes_fees: 180, extracted_after_taxes_fees: 230 } }), 3, 1);
    expect(choice).toMatchObject({ source: "Booking.com", totalMinor: 23_000, taxesIncluded: true });
  });

  it("uses the displayed price when no after-tax figure is given, and leaves the tax treatment unknown", () => {
    const choice = chooseGooglePrice(property({ total_rate: { extracted_lowest: 200 } }), 3, 1);
    expect(choice).toMatchObject({ totalMinor: 20_000, taxesIncluded: null });
  });

  it("never prices a stay from a before-tax figure alone", () => {
    expect(chooseGooglePrice(property({ total_rate: { extracted_before_taxes_fees: 180 } }), 3, 1)).toBeNull();
    expect(chooseGooglePrice(property({ rate_per_night: { extracted_before_taxes_fees: 60 } }), 3, 1)).toBeNull();
  });

  it("scales a nightly figure by nights and rooms, and keeps the after-tax basis", () => {
    const choice = chooseGooglePrice(property({ rate_per_night: { extracted_lowest: 50, extracted_after_taxes_fees: 55 } }), 4, 2);
    expect(choice).toMatchObject({ totalMinor: 44_000, taxesIncluded: true, nightlyMinor: 5_500 });
  });

  it("scales a total by the number of rooms, the documented approximation for Google's room-less search", () => {
    const choice = chooseGooglePrice(property({ total_rate: { extracted_lowest: 200, extracted_after_taxes_fees: 230 } }), 3, 2);
    expect(choice?.totalMinor).toBe(46_000);
  });
});
