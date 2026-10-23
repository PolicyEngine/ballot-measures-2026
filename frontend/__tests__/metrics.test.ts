import { describe, expect, it } from 'vitest';
import parseCSV from '../lib/parseCSV';
import { compareEstimate, headlineFor, metricRange, shortSource } from '../lib/metrics';
import { metricsFor } from '../lib/results';
import { getMeasure } from '../lib/registry';
import { fixtureText } from './testUtils';

const metricsRows = parseCSV(fixtureText('metrics.csv'));
const metricsOf = (slug: string, year: number) => metricsFor(metricsRows, slug, year);

describe('metricRange', () => {
  it('reads a single metric or a _low/_high pair', () => {
    expect(metricRange({ a: 5 }, 'a')).toEqual({ low: 5, high: 5 });
    expect(metricRange({ c_low: 1, c_high: 3 }, 'c')).toEqual({ low: 1, high: 3 });
    expect(metricRange({ c_low: 1 }, 'c')).toEqual({ low: 1, high: 1 });
    expect(metricRange({}, 'c')).toBeNull();
    expect(metricRange(null, 'c')).toBeNull();
  });
});

describe('compareEstimate', () => {
  const co = getMeasure('co-amendment-87');
  const estimate = co.official_estimates[0];

  it('reports the model as a percent of a point estimate', () => {
    const c = compareEstimate(estimate, { state_budget_impact: estimate.low / 2 });
    expect(c.ratioPercent).toBeCloseTo(50);
    expect(c.position).toBe('below');
  });

  it('places the model within, below or above an official range', () => {
    const nd = getMeasure('nd-measure-2').official_estimates[0];
    expect(compareEstimate(nd, { state_cost_biennium_low: 1.2e8, state_cost_biennium_high: 1.3e8 }).position).toBe(
      'within',
    );
    expect(compareEstimate(nd, { state_cost_biennium: 2e8 }).position).toBe('above');
    expect(compareEstimate(nd, { state_cost_biennium: 1e8 }).position).toBe('below');
  });

  it('is pending when the model has no matching metric', () => {
    const c = compareEstimate(estimate, {});
    expect(c.model).toBeNull();
    expect(c.position).toBeNull();
  });
});

describe('headlineFor', () => {
  it('shows signed revenue for income tax measures beside the official figure', () => {
    const wa = getMeasure('wa-i-645');
    const h = headlineFor(wa, metricsOf('wa-i-645', 2028));
    expect(h.label).toBe('Change in state revenue, 2028');
    expect(h.model).toMatch(/^-\$3\./);
    expect(h.official).toBe('-$3.11B');
    expect(h.officialSource).toMatch(/Office of Financial Management, FY 2029/);
  });

  it('shows the two-year cost range for school meals', () => {
    const h = headlineFor(getMeasure('nd-measure-2'), metricsOf('nd-measure-2', 2028));
    expect(h.label).toBe('State cost per two-year budget');
    // Model figures round to three significant digits; official ones keep their precision.
    expect(h.model).toBe('$119M to $134M');
    expect(h.official).toBe('$124.3M to $134.3M');
  });

  it('shows people losing Medicaid beside expansion enrollment for South Dakota', () => {
    const h = headlineFor(getMeasure('sd-amendment-i'), metricsOf('sd-amendment-i', 2028));
    expect(h.model).toBe('27,400');
    expect(h.officialLabel).toBe('Enrolled through expansion');
    expect(h.official).toBe('30,000');
  });

  it('has no model figure before results exist', () => {
    const h = headlineFor(getMeasure('co-prop-nn'), null);
    expect(h.model).toBeNull();
    expect(h.official).toBe('$259.8M');
  });

  it('shortens long source names', () => {
    expect(shortSource('Colorado Legislative Council Staff, 2026 Blue Book')).toBe(
      'Legislative Council Staff, 2026 Blue Book',
    );
  });
});
