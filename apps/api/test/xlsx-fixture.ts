import { strToU8, zipSync } from "fflate";

/** Builds a minimal but structurally real .xlsx package (shared strings, styles, a date column). */
export function buildXlsx(rows: (string | number | { date: number } | null)[][]): Uint8Array {
  const shared: string[] = [];
  const sst = (s: string) => {
    let i = shared.indexOf(s);
    if (i < 0) (shared.push(s), (i = shared.length - 1));
    return i;
  };
  const col = (i: number) => String.fromCharCode(65 + i);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sheetRows = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      if (v === null) return "";
      const ref = `${col(ci)}${ri + 1}`;
      if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
      if (typeof v === "object") return `<c r="${ref}" s="1"><v>${v.date}</v></c>`;
      return `<c r="${ref}" t="s"><v>${sst(v)}</v></c>`;
    });
    return `<row r="${ri + 1}">${cells.join("")}</row>`;
  });
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rates" sheetId="1" r:id="rId7"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/data.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0"?><styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\-mm\-dd"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>`),
    "xl/worksheets/data.xml": strToU8(`<?xml version="1.0"?><worksheet><sheetData>${sheetRows.join("")}</sheetData></worksheet>`),
  };
  files["xl/sharedStrings.xml"] = strToU8(`<?xml version="1.0"?><sst>${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
