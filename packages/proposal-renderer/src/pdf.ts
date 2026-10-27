/// <reference path="./fontkit.d.ts" />
import * as fontkit from "fontkit";
import { PDFDocument, PDFHexString, StandardFonts, beginText, endText, popGraphicsState, pushGraphicsState, rgb, setFillingColor, setFontAndSize, setTextMatrix, showText, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney } from "@tripweave/shared";
import type { ClientQuoteView } from "./client-view";

/** Standard PDF fonts only cover WinAnsi; map common punctuation and replace anything else. */
const WIN_ANSI_MAP: Record<string, string> = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "•": "-", " ": " ", "→": "->" };
export function winAnsiSafe(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFC")) {
    const c = WIN_ANSI_MAP[ch] ?? ch;
    const code = c.codePointAt(0) ?? 63;
    out += (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || c === "€" ? c : code === 10 ? "\n" : "?";
  }
  return out;
}

function hexToRgb(hex: string | undefined, fallback: [number, number, number]) {
  const m = hex && /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** A text style (weight) the layout code draws and measures with, independent of how it is embedded. */
interface Face {
  clean(s: string): string;
  width(s: string, size: number): number;
  draw(page: PDFPage, s: string, o: { x: number; y: number; size: number; color: Color }): void;
}

/** Standard Helvetica: WinAnsi only, anything else becomes "?". Used for pure-Latin quotations. */
function standardFace(font: PDFFont): Face {
  return {
    clean: winAnsiSafe,
    width: (s, size) => font.widthOfTextAtSize(winAnsiSafe(s), size),
    draw: (page, s, o) => void page.drawText(winAnsiSafe(s), { ...o, font }),
  };
}

const isSinhala = (cp: number) => cp >= 0x0d80 && cp <= 0x0dff;
const isTamil = (cp: number) => cp >= 0x0b80 && cp <= 0x0bff;

/** True when the text cannot be rendered with the standard WinAnsi fonts. */
export function needsUnicodeFonts(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0xff && !WIN_ANSI_MAP[ch] && ch !== "€") return true;
  }
  return false;
}

interface ShapedGlyph { id: number; isMark?: boolean }
interface FontkitFont { unitsPerEm: number; layout(text: string): { glyphs: ShapedGlyph[]; positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[] } }
/** The parts of pdf-lib's subsetting embedder we need to emit glyph ids ourselves (pdf-lib is pinned; see package.json). */
interface SubsetEmbedder { font: FontkitFont; subset: { includeGlyph(g: ShapedGlyph): number }; glyphs: ShapedGlyph[]; glyphIdMap: Map<number, number> }
const embedderOf = (font: PDFFont) => (font as unknown as { embedder: SubsetEmbedder }).embedder;

/** Shapes text with the font's own GSUB/GPOS tables (conjuncts, mark attachment, kerning). */
function shape(font: PDFFont, text: string) {
  const emb = embedderOf(font);
  const run = emb.font.layout(text);
  // A mark that GPOS attached to its base (non-zero offset) must not also advance the pen; spacing vowel
  // signs (no offset) keep their width.
  const positions = run.positions.map((pos, i) => (run.glyphs[i]!.isMark && pos.xOffset !== 0 ? { ...pos, xAdvance: 0 } : pos));
  return { emb, glyphs: run.glyphs, positions, unit: 1 / emb.font.unitsPerEm };
}

/**
 * pdf-lib places custom-font glyphs by their plain advance widths and ignores GPOS offsets, which leaves
 * Sinhala vowel signs and other combining marks detached from their consonants. So each glyph is
 * positioned explicitly from the shaped layout instead of via page.drawText.
 */
function drawShaped(page: PDFPage, font: PDFFont, text: string, o: { x: number; y: number; size: number; color: Color }): number {
  const { emb, glyphs, positions, unit } = shape(font, text);
  const key = page.node.newFontDictionary(font.name, font.ref);
  const ops = [pushGraphicsState(), beginText(), setFillingColor(o.color), setFontAndSize(key, o.size)];
  let pen = 0;
  glyphs.forEach((glyph, i) => {
    const pos = positions[i]!;
    const subsetId = emb.subset.includeGlyph(glyph);
    emb.glyphs[subsetId - 1] = glyph;
    emb.glyphIdMap.set(glyph.id, subsetId);
    ops.push(setTextMatrix(1, 0, 0, 1, o.x + (pen + pos.xOffset) * unit * o.size, o.y + pos.yOffset * unit * o.size), showText(PDFHexString.of(subsetId.toString(16).padStart(4, "0"))));
    pen += pos.xAdvance;
  });
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
  return pen * unit * o.size;
}

const shapedWidth = (font: PDFFont, text: string, size: number) => {
  const { positions, unit } = shape(font, text);
  return positions.reduce((w, pos) => w + pos.xAdvance, 0) * unit * size;
};

/**
 * Chooses a font per character from an ordered list (the first covers Latin/Greek/Cyrillic). A run
 * stays in its current font while that font has the next glyph, so spaces, digits and punctuation do
 * not split Sinhala/Tamil words. Characters no font covers are drawn as "?".
 */
