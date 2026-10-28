/**
 * Fetch helpers for the precomputed results in frontend/public/<DATA_DIR>/.
 * Only a missing file (HTTP 404, an empty body, or a body in the wrong
 * format) resolves to null, so a view can say results are not yet
 * available. Network failures and other HTTP errors throw, so React Query
 * retries them and the view can offer Retry.
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
  const res = await fetchDataFile(filename);
  if (res === null) return null;
  return parseResultsCsv(await res.text(), requiredColumn);
}

/** The data file's response; null for a 404; throws on network and other HTTP errors. */
async function fetchDataFile(filename: string): Promise<Response | null> {
  const res = await fetch(dataUrl(filename));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load ${filename} (HTTP ${res.status})`);
  return res;
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
  const res = await fetchDataFile(filename);
  if (res === null) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
