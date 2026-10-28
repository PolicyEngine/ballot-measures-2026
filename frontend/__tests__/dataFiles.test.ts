import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCsvOrNull, fetchJsonOrNull, parseResultsCsv } from '../lib/dataFiles';
import { dataUrl } from '../lib/config';
import { mockDataFiles } from './testUtils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseResultsCsv', () => {
  it('requires the measure column', () => {
    expect(parseResultsCsv('measure,year,metric,value\nnd-measure-2,2028,households,1\n')).toHaveLength(1);
    // The old single-measure format has no measure column.
    expect(parseResultsCsv('year,metric,value\n2027,households,1\n')).toBeNull();
  });

  it('rejects empty files and HTML error pages', () => {
    expect(parseResultsCsv('')).toBeNull();
    expect(parseResultsCsv('<!DOCTYPE html><html><body>Not found</body></html>')).toBeNull();
  });

  it('accepts a quoted header', () => {
    expect(parseResultsCsv('"measure","year"\nwa-i-645,2028\n')).toEqual([{ measure: 'wa-i-645', year: 2028 }]);
  });
});

describe('fetchCsvOrNull', () => {
  it('fetches from the data directory under the base path', async () => {
    const fetchMock = mockDataFiles({ 'metrics.csv': 'measure,year,metric,value\nx,2028,households,5\n' });
    const rows = await fetchCsvOrNull('metrics.csv');
    expect(fetchMock).toHaveBeenCalledWith(dataUrl('metrics.csv'));
    expect(dataUrl('metrics.csv')).toBe('/us/ballot-measures-2026/data/metrics.csv');
    expect(rows).toEqual([{ measure: 'x', year: 2028, metric: 'households', value: 5 }]);
  });

  it('returns null for a missing file', async () => {
    mockDataFiles({});
    expect(await fetchCsvOrNull('metrics.csv')).toBeNull();
  });

  it('throws when fetch itself fails, so the query can retry and offer Retry', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await expect(fetchCsvOrNull('metrics.csv')).rejects.toThrow('offline');
  });

  it('throws on a server error, but not on a missing file', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') } as Response),
    ) as unknown as typeof fetch;
    await expect(fetchCsvOrNull('metrics.csv')).rejects.toThrow("Couldn't load metrics.csv (HTTP 503)");
    await expect(fetchJsonOrNull('manifest.json')).rejects.toThrow("Couldn't load manifest.json (HTTP 503)");
    mockDataFiles({});
    await expect(fetchCsvOrNull('metrics.csv')).resolves.toBeNull();
  });

  it('returns null for a file without the measure column', async () => {
    mockDataFiles({ 'metrics.csv': 'year,metric,value\n2027,households,5\n' });
    expect(await fetchCsvOrNull('metrics.csv')).toBeNull();
  });
});

describe('fetchJsonOrNull', () => {
  it('parses JSON and returns null for missing or invalid files', async () => {
    mockDataFiles({ 'manifest.json': { pin: 'p' }, 'bad.json': 'not json' });
    expect(await fetchJsonOrNull('manifest.json')).toEqual({ pin: 'p' });
    expect(await fetchJsonOrNull('missing.json')).toBeNull();
    await expect(fetchJsonOrNull('bad.json')).resolves.toBeNull();
  });
});
