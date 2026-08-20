export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<TRow> = {
  header: string;
  value: (row: TRow) => CsvValue;
};

/**
 * Excel decides a cell is a formula when it opens with one of these, which turns
 * a name like `=Smith` or `+1 555…` into executable content. Prefixing a tab keeps
 * the value readable while stripping that meaning.
 *
 * @see https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

function formatValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function escapeCell(value: CsvValue): string {
  const text = formatValue(value);
  if (text.length === 0) return "";

  const guarded = FORMULA_PREFIXES.has(text[0] ?? "") ? `\t${text}` : text;

  // Quote whenever the cell could otherwise break the row apart, doubling any
  // quotes of its own (RFC 4180).
  return /[",\r\n\t]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv<TRow>(
  columns: ReadonlyArray<CsvColumn<TRow>>,
  rows: readonly TRow[],
): string {
  const lines = [columns.map((column) => escapeCell(column.header)).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(","));
  }

  // CRLF per RFC 4180, and a BOM so Excel reads it as UTF-8 rather than the
  // local codepage — without it, accented names arrive mangled on Windows.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function toCsvBlob<TRow>(
  columns: ReadonlyArray<CsvColumn<TRow>>,
  rows: readonly TRow[],
): Blob {
  return new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
}

/** Slug + date, so repeat exports don't overwrite each other in the downloads folder. */
export function buildExportFilename(name: string, extension: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export";

  return `${slug}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