function unicodeFace(fonts: PDFFont[]): Face {
  const sets = fonts.map((f) => new Set(f.getCharacterSet()));
  const clean = (s: string) => s.normalize("NFC").replace(/\r/g, "").replace(/[\u00a0\u2007\u202f]/g, " ");
  const runs = (s: string): { font: PDFFont; text: string }[] => {
    const out: { font: PDFFont; text: string }[] = [];
    let cur = -1;
    for (const rawCh of clean(s)) {
      let ch = rawCh;
      let cp = ch.codePointAt(0)!;
      let idx = cur >= 0 && sets[cur]!.has(cp) ? cur : sets.findIndex((set) => set.has(cp));
      if (idx < 0) {
        ch = "?";
        cp = 63;
        idx = cur >= 0 && sets[cur]!.has(cp) ? cur : 0;
      }
      if (idx !== cur) {
        out.push({ font: fonts[idx]!, text: "" });
        cur = idx;
      }
      out[out.length - 1]!.text += ch;
    }
    return out;
  };
  return {
    clean,
    width: (s, size) => runs(s).reduce((w, r) => w + shapedWidth(r.font, r.text, size), 0),
    draw: (page, s, o) => {
      let x = o.x;
      for (const r of runs(s)) x += drawShaped(page, r.font, r.text, { ...o, x });
    },
  };
}

interface SubsetLike { encode(): Uint8Array; encodeStream?: () => unknown }
interface FontLike { createSubset(): SubsetLike }

/**
 * pdf-lib subsets fonts through fontkit 1.x's streaming `subset.encodeStream()`; fontkit 2.x (needed for
 * correct Sinhala shaping) only has `subset.encode()`. This adapter replays the bytes as a stream.
 */
const pdfLibFontkit = {
  create(data: Uint8Array | ArrayBuffer): unknown {
    const font = fontkit.create(data) as FontLike;
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => {
      const subset = createSubset();
      subset.encodeStream = () => {
        const handlers: Record<string, (arg?: unknown) => void> = {};
        const stream = { on: (event: string, cb: (arg?: unknown) => void) => ((handlers[event] = cb), stream) };
        queueMicrotask(() => {
          try {
            handlers.data?.(subset.encode());
            handlers.end?.();
          } catch (e) {
            handlers.error?.(e);
          }
        });
        return stream;
      };
      return subset;
    };
    return font;
  },
};

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function embedUnicodeFaces(doc: PDFDocument, allText: string): Promise<{ regular: Face; bold: Face }> {
  doc.registerFontkit(pdfLibFontkit as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);
  const [regularB64, boldB64] = await Promise.all([import("./fonts/noto-sans-regular"), import("./fonts/noto-sans-bold")]);
  const latinRegular = await doc.embedFont(b64ToBytes(regularB64.default), { subset: true });
  const latinBold = await doc.embedFont(b64ToBytes(boldB64.default), { subset: true });
  const extras: PDFFont[] = [];
  const cps = [...allText].map((c) => c.codePointAt(0)!);
  // Sinhala and Tamil ship in a regular weight only; bold text uses it too rather than a synthetic bold.
  if (cps.some(isSinhala)) extras.push(await doc.embedFont(b64ToBytes((await import("./fonts/noto-sans-sinhala-regular")).default), { subset: true }));
  if (cps.some(isTamil)) extras.push(await doc.embedFont(b64ToBytes((await import("./fonts/noto-sans-tamil-regular")).default), { subset: true }));
  return { regular: unicodeFace([latinRegular, ...extras]), bold: unicodeFace([latinBold, ...extras]) };
}

