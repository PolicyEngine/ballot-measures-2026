import { describe, expect, it } from 'vitest';
import parseCSV, { csvHeader } from '../lib/parseCSV';

describe('parseCSV', () => {
  it('converts numeric cells and keeps text', () => {
    const rows = parseCSV('measure,year,metric,value\nwa-i-645,2028,households,3100000\n');
    expect(rows).toEqual([{ measure: 'wa-i-645', year: 2028, metric: 'households', value: 3100000 }]);
  });

  it('keeps commas and escaped quotes inside quoted fields', () => {
    const rows = parseCSV('bracket,households\n"$25,000 - $50,000",12\n"He said ""hi""",3\n');
    expect(rows[0].bracket).toBe('$25,000 - $50,000');
    expect(rows[0].households).toBe(12);
    expect(rows[1].bracket).toBe('He said "hi"');
  });

  it('handles CRLF line endings, a byte-order mark and blank lines', () => {
    const rows = parseCSV('﻿decile,value\r\nAll,1.5\r\n\r\n1,-2\r\n');
    expect(rows).toEqual([
      { decile: 'All', value: 1.5 },
      { decile: 1, value: -2 },
    ]);
  });

  it('reads scientific notation and negative numbers', () => {
    expect(parseCSV('v\n8.86e-10\n-3108000000\n').map((r) => r.v)).toEqual([8.86e-10, -3108000000]);
  });

  it('leaves blank cells as empty strings', () => {
    expect(parseCSV('a,b\n1,\n')).toEqual([{ a: 1, b: '' }]);
  });

  it('returns no rows for an empty file', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('reads the header row', () => {
    expect(csvHeader('measure,"year",value\n1,2,3')).toEqual(['measure', 'year', 'value']);
  });
});
