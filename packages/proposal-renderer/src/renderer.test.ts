import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

/** Names of every font object in a PDF (parses compressed object streams, unlike a byte search). */
async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("Font")) names.push(String(obj.get(PDFName.of("BaseFont")) ?? ""));
  }
  return names;
}
import { needsUnicodeFonts, renderProposalHtml, renderProposalPdf, toClientView, winAnsiSafe, type QuoteViewSource } from "./index";

/** Source deliberately polluted with every kind of internal field that must never reach a client. */
const source = {
  quote: { quoteNumber: "Q-2026-0001", status: "sent", currency: "USD", validUntil: "2026-12-31", internalStatusNote: "SECRET-NOTE" },
  version: {
    versionNumber: 2,
    createdAt: "2026-10-27T10:00:00Z",
    itinerary: { stops: [{ destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11", nights: 1, activities: ["Temple visit"], notes: "INTERNAL-STOP-NOTE" }] },
    package: { selections: [{ destination: "Kandy", costMinor: 111_111, offer: { property: { name: "Lakeside Heritage", category: "boutique" }, roomType: { name: "Deluxe" }, mealPlan: "BB", stayStart: "2026-12-10", stayEnd: "2026-12-11", nights: 1, cancellation: { refundable: true, freeCancellationUntil: "2026-12-03" }, supplierName: "SECRET-SUPPLIER", rateSource: { contractReference: "SECRET-CONTRACT-77" }, externalOfferReference: "SECRET-RATEKEY" } }] },
    pricing: { sellingPriceBeforeDiscountMinor: 100_000, discountMinor: 5_000, sellingPriceMinor: 95_000, sellingTaxMinor: 9_500, totalPayableMinor: 104_500, totalCostMinor: 777_777, grossProfitMinor: 888_888, grossMarginBp: 999 },
    terms: { terms: "Payment due 30 days before arrival.", inclusions: ["Breakfast daily"], exclusions: ["Flights"], clientNotes: "Looking forward!", internalNotes: "SECRET-INTERNAL" },
    items: [{ category: "accommodation", description: "Lakeside Heritage – 1 night", quantity: 1, totalSellingMinor: 100_000, optional: false, unitCostMinor: 424_242, totalCostMinor: 424_242 }],
  },
  organization: { name: "Island Tours", branding: { primaryColor: "#12403a", contactEmail: "hello@island.example" } },
  customerName: "Jane Doe",
  trip: { title: "Hill Country Escape", arrivalDate: "2026-12-10", departureDate: "2026-12-11", party: { adults: 2, children: 0, rooms: [{}] } },
} as unknown as QuoteViewSource;

describe("client view allow-list", () => {
  const view = toClientView(source);
  const json = JSON.stringify(view);

  it("exposes selling prices and itinerary", () => {
    expect(view.totals).toEqual({ subtotalMinor: 100_000, discountMinor: 5_000, taxMinor: 9_500, totalPayableMinor: 104_500 });
    expect(view.stays[0]).toMatchObject({ propertyName: "Lakeside Heritage", mealPlan: "Bed & breakfast", cancellation: "Free cancellation until 2026-12-03" });
    expect(view.lineItems[0]!.totalMinor).toBe(100_000);
  });

  it("never leaks internal costs, margins, suppliers, contracts or notes", () => {
    for (const secret of ["SECRET", "INTERNAL", "777777", "888888", "424242", "111111", "unitCost", "totalCost", "grossProfit", "margin", "supplier", "contract", "rateKey"]) {
      expect(json.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });
});

describe("renderers", () => {
  const view = toClientView(source);

  it("produces a valid multi-section PDF with only client-facing text", async () => {
    const bytes = await renderProposalPdf(view);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("Q-2026-0001");
  });

  it("paginates long content", async () => {
    const long = { ...view, terms: "Lorem ipsum dolor sit amet. ".repeat(600), inclusions: Array.from({ length: 80 }, (_, i) => `Item ${i}`) };
    const doc = await PDFDocument.load(await renderProposalPdf(long));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("handles non-WinAnsi characters without throwing", async () => {
    const odd = { ...view, trip: { ...view.trip, title: "Kandy – Ella ✨ 旅行" } };
    await expect(renderProposalPdf(odd)).resolves.toBeInstanceOf(Uint8Array);
    expect(winAnsiSafe("A–B ✨")).toBe("A-B ?");
  });

  it("embeds Unicode fonts only when the text needs them", async () => {
    expect(needsUnicodeFonts("Kandy – Ella “quoted” €5")).toBe(false);
    expect(needsUnicodeFonts("කන්ද")).toBe(true);
    const latin = await renderProposalPdf(view);
    expect((await fontNames(latin)).join(" ")).not.toContain("NotoSans");
    const multi = {
      ...view,
      trip: { ...view.trip, title: "මහනුවර සංචාරය – Kandy Escape" },
      clientNotes: "வணக்கம் வரவேற்கிறோம். Привет, Ελληνικά, Čeština.",
      stays: [{ ...view.stays[0]!, propertyName: "ලේක්සයිඩ් හෙරිටේජ්", destination: "මහනුවර" }],
    };
    const bytes = await renderProposalPdf(multi);
    const fonts = (await fontNames(bytes)).join(" ");
    expect(fonts).toContain("NotoSans-Regular");
    expect(fonts).toContain("NotoSans-Bold");
    expect(fonts).toContain("NotoSansSinhala-Regular");
    expect(fonts).toContain("NotoSansTamil-Regular");
    expect(bytes.length).toBeLessThan(400_000); // subset, not the full font files
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    if (process.env.PDF_SAMPLE_OUT) (await import("node:fs")).writeFileSync(process.env.PDF_SAMPLE_OUT, bytes);
  });

  it("still draws a placeholder for scripts no embedded font covers", async () => {
    const cjk = { ...view, trip: { ...view.trip, title: "旅行 – Ella ශ්‍රී" } };
    await expect(renderProposalPdf(cjk)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("escapes HTML and omits internal data", () => {
    const evil = { ...view, trip: { ...view.trip, title: '<script>alert("x")</script>' } };
    const html = renderProposalHtml(evil);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(renderProposalHtml(view).toLowerCase()).not.toContain("secret");
  });
});
