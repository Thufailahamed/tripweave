import { describe, expect, it } from "vitest";
import { createParser } from "@openuidev/lang-core";
import { getPackageShowcaseJSONSchema } from "@tripweave/planning-contract";
import { buildGalleryProgram } from "./gallery";
import { hotelPhotosOf, sizedPhotoUrl } from "./photos";
import { KANDY_OFFER } from "./testing";
import { convertForDisplay } from "./currency";

function parse(program: string) {
  return createParser(getPackageShowcaseJSONSchema(), "PackageShowcase").parse(program);
}

describe("package gallery program", () => {
  it("draws one card per package, leading with the recommended one", () => {
    const program = buildGalleryProgram({ refs: ["pkg_2", "pkg_1"], leadRef: "pkg_1", view: "cards", title: "All packages", subtitle: "2 packages" });
    const result = parse(program);
    expect(result.meta.errors.filter((e) => e.severity !== "warning")).toEqual([]);
    expect(result.meta.unresolved).toEqual([]);
    expect(program).toContain('card1 = PackageCard("pkg_2", "standard")');
    expect(program).toContain('card2 = PackageCard("pkg_1", "lead")');
  });

  it("draws a single comparison for the compare view and escapes titles", () => {
    const program = buildGalleryProgram({ refs: ["pkg_1", "pkg_2"], leadRef: null, view: "compare", title: 'Say "hi"', subtitle: "x" });
    const result = parse(program);
    expect(result.meta.errors.filter((e) => e.severity !== "warning")).toEqual([]);
    expect(result.root?.typeName).toBe("PackageShowcase");
    expect(program).toContain('compare = PackageCompare(["pkg_1", "pkg_2"])');
  });
});

describe("hotel photos", () => {
  it("prefers photos stored on the offer, then uploads, then looked-up photos", () => {
    const withPhotos = { ...KANDY_OFFER, providerMetadata: { images: [{ thumbnail: "https://lh3.googleusercontent.com/a=s287", original: null }, { thumbnail: "javascript:x" }] } };
    expect(hotelPhotosOf(withPhotos, "img-1")).toEqual([{ thumbnail: "https://lh3.googleusercontent.com/a=s287", original: null }]);
    expect(hotelPhotosOf({ ...KANDY_OFFER, providerMetadata: {} }, "img-1")[0]?.thumbnail).toBe("/api/v1/media/img-1");
    const tokenOnly = { ...KANDY_OFFER, providerMetadata: { propertyToken: "tok" } };
    expect(hotelPhotosOf(tokenOnly, null, { tok: [{ thumbnail: "https://lh3.googleusercontent.com/b", original: null }] })).toHaveLength(1);
    expect(hotelPhotosOf(tokenOnly, null)).toEqual([]);
  });

  it("asks Google for the displayed size and leaves other hosts alone", () => {
    expect(sizedPhotoUrl("https://lh3.googleusercontent.com/grass-cs/abc=s287-w287-h192-n-k-no-v1", 720, 520)).toBe("https://lh3.googleusercontent.com/grass-cs/abc=w720-h520-k-no");
    expect(sizedPhotoUrl("https://lh3.googleusercontent.com/grass-cs/abc=s10000", 200, 200)).toBe("https://lh3.googleusercontent.com/grass-cs/abc=w200-h200-k-no");
    expect(sizedPhotoUrl("https://cf.bstatic.com/x.jpg", 200, 200)).toBe("https://cf.bstatic.com/x.jpg");
  });
});

describe("display currency", () => {
  const fx = { base: "USD" as const, rates: { USD: 1, EUR: 0.897453, LKR: 332.2, JPY: 157.89 }, asOf: "2026-10-28T00:00:00Z", source: "test", live: true };
  it("converts through USD and respects currencies without minor units", () => {
    expect(convertForDisplay(120_300, "USD", "EUR", fx)).toBe(107_964);
    expect(convertForDisplay(120_300, "USD", "JPY", fx)).toBe(189_942);
    expect(convertForDisplay(107_964, "EUR", "USD", fx)).toBe(120_300);
    expect(convertForDisplay(100, "USD", "GBP", fx)).toBeNull();
    expect(convertForDisplay(500, "USD", "USD", null)).toBe(500);
  });
});
