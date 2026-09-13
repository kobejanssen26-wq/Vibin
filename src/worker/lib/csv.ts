/** UTF-8 byte-order mark — without it, Excel guesses the system codepage and
 *  mangles Dutch/French accented characters (é, è, ë, ï, ç, ù, …). */
export const CSV_BOM = "﻿";

const FORMULA_PREFIX = /^[=+\-@]/;

/**
 * CSV-escape one cell: quote it if it contains a comma/quote/newline, and
 * neutralize spreadsheet formula injection by prefixing values that start
 * with = + - @ with a leading apostrophe (Excel/Sheets then treat them as
 * literal text instead of evaluating them as a formula).
 */
export function escapeCsvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/** Minimal RFC4180 parser: quoted fields, embedded commas/newlines, "" escapes. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyField = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawAnyField = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      sawAnyField = true;
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAnyField = false;
      continue;
    }
    field += ch;
    sawAnyField = true;
  }
  if (sawAnyField || field.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parses a CSV's header + rows into objects keyed by header name (trimmed,
 *  lowercased). Ragged rows are padded/truncated to the header length. */
export function parseCsvToRecords(text: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (r[i] ?? "").trim();
    });
    return rec;
  });
  return { headers, records };
}
