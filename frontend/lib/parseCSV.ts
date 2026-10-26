/**
 * Parse CSV text into an array of objects.
 *
 * - First row = headers
 * - Handles quoted fields (commas, escaped "" quotes) and CRLF line endings
 * - Numeric strings auto-converted to numbers
 * - Trims whitespace from headers and unquoted values
 */

export type CsvValue = string | number;
export type CsvRow = Record<string, CsvValue>;

function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
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
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Drop blank lines.
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export default function parseCSV(text: string): CsvRow[] {
  const records = splitRecords(text.replace(/^﻿/, ''));
  if (records.length === 0) return [];
  const headers = records[0].map((h) => h.trim());
  return records.slice(1).map((values) => {
    const obj: CsvRow = {};
    headers.forEach((h, i) => {
      const trimmed = (values[i] ?? '').trim();
      obj[h] = trimmed !== '' && !isNaN(Number(trimmed)) ? parseFloat(trimmed) : trimmed;
    });
    return obj;
  });
}

/** Header names of a CSV text (first record), unquoted and trimmed. */
export function csvHeader(text: string): string[] {
  const records = splitRecords(text.replace(/^﻿/, ''));
  return records.length ? records[0].map((h) => h.trim()) : [];
}
