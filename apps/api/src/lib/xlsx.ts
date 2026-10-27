import { unzipSync, strFromU8 } from "fflate";
import { AppError } from "@tripweave/shared";

/**
 * Minimal, dependency-light .xlsx reader for the rate import: returns the first worksheet as rows of
 * strings (same shape as parseCsv). It reads values only: formulas use their cached result, and
 * macros, external links and everything else in the package are never opened.
 */

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_CELLS = 200_000;
const NEEDED = new Set(["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml", "xl/styles.xml"]);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? m;
  });
}

/** Concatenates every <t> run inside a fragment (handles rich-text shared strings). */
function textOf(fragment: string): string {
  let out = "";
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1] ?? "");
  return out;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : undefined;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Which cell style indexes display a date, from styles.xml (custom formats are matched by their tokens). */
function dateStyles(styles: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!styles) return out;
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (Number.isFinite(id) && code) custom.set(id, code);
  }
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  let i = 0;
  for (const m of xfs.matchAll(/<xf\s[^>]*?(?:\/>|>)/g)) {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    const code = custom.get(id);
    // Strip quoted literals and [colour]/[locale] sections before looking for date tokens.
    const tokens = code?.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "") ?? "";
    if (BUILTIN_DATE_FORMATS.has(id) || (code && /[ymdhs]/i.test(tokens) && !/[0#?]/.test(tokens))) out.add(i);
    i++;
  }
  return out;
}

/** Excel serial date (1900 system) → YYYY-MM-DD. Serial 60 is Excel's fictitious 29 Feb 1900. */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const whole = Math.floor(serial);
  const adjusted = whole > 60 ? whole - 1 : whole; // skip the non-existent leap day
  const d = new Date(Date.UTC(1899, 11, 31 + adjusted));
  return d.toISOString().slice(0, 10);
}

function numberToString(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Number(n.toPrecision(15)));
}

export function parseXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  let sheetPath: string | null = null;
  try {
    // First pass reads the workbook parts; the sheet itself is selected once we know its path.
    files = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_FILE_BYTES && (NEEDED.has(f.name) || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)) });
  } catch {
    throw new AppError("validation_failed", "The file is not a valid .xlsx workbook");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]!) : undefined);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new AppError("validation_failed", "The file is not a valid .xlsx workbook");
  const firstSheet = /<sheet\s[^>]*>/.exec(workbook)?.[0];
  const relId = firstSheet ? attr(firstSheet, "r:id") : undefined;
  if (relId) {
    for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\s[^>]*>/g)) {
      if (attr(m[0], "Id") === relId) {
        const target = attr(m[0], "Target");
        if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      }
    }
  }
  const sheet = text(sheetPath ?? "xl/worksheets/sheet1.xml") ?? text("xl/worksheets/sheet1.xml");
  if (!sheet) throw new AppError("validation_failed", "The workbook has no readable worksheet");

  const shared: string[] = [];
  for (const m of (text("xl/sharedStrings.xml") ?? "").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1] ?? ""));
  const dates = dateStyles(text("xl/styles.xml"));

  const rows: string[][] = [];
  let cells = 0;
  for (const rowMatch of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of (rowMatch[1] ?? "").matchAll(/<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (++cells > MAX_CELLS) throw new AppError("validation_failed", "The worksheet is too large to import");
      const open = c[1] ?? "";
      const inner = c[2] ?? "";
      const ref = attr(open, "r");
      const type = attr(open, "t");
      const style = Number(attr(open, "s") ?? 0);
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "inlineStr") value = textOf(inner);
      else if (v !== undefined) {
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "str") value = decodeXml(v);
        else if (type === "b") value = v === "1" ? "true" : "false";
        else if (type === "e") value = "";
        else value = dates.has(style) ? (excelSerialToIsoDate(Number(v)) ?? numberToString(v)) : numberToString(v);
      }
      const col = ref ? columnIndex(ref) : row.length;
      while (row.length < col) row.push("");
      row[col] = value;
    }
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}
