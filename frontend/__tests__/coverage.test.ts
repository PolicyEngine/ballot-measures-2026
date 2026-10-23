import { describe, expect, it } from 'vitest';
import { coverageOutcome, coverageSegments, coverageSummary, parseCoverageStatus } from '../lib/coverage';
import type { HouseholdResponse, PolicyPoint, PolicySweep } from '../lib/householdApi';

const response = (baseline: PolicyPoint, reform: PolicyPoint): HouseholdResponse => ({
  measure: 'sd-amendment-i',
  year: 2028,
  state: 'SD',
  pin: 'p',
  income_range: [0],
  income_index: 0,
  sweep: {
    baseline: { net_income: [0], state_tax: [0], federal_tax: [0] },
    reform: { net_income: [0], state_tax: [0], federal_tax: [0] },
  } as unknown as HouseholdResponse['sweep'],
  at_income: { baseline, reform },
});

const point = (p: Partial<PolicyPoint>): PolicyPoint => ({ net_income: 0, state_tax: 0, federal_tax: 0, ...p });

describe('parseCoverageStatus', () => {
  it('reads the household API’s statuses', () => {
    expect(parseCoverageStatus('medicaid')).toBe('medicaid');
    expect(parseCoverageStatus('Marketplace')).toBe('marketplace');
    expect(parseCoverageStatus('subsidized_marketplace')).toBe('marketplace');
    expect(parseCoverageStatus('coverage_gap')).toBe('no_subsidy');
    expect(parseCoverageStatus('unsubsidized')).toBe('no_subsidy');
    expect(parseCoverageStatus('no_subsidized_option')).toBe('no_subsidy');
    expect(parseCoverageStatus('employer')).toBeNull();
    expect(parseCoverageStatus(undefined)).toBeNull();
  });
});

describe('coverageSegments', () => {
  const sweep = (fields: Partial<Record<keyof PolicySweep, unknown>>): PolicySweep =>
    ({ net_income: [0, 0, 0, 0, 0], state_tax: [0, 0, 0, 0, 0], federal_tax: [0, 0, 0, 0, 0], ...fields }) as PolicySweep;
  const incomes = [0, 5_000, 10_000, 15_000, 20_000];

  it('groups the sweep into runs of coverage and reason', () => {
    const segments = coverageSegments(
      incomes,
      sweep({
        coverage_status: ['no_subsidized_option', 'no_subsidized_option', 'medicaid', 'medicaid', 'subsidized_marketplace'],
        no_option_reason: ['work_requirement', 'below_poverty_line', null, null, null],
      }),
    );
    expect(segments.map((s) => [s.shortLabel, s.first, s.last, s.end])).toEqual([
      ['Work requirement', 0, 0, 5_000],
      ['Coverage gap', 5_000, 5_000, 10_000],
      ['Medicaid', 10_000, 15_000, 20_000],
      ['Marketplace', 20_000, 20_000, 20_000],
    ]);
    expect(segments[0].label).toBe('No subsidized coverage option (work requirement)');
    expect(segments[3].label).toBe('Subsidized marketplace coverage');
  });

  it('falls back to enrollment and the credit without coverage_status', () => {
    const segments = coverageSegments(
      incomes,
      sweep({ medicaid_enrolled: [1, 1, 0, 0, 0], ptc: [0, 0, 3_000, 2_000, 0] }),
    );
    expect(segments.map((s) => s.kind)).toEqual(['medicaid', 'marketplace', 'other']);
  });
});

describe('coverageOutcome', () => {
  it('derives the coverage gap from enrollment and the credit when the API gives no status', () => {
    const o = coverageOutcome(response(point({ medicaid_enrolled: 1 }), point({ medicaid_enrolled: 0, ptc: 0 })));
    expect(o.losesMedicaid).toBe(true);
    expect(o.baselineLabel).toBe('Medicaid');
    expect(o.reformLabel).toBe('No subsidized coverage option');
    expect(coverageSummary(o)).toBe('Medicaid → No subsidized coverage option');
  });

  it('derives marketplace coverage and the premium change', () => {
    const o = coverageOutcome(
      response(
        point({ medicaid_enrolled: 2, ptc: 0, marketplace_premium: 0 }),
        point({ medicaid_enrolled: 0, ptc: 31_539, marketplace_premium: 588 }),
      ),
    );
    expect(o.reform).toBe('marketplace');
    expect(o.premiumChange).toBe(588);
    expect(o.enrolledBaseline - o.enrolledReform).toBe(2);
  });

  it('prefers the API’s coverage_status', () => {
    const o = coverageOutcome(
      response(
        point({ medicaid_enrolled: 1, coverage_status: 'medicaid' }),
        point({ medicaid_enrolled: 0, ptc: 100, coverage_status: 'coverage_gap' }),
      ),
    );
    expect(o.reformLabel).toBe('No subsidized coverage option');
  });

  it('reads the API’s reasons and cash income', () => {
    const o = coverageOutcome(
      response(
        point({ medicaid_enrolled: 1, coverage_status: 'medicaid', cash_net_income: 14_000 }),
        point({
          medicaid_enrolled: 0,
          coverage_status: 'no_subsidized_option',
          no_option_reason: 'below_poverty_line',
          cash_net_income: 14_000,
        }),
      ),
    );
    expect(o.reform).toBe('no_subsidy');
    expect(o.reformReason).toBe('Income below the poverty line, too low for a premium tax credit');
    expect(o.baselineReason).toBeNull();
    expect(o.cashChange).toBe(0);
  });

  it('takes the cash change from cash_net_income, else from the premium', () => {
    const withCash = coverageOutcome(
      response(
        point({ medicaid_enrolled: 2, cash_net_income: 28_000 }),
        point({ ptc: 11_800, marketplace_premium: 840, cash_net_income: 27_000, coverage_status: 'subsidized_marketplace' }),
      ),
    );
    // Taxes or other benefits can change too, so cash_net_income wins when present.
    expect(withCash.cashChange).toBe(-1_000);
    const withoutCash = coverageOutcome(
      response(point({ medicaid_enrolled: 2 }), point({ ptc: 11_800, marketplace_premium: 840 })),
    );
    expect(withoutCash.cashChange).toBe(-840);
  });

  it('labels Medicare and unrecognized statuses', () => {
    const o = coverageOutcome(
      response(point({ coverage_status: 'medicare' }), point({ coverage_status: 'medicare' })),
    );
    expect(o.baselineLabel).toBe('Medicare');
    expect(coverageSummary(o)).toBe('No change in coverage');
    expect(parseCoverageStatus('employer_sponsored')).toBeNull();
  });

  it('reports no change when nobody loses Medicaid', () => {
    expect(coverageSummary(coverageOutcome(response(point({}), point({}))))).toBe('No change in coverage');
    expect(
      coverageSummary(coverageOutcome(response(point({ medicaid_enrolled: 1 }), point({ medicaid_enrolled: 1 })))),
    ).toBe('Keeps Medicaid');
  });
});
