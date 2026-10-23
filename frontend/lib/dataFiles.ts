/**
 * Fetch helpers for the precomputed results in frontend/public/<DATA_DIR>/.
 * A missing file (HTTP error, network failure, empty body, or a body in the
 * wrong format) resolves to null, so each view can show "Results not yet
 * available" instead of crashing.
 */

import parseCSV, { csvHeader, type CsvRow } from './parseCSV';
import { dataUrl } from './config';

/** Column every results CSV starts with (scripts/DATA_SCHEMA.md). */
export const MEASURE_COLUMN = 'measure';

/**
 * Parsed CSV rows, or null when the file is missing or lacks the required
 * column. Requiring `measure` also rejects files in an older single-measure
 * format and hosts that answer missing files with an HTML page.
 */
export async function fetchCsvOrNull(
  filename: string,
  requiredColumn: string = MEASURE_COLUMN,
): Promise<CsvRow[] | null> {
  let res: Response;
  try {
    res = await fetch(dataUrl(filename));
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }
  return parseResultsCsv(text, requiredColumn);
}

/** Parse a results CSV, or null when it is empty or lacks `requiredColumn`. */
export function parseResultsCsv(
  text: string,
  requiredColumn: string = MEASURE_COLUMN,
): CsvRow[] | null {
  if (!text.trim()) return null;
  const header = csvHeader(text).map((h) => h.replace(/"/g, ''));
  if (!header.includes(requiredColumn)) return null;
  return parseCSV(text);
}

/** Parsed JSON, or null when the file is missing or not valid JSON. */
export async function fetchJsonOrNull<T>(filename: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(dataUrl(filename));
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
