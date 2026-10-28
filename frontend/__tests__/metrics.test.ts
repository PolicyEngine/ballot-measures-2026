import { describe, expect, it } from 'vitest';
import parseCSV from '../lib/parseCSV';
import { compareEstimate, headlineFor, metricRange, shortSource, stateCostCentral } from '../lib/metrics';
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

  it('says which end of a model range falls in an overlapping official range', () => {
    const nd = getMeasure('nd-measure-2').official_estimates[0]; // $124.3M to $134.3M
    const high = compareEstimate(nd, { state_cost_biennium_low: 1.07e8, state_cost_biennium_high: 1.274e8 });
    expect(high.position).toBe('below');
    expect(high.overlap).toBe('high');
    expect(
      compareEstimate(nd, { state_cost_biennium_low: 1.3e8, state_cost_biennium_high: 1.5e8 }).overlap,
    ).toBe('low');
    expect(
      compareEstimate(nd, { state_cost_biennium_low: 1.0e8, state_cost_biennium_high: 2.0e8 }).overlap,
    ).toBe('spans');
    expect(compareEstimate(nd, { state_cost_biennium_low: 0.9e8, state_cost_biennium_high: 1.0e8 }).overlap).toBeNull();
    expect(compareEstimate(nd, { state_cost_biennium: 1.0e8 }).overlap).toBeNull();
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

  it('shows one central two-year cost for school meals', () => {
    const metrics = metricsOf('nd-measure-2', 2028);
    const h = headlineFor(getMeasure('nd-measure-2'), metrics);
    expect(h.label).toBe('State cost per two-year budget');
    // The fixtures have no state_cost_biennium_central: twice the annual state budget cost ($63M).
    // Model figures round to three significant digits; official ones keep their precision.
    expect(h.model).toBe('$126M');
    expect(h.official).toBe('$124.3M to $134.3M');
    // The pipeline's central figure wins when it is published.
    expect(
      headlineFor(getMeasure('nd-measure-2'), { ...metrics!, state_cost_biennium_central: 114_085_339.99 }).model,
    ).toBe('$114M');
  });

  it('takes the central state cost from the pipeline, falling back to the state budget line', () => {
    expect(
      stateCostCentral({ state_cost_central: 57e6, state_cost_biennium_central: 114e6, state_budget_impact: -60e6 }),
    ).toEqual({ annual: 57e6, biennium: 114e6 });
    expect(stateCostCentral({ state_budget_impact: -63e6 })).toEqual({ annual: 63e6, biennium: 126e6 });
    expect(stateCostCentral({ state_cost_central: 57e6 })).toEqual({ annual: 57e6, biennium: 114e6 });
    expect(stateCostCentral({})).toEqual({ annual: null, biennium: null });
  });

  it('shows people losing Medicaid beside expansion enrollment for South Dakota', () => {
    const h = headlineFor(getMeasure('sd-amendment-i'), metricsOf('sd-amendment-i', 2028));
    // The headline is the calibrated count (unsuffixed), not people_losing_medicaid_model.
    expect(h.model).toBe('28,017');
    expect(h.officialLabel).toBe('Enrolled through expansion');
    // The Department of Social Services' enrollment, which the counts are calibrated to.
    expect(h.official).toBe('29,055');
    expect(h.officialSource).toMatch(/^Department of Social Services/);
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