function wrap(text: string, face: Face, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of face.clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (face.width(test, size) <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderProposalPdf(view: ClientQuoteView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Quotation ${view.quoteNumber}`);
  doc.setAuthor(view.organization.name);
  doc.setCreator("TripWeave");
  const allText = JSON.stringify(view);
  const { regular, bold } = needsUnicodeFonts(allText)
    ? await embedUnicodeFaces(doc, allText)
    : { regular: standardFace(await doc.embedFont(StandardFonts.Helvetica)), bold: standardFace(await doc.embedFont(StandardFonts.HelveticaBold)) };
  const primary = hexToRgb(view.organization.branding.primaryColor, [0.07, 0.25, 0.2]);
  const accent = hexToRgb(view.organization.branding.accentColor, [0.72, 0.58, 0.25]);
  const ink = rgb(0.13, 0.13, 0.13);
  const muted = rgb(0.4, 0.4, 0.4);

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (needed: number) => {
    if (y - needed < M + 24) newPage();
  };
  const text = (s: string, x: number, size = 10, face = regular, color = ink) => face.draw(page, s, { x, y, size, color });
  const para = (s: string, size = 10, font = regular, color = ink, indent = 0) => {
    for (const l of wrap(s, font, size, W - 2 * M - indent)) {
      ensure(size + 4);
      text(l, M + indent, size, font, color);
      y -= size + 4;
    }
  };
  const heading = (s: string) => {
    ensure(40);
    y -= 10;
    text(s.toUpperCase(), M, 9, bold, accent);
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: accent });
    y -= 14;
  };
  const money = (n: number) => formatMoney(n, view.currency);
  const rightText = (s: string, xRight: number, size = 10, face = regular) => {
    face.draw(page, s, { x: xRight - face.width(s, size), y, size, color: ink });
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: primary });
  bold.draw(page, view.organization.name, { x: M, y: H - 46, size: 20, color: rgb(1, 1, 1) });
  regular.draw(page, "TRAVEL QUOTATION", { x: M, y: H - 66, size: 9, color: rgb(0.9, 0.85, 0.7) });
  const ref = `${view.quoteNumber}  v${view.version}`;
  bold.draw(page, ref, { x: W - M - bold.width(ref, 11), y: H - 46, size: 11, color: rgb(1, 1, 1) });
  y = H - 92 - 28;

  text(view.trip.title, M, 16, bold, primary);
  y -= 22;
  const meta: string[] = [];
  if (view.customerName) meta.push(`Prepared for ${view.customerName}`);
  if (view.trip.arrivalDate && view.trip.departureDate) meta.push(`${view.trip.arrivalDate} to ${view.trip.departureDate}`);
  meta.push(`${view.trip.adults} adult${view.trip.adults === 1 ? "" : "s"}${view.trip.children ? `, ${view.trip.children} child${view.trip.children === 1 ? "" : "ren"}` : ""}, ${view.trip.rooms} room${view.trip.rooms === 1 ? "" : "s"}`);
  para(meta.join("  |  "), 10, regular, muted);
  para(`Issued ${view.issuedAt.slice(0, 10)}${view.validUntil ? `  |  Valid until ${view.validUntil}` : ""}`, 9, regular, muted);

  if (view.itinerary.length) {
    heading("Itinerary");
    for (const s of view.itinerary) {
      ensure(30);
      text(`${s.arrivalDate} - ${s.departureDate}`, M, 9, regular, muted);
      text(`${s.destination} (${s.nights} night${s.nights === 1 ? "" : "s"})`, M + 120, 10, bold);
      y -= 14;
      if (s.activities.length) para(s.activities.join(", "), 9, regular, muted, 120);
    }
  }

  if (view.stays.length) {
    heading("Accommodation");
    for (const s of view.stays) {
      ensure(54);
      text(`${s.destination}: ${s.propertyName}`, M, 11, bold);
      y -= 14;
      para(`${s.roomType} | ${s.mealPlan} | ${s.checkIn} to ${s.checkOut} (${s.nights} night${s.nights === 1 ? "" : "s"})${s.propertyCategory ? ` | ${s.propertyCategory}` : ""}`, 9, regular, muted);
      para(s.cancellation, 9, regular, muted);
      y -= 4;
    }
  }

  heading("Pricing");
  const right = W - M;
  const priced = view.lineItems;
  for (const l of priced) {
    ensure(18);
    const label = `${l.description}${l.quantity > 1 ? `  x${l.quantity}` : ""}${l.optional ? "  (optional, not included in total)" : ""}`;
    for (const [i, line] of wrap(label, regular, 10, right - M - 110).entries()) {
      if (i > 0) ensure(14);
      text(line, M, 10, regular, l.optional ? muted : ink);
      if (i === 0) rightText(money(l.totalMinor), right, 10, regular);
      y -= 14;
    }
  }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.5, color: muted });
  y -= 14;
  if (view.totals.discountMinor > 0) {
    text("Discount", M, 10, regular);
    rightText(`-${money(view.totals.discountMinor)}`, right);
    y -= 14;
  }
  if (view.totals.taxMinor > 0) {
    text("Taxes", M, 10, regular);
    rightText(money(view.totals.taxMinor), right);
    y -= 14;
  }
  ensure(30);
  text("Total", M, 13, bold, primary);
  rightText(money(view.totals.totalPayableMinor), right, 13, bold);
  y -= 22;

  if (view.inclusions.length) {
    heading("Included");
    for (const i of view.inclusions) para(`- ${i}`, 10);
  }
  if (view.exclusions.length) {
    heading("Not included");
    for (const i of view.exclusions) para(`- ${i}`, 10);
  }
  if (view.clientNotes) {
    heading("Notes");
    para(view.clientNotes, 10);
  }
  if (view.terms) {
    heading("Terms and conditions");
    para(view.terms, 8.5, regular, muted);
  }
  const b = view.organization.branding;
  const contact = [b.contactEmail, b.contactPhone, b.website, b.address].filter(Boolean).join("  |  ");
  if (contact || b.quoteFooter) {
    heading("Contact");
    if (contact) para(contact, 10);
    if (b.quoteFooter) para(b.quoteFooter, 9, regular, muted);
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    regular.draw(p, `${view.organization.name}  |  ${view.quoteNumber}  |  Page ${i + 1} of ${pages.length}`, { x: M, y: 24, size: 8, color: muted });
  });
  return doc.save();
}
