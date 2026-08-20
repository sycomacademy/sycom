import { describe, expect, test } from "bun:test";

import { buildExportFilename, toCsv, type CsvColumn } from "./csv";

const BOM = "﻿";

type Row = { a: unknown; b?: unknown };

const cols = (...headers: string[]): CsvColumn<Row>[] =>
  headers.map((header, index) => ({
    header,
    value: (row) => (index === 0 ? row.a : row.b) as never,
  }));

/** Strip the BOM and trailing newline so assertions read as plain lines. */
function lines(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv.slice(BOM.length).replace(/\r\n$/, "").split("\r\n");
}

describe("toCsv", () => {
  test("writes a header row and one row per record", () => {
    const csv = toCsv(cols("A", "B"), [
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);

    expect(lines(csv)).toEqual(["A,B", "1,2", "3,4"]);
  });

  test("quotes cells containing a comma, quote, or newline", () => {
    const csv = toCsv(cols("A", "B"), [
      { a: "Smith, Jane", b: 'He said "hi"' },
      { a: "line one\nline two", b: "plain" },
    ]);

    expect(lines(csv)[1]).toBe('"Smith, Jane","He said ""hi"""');
    expect(csv).toContain('"line one\nline two"');
  });

  test("renders empty, null and undefined as blank cells", () => {
    const csv = toCsv(cols("A", "B"), [{ a: null, b: undefined }, { a: "" }]);

    expect(lines(csv).slice(1)).toEqual([",", ","]);
  });

  test("formats dates as ISO and booleans as Yes/No", () => {
    const csv = toCsv(cols("A", "B"), [{ a: new Date("2026-08-20T10:30:00.000Z"), b: true }]);

    expect(lines(csv)[1]).toBe("2026-08-20T10:30:00.000Z,Yes");
  });

  test("neutralises values Excel would treat as a formula", () => {
    // Without this a cell like `=1+1` executes on open, and `@`/`+`/`-` are the
    // other leading characters Excel reads as a formula.
    const csv = toCsv(cols("A", "B"), [
      { a: "=1+1", b: "@SUM(A1)" },
      { a: "+1 555 0100", b: "-5" },
    ]);

    const body = lines(csv).slice(1);
    // The guarded value now contains a tab, so it is also quoted.
    expect(body[0]).toBe('"\t=1+1","\t@SUM(A1)"');
    expect(body[1]).toBe('"\t+1 555 0100","\t-5"');
  });

  test("leaves an ordinary negative number readable", () => {
    const csv = toCsv(cols("A"), [{ a: -5 }]);
    expect(lines(csv)[1]).toBe('"\t-5"');
  });

  test("emits only a header when there are no rows", () => {
    expect(lines(toCsv(cols("A", "B"), []))).toEqual(["A,B"]);
  });
});

describe("buildExportFilename", () => {
  test("slugifies the name and stamps the date", () => {
    expect(buildExportFilename("Acme Corp — Members", "csv")).toMatch(
      /^acme-corp-members-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });

  test("falls back when the name has nothing usable", () => {
    expect(buildExportFilename("!!!", "csv")).toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
