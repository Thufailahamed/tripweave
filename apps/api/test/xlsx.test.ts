import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { excelSerialToIsoDate, parseXlsx } from "../src/lib/xlsx";
import { buildXlsx } from "./xlsx-fixture";

describe("xlsx reader", () => {
  it("reads strings, numbers and date-formatted cells from the sheet named in the workbook relationships", () => {
    const rows = parseXlsx(buildXlsx([
      ["property", "amount", "startDate"],
      ["Tea & Co <Lodge>", 130.5, { date: 46_054 }], // 2026-02-01
      ["Heritage", 120.1, { date: 46_081 }],
    ]));
    expect(rows).toEqual([["property", "amount", "startDate"], ["Tea & Co <Lodge>", "130.5", "2026-02-01"], ["Heritage", "120.1", "2026-02-28"]]);
  });

  it("keeps column positions across empty cells and skips blank rows", () => {
    const rows = parseXlsx(buildXlsx([["a", null, "c"], [null, null, null], [null, "b2"]]));
    expect(rows).toEqual([["a", "", "c"], ["", "b2"]]);
  });

  it("converts Excel serial dates, including the fictitious 1900 leap day boundary", () => {
    expect(excelSerialToIsoDate(59)).toBe("1900-02-28");
    expect(excelSerialToIsoDate(61)).toBe("1900-03-01");
    expect(excelSerialToIsoDate(46_054)).toBe("2026-02-01");
    expect(excelSerialToIsoDate(0)).toBeNull();
  });

  it("reads inline strings and rich-text shared strings", () => {
    const files = {
      "xl/workbook.xml": strToU8(`<workbook xmlns:r="x"><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>`),
      "xl/sharedStrings.xml": strToU8(`<sst><si><r><t>Rich </t></r><r><t xml:space="preserve">Text &#x41;</t></r></si></sst>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>inline</t></is></c><c r="C1" t="b"><v>1</v></c></row></sheetData></worksheet>`),
    };
    expect(parseXlsx(zipSync(files))).toEqual([["Rich Text A", "inline", "true"]]);
  });

  it("rejects non-xlsx input and workbooks without a sheet", () => {
    expect(() => parseXlsx(strToU8("not a zip"))).toThrow(/not a valid/);
    expect(() => parseXlsx(zipSync({ "hello.txt": strToU8("hi") }))).toThrow(/not a valid/);
    expect(() => parseXlsx(zipSync({ "xl/workbook.xml": strToU8("<workbook/>") }))).toThrow(/no readable worksheet/);
  });
});
