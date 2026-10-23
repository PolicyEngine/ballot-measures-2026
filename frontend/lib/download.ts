/**
 * Build and save CSV downloads of one measure's results, from the same
 * parsed files the tabs read.
 */

import type { CsvRow } from './parseCSV';

/** Quote a CSV field when it holds a comma, quote, or newline. */
export function csvField(value: string | number | undefined | null): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows as CSV text with the given columns, header first. */
export function rowsToCsv(rows: CsvRow[], columns: string[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(','));
  return `${lines.join('\n')}\n`;
}

/** One measure's rows from a results file, keeping the file's columns. */
export function measureCsv(rows: CsvRow[] | null | undefined, slug: string): string | null {
  if (!rows) return null;
  const selected = rows.filter((r) => String(r.measure ?? '').trim() === slug);
  if (selected.length === 0) return null;
  return rowsToCsv(selected, Object.keys(selected[0]));
}

/** Save text as a file in the browser. */
export function saveText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
