import { describe, expect, it } from "vitest";
import { providerPhoto, stayImageUrl } from "../src/services/quote-images";

describe("quote stay images", () => {
  it("prefers a stored catalogue photograph", () => {
    expect(stayImageUrl("img_1", { images: [{ thumbnail: "https://example.com/a.jpg" }] })).toBe("/api/v1/media/img_1");
  });

  it("falls back to the first https provider photograph", () => {
    const metadata = { images: [{ thumbnail: "https://lh3.googleusercontent.com/one.jpg", original: "https://example.com/original.jpg" }] };
    expect(stayImageUrl(undefined, metadata)).toBe("https://lh3.googleusercontent.com/one.jpg");
    expect(providerPhoto({ images: [{ thumbnail: "http://unsafe.example/a.jpg", original: "https://example.com/b.jpg" }] })).toBe("https://example.com/b.jpg");
  });

  it("returns null when the provider snapshot has no usable photograph", () => {
    expect(providerPhoto(undefined)).toBeNull();
    expect(providerPhoto({})).toBeNull();
    expect(providerPhoto({ images: [{ thumbnail: "javascript:alert(1)" }] })).toBeNull();
    expect(stayImageUrl(undefined, undefined)).toBeNull();
  });
});
