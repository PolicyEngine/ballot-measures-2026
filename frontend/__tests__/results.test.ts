import { describe, expect, it } from 'vitest';
import parseCSV from '../lib/parseCSV';
import {
  buildDistricts,
  buildStatewide,
  districtNumber,
  metric,
  metricsFor,
  rowsFor,
  type StatewideFiles,
} from '../lib/results';
import { getMeasure } from '../lib/registry';
import { fixtureText } from './testUtils';

const files: StatewideFiles = {
  metrics: parseCSV(fixtureText('metrics.csv')),
  distributional: parseCSV(fixtureText('distributional_impact.csv')),
  winnersLosers: parseCSV(fixtureText('winners_losers.csv')),
  incomeBrackets: parseCSV(fixtureText('income_brackets.csv')),
};

describe('rowsFor and metricsFor', () => {
  it('filter on both measure and year', () => {
    const rows = rowsFor(files.metrics, 'wa-i-645', 2029);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.measure === 'wa-i-645' && r.year === 2029)).toBe(true);
    expect(rowsFor(files.metrics, 'wa-i-645', 2031)).toEqual([]);
    expect(rowsFor(null, 'wa-i-645', 2028)).toEqual([]);
  });

  it('builds a metric lookup and skips blank values', () => {
    const rows = parseCSV('measure,year,metric,value\nx,2028,a,1.5\nx,2028,b,\nx,2029,a,9\n');
    expect(metricsFor(rows, 'x', 2028)).toEqual({ a: 1.5 });
    expect(metricsFor(rows, 'x', 2030)).toBeNull();
    expect(metric({ a: 1 }, 'b')).toBeNull();
    expect(metric(null, 'a')).toBeNull();
  });
});

describe('buildStatewide', () => {
  it('assembles one measure-year from the four statewide files', () => {
    const co = getMeasure('co-amendment-87');
    const data = buildStatewide(files, co.slug, 2027, co.income_bands.map((b) => b.label))!;
    expect(data.metrics.state_budget_impact).toBeGreaterThan(0);
    expect(data.deciles?.map((d) => d.decile)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(data.winnersLosers?.deciles).toHaveLength(10);
    const all = data.winnersLosers!.all;
    expect(all.gain_more_5pct + all.gain_less_5pct + all.no_change + all.lose_less_5pct + all.lose_more_5pct).toBeCloseTo(1, 5);
    // Income bands follow the registry's order.
    expect(data.incomeBrackets?.map((b) => b.bracket)).toEqual(co.income_bands.map((b) => b.label));
  });

  it('returns null when metrics.csv has no rows for the measure-year', () => {
    expect(buildStatewide(files, 'co-amendment-87', 2031)).toBeNull();
    expect(buildStatewide({ ...files, metrics: null }, 'co-amendment-87', 2027)).toBeNull();
  });

  it('marks missing sections as null', () => {
    const data = buildStatewide({ ...files, distributional: null, incomeBrackets: null }, 'nd-measure-2', 2028)!;
    expect(data.deciles).toBeNull();
    expect(data.incomeBrackets).toBeNull();
    expect(data.winnersLosers).not.toBeNull();
  });
});

describe('buildDistricts', () => {
  const rows = parseCSV(fixtureText('congressional_districts.csv'));

  it('returns each state’s districts in order', () => {
    expect(buildDistricts(rows, 'co-amendment-87', 2027, 'CO').map((d) => d.district)).toEqual([
      'CO-01',
      'CO-02',
      'CO-03',
      'CO-04',
      'CO-05',
      'CO-06',
      'CO-07',
      'CO-08',
    ]);
    expect(buildDistricts(rows, 'ca-prop-3', 2031, 'CA')).toHaveLength(52);
    expect(buildDistricts(rows, 'wa-i-645', 2029, 'WA')).toHaveLength(10);
    expect(buildDistricts(rows, 'nd-measure-2', 2028, 'ND')).toEqual([]);
  });

  it('reads district labels and geoids', () => {
    expect(districtNumber('CO-01')).toBe('1');
    expect(districtNumber('CA-52')).toBe('52');
    expect(districtNumber(801)).toBe('1');
    expect(districtNumber('5310')).toBe('10');
    expect(districtNumber('n/a')).toBe('');
  });
});
