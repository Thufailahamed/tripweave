import { describe, expect, it } from "vitest";
import { budgetPosition, checkCounts, liveStatus, lowestPricedId, needsLiveCheck, nightsOf, perNightMinor, perTravellerMinor, sortPackages, travellerCount } from "./helpers";
import { KANDY_OFFER, LIVE_VALID_UNTIL, PKG_1, PKG_2, makePackage, makeShowcaseSnapshot, selectionOf } from "./testing";

const NOW = Date.parse("2026-10-28T10:00:00.000Z");

describe("package showcase helpers", () => {
  it("derives nights and traveller counts from the server data", () => {
    expect(nightsOf(PKG_1)).toBe(3);
    expect(nightsOf(PKG_2)).toBe(4);
    expect(travellerCount(makeShowcaseSnapshot().trip)).toBe(2);
    expect(perNightMinor(36_000, 3)).toBe(12_000);
    expect(perTravellerMinor(36_000, 2)).toBe(18_000);
    expect(perNightMinor(36_000, 0)).toBeNull();
    expect(perTravellerMinor(null, 2)).toBeNull();
  });

  it("rounds per-night and per-traveller figures to whole minor units", () => {
    expect(perNightMinor(10_000, 3)).toBe(3_333);
    expect(perTravellerMinor(10_001, 2)).toBe(5_001);
  });

  it("treats a confirmed check inside its window as live, and an expired one as expired", () => {
    expect(liveStatus(PKG_1, NOW).state).toBe("live");
    const expired = { ...PKG_1, verification: { ...PKG_1.verification, validUntil: "2026-10-27T00:00:00.000Z" } };
    expect(liveStatus(expired, NOW).state).toBe("expired");
  });

  it("treats a package without a completed check as indicative, never live", () => {
    expect(liveStatus(PKG_2, NOW).state).toBe("indicative");
    const unverifiedButDated = makePackage("pkg_9", 9, { selections: [selectionOf("stop_1", KANDY_OFFER)], sellingPriceMinor: 1, budgetDifferenceMinor: 0, score: 1, verified: false, validUntil: LIVE_VALID_UNTIL });
    expect(liveStatus(unverifiedButDated, NOW).state).toBe("indicative");
  });

  it("requires a live check before quoting only when an external rate is involved", () => {
    expect(needsLiveCheck(PKG_1, NOW)).toBe(false);
    expect(needsLiveCheck(PKG_2, NOW)).toBe(true);
    const liveExternal = { ...PKG_2, verification: { ...PKG_2.verification, allVerified: true, validUntil: LIVE_VALID_UNTIL, checkedAt: "2026-10-28T09:00:00.000Z" } };
    expect(needsLiveCheck(liveExternal, NOW)).toBe(false);
  });

  it("counts confirmed rate checks, including those confirmed at a new price", () => {
    expect(checkCounts(PKG_1)).toEqual({ confirmed: 2, total: 2 });
    const mixed = { ...PKG_1, verification: { ...PKG_1.verification, checks: [{ status: "confirmed" }, { status: "price_changed" }, { status: "unavailable" }] } };
    expect(checkCounts(mixed)).toEqual({ confirmed: 2, total: 3 });
  });

  it("reports the budget position, and gives no meter when the currency differs or no budget is set", () => {
    const trip = makeShowcaseSnapshot().trip;
    expect(budgetPosition(PKG_1, trip)).toEqual({ difference: 14_000, meterFraction: 0.72 });
    // 52,000 against 50,000 is over budget, so the meter is clamped to full.
    expect(budgetPosition(PKG_2, trip).meterFraction).toBe(1);
    expect(budgetPosition(PKG_1, { ...trip, budgetAmountMinor: null })).toEqual({ difference: 14_000, meterFraction: null });
    expect(budgetPosition({ ...PKG_1, package: { ...PKG_1.package, currency: "EUR" } }, trip).meterFraction).toBeNull();
  });

  it("finds the lowest priced package and sorts a copy without changing the order it was given", () => {
    const packages = [PKG_2, PKG_1];
    expect(lowestPricedId(packages)).toBe("pkg_1-id");
    expect(sortPackages(packages, "price").map((pkg) => pkg.ref)).toEqual(["pkg_1", "pkg_2"]);
    expect(sortPackages(packages, "score").map((pkg) => pkg.ref)).toEqual(["pkg_2", "pkg_1"]);
    expect(sortPackages(packages, "recommended").map((pkg) => pkg.ref)).toEqual(["pkg_2", "pkg_1"]);
    expect(packages.map((pkg) => pkg.ref)).toEqual(["pkg_2", "pkg_1"]);
  });
});
