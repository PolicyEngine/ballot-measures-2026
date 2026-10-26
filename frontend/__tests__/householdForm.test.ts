import { describe, expect, it } from 'vitest';
import {
  atIncomeRows,
  buildChartRows,
  defaultForm,
  formFromHash,
  formFromRequest,
  netIncomeChange,
  newDependent,
  parseMoneyInput,
  requestKey,
  validateHouseholdForm,
  type HouseholdFormValues,
} from '../lib/householdForm';
import { getMeasure } from '../lib/registry';
import { fixtureResponse } from './testUtils';

const FORM: HouseholdFormValues = {
  ageHead: '40',
  income: 95_000,
  married: true,
  ageSpouse: '38',
  spouseIncome: 20_000,
  dependents: [newDependent(6), newDependent(9)],
};

describe('validateHouseholdForm', () => {
  it('builds the request with the measure and year', () => {
    const { errors, request } = validateHouseholdForm(FORM, 'co-prop-nn', 2028);
    expect(errors).toEqual({});
    expect(request).toEqual({
      measure: 'co-prop-nn',
      year: 2028,
      age_head: 40,
      married: true,
      age_spouse: 38,
      spouse_income: 20_000,
      income: 95_000,
      dependents: [{ age: 6 }, { age: 9 }],
    });
  });

  it('leaves spouse fields out for a single filer', () => {
    const { request } = validateHouseholdForm({ ...FORM, married: false }, 'co-prop-nn', 2027);
    expect(request).not.toHaveProperty('age_spouse');
    expect(request).not.toHaveProperty('spouse_income');
  });

  it('flags out-of-range ages and incomes', () => {
    const d = newDependent(200);
    const { errors, request } = validateHouseholdForm(
      { ...FORM, ageHead: '17', ageSpouse: 'x', income: 200_000_000, dependents: [d] },
      'wa-i-645',
      2028,
    );
    expect(request).toBeNull();
    expect(errors.ageHead).toMatch(/between 18 and 110/);
    expect(errors.ageSpouse).toMatch(/whole number/);
    expect(errors.income).toMatch(/\$100,000,000 or less/);
    expect(errors.dependentAges?.[d.key]).toMatch(/between 0 and 110/);
  });
});

describe('form helpers', () => {
  it('parses money input', () => {
    expect(parseMoneyInput('$1,250,000')).toBe(1_250_000);
    expect(parseMoneyInput('')).toBe(0);
  });

  it('starts from the measure’s first example profile', () => {
    const form = defaultForm(getMeasure('nd-measure-2'));
    expect(form.income).toBe(30_000);
    expect(form.dependents.map((d) => d.age)).toEqual(['8']);
  });

  it('applies hash inputs', () => {
    const form = formFromHash({ income: 60_000, age: 33, married: false, dependents: [2] }, FORM);
    expect(form).toMatchObject({ income: 60_000, ageHead: '33', married: false });
    expect(form.dependents.map((d) => d.age)).toEqual(['2']);
  });

  it('round-trips a request through the form', () => {
    const { request } = validateHouseholdForm(FORM, 'co-prop-nn', 2028);
    const again = validateHouseholdForm(formFromRequest(request!), 'co-prop-nn', 2028).request;
    expect(requestKey(again)).toBe(requestKey(request));
    expect(requestKey({ ...request!, year: 2027 })).not.toBe(requestKey(request));
  });
});

describe('derived results', () => {
  it('computes the change in net income at the entered income', () => {
    const response = fixtureResponse('wa-i-645', 1);
    expect(netIncomeChange(response)).toBeCloseTo(
      response.at_income.reform.net_income - response.at_income.baseline.net_income,
    );
  });

  it('builds one chart row per sweep point', () => {
    const response = fixtureResponse('co-prop-nn', 0);
    const rows = buildChartRows(response, 'tabor_refund');
    expect(rows).toHaveLength(response.income_range.length);
    expect(rows[0].change).toBeCloseTo(response.sweep.reform.net_income[0] - response.sweep.baseline.net_income[0]);
    expect(rows[0].kindBaseline).toBe(response.sweep.baseline.refund![0]);
  });

  it('lists kind-specific rows and drops rows that are zero under both policies', () => {
    const nn = atIncomeRows(fixtureResponse('co-prop-nn', 0), getMeasure('co-prop-nn'));
    expect(nn.map((r) => r.key)).toContain('refund');
    const sd = atIncomeRows(fixtureResponse('sd-amendment-i', 0), getMeasure('sd-amendment-i'));
    expect(sd.map((r) => r.key)).toContain('medicaid');
    expect(sd.find((r) => r.key === 'medicaid_enrolled')?.unit).toBe('count');
    expect(sd.map((r) => r.key)).not.toContain('state_tax');
  });
});
