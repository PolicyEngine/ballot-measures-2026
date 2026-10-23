/**
 * Household calculator form: validation, request building, and the
 * quantities the results view derives from a response.
 *
 * Limits mirror ballot_calc/household.py, so the form catches invalid
 * input before the endpoint returns a 422. Sign convention: every change
 * is reform − baseline (positive = the household's net income rises).
 */

import type { HashParams } from './embedding';
import type {
  HouseholdRequest,
  HouseholdResponse,
  PolicyName,
  PolicyPoint,
  PolicySweep,
} from './householdApi';
import type { ExampleProfile, Measure, MeasureKind } from './registry';

export const MIN_ADULT_AGE = 18;
export const MAX_AGE = 110;
export const MAX_DEPENDENTS = 8;
export const MAX_INCOME = 100_000_000;

export interface DependentFormValue {
  /** Stable React key. */
  key: number;
  /** Raw text so the field can be cleared while typing. */
  age: string;
}

export interface HouseholdFormValues {
  ageHead: string;
  income: number;
  married: boolean;
  ageSpouse: string;
  spouseIncome: number;
  dependents: DependentFormValue[];
}

export interface HouseholdFormErrors {
  ageHead?: string;
  income?: string;
  ageSpouse?: string;
  spouseIncome?: string;
  dependents?: string;
  /** Keyed by DependentFormValue.key. */
  dependentAges?: Record<number, string>;
}

let nextDependentKey = 1;
export const newDependent = (age = 8): DependentFormValue => ({
  key: nextDependentKey++,
  age: String(age),
});

export const FALLBACK_FORM: HouseholdFormValues = {
  ageHead: '40',
  income: 60_000,
  married: false,
  ageSpouse: '40',
  spouseIncome: 0,
  dependents: [],
};

/** Starting values: the measure's first example profile. */
export function defaultForm(measure: Measure): HouseholdFormValues {
  const p: ExampleProfile | undefined = measure.example_profiles[0];
  if (!p) return FALLBACK_FORM;
  return {
    ageHead: String(p.age_head),
    income: p.income,
    married: p.married,
    ageSpouse: String(p.age_head),
    spouseIncome: p.spouse_income ?? 0,
    dependents: (p.dependents ?? []).map((age) => newDependent(age)),
  };
}

/** Apply #income=…&age=…&married=…&dependents=4,9 to a form. */
export function formFromHash(params: HashParams, base: HouseholdFormValues): HouseholdFormValues {
  return {
    ...base,
    ...(params.income !== undefined ? { income: Math.max(0, params.income) } : {}),
    ...(params.age !== undefined ? { ageHead: String(params.age) } : {}),
    ...(params.married !== undefined ? { married: params.married } : {}),
    ...(params.dependents ? { dependents: params.dependents.map((age) => newDependent(age)) } : {}),
  };
}

/** "1,234" -> 1234; strips everything but digits. Empty -> 0. */
export function parseMoneyInput(text: string): number {
  const digits = text.replace(/[^0-9]/g, '');
  return digits === '' ? 0 : Number(digits);
}

/** Whole non-negative number, or NaN. */
export function parseWholeNumber(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ageError(text: string, min: number, max: number, who: string): string | undefined {
  const age = parseWholeNumber(text);
  if (Number.isNaN(age)) return `Enter ${who} age as a whole number.`;
  if (age < min || age > max) return `${capitalize(who)} age must be between ${min} and ${max}.`;
  return undefined;
}

function incomeError(value: number, label: string): string | undefined {
  if (!Number.isFinite(value) || value < 0) return `${label} must be zero or more.`;
  if (value > MAX_INCOME) return `${label} must be $100,000,000 or less.`;
  return undefined;
}

/** Validate the form; returns field errors and, when valid, the payload. */
export function validateHouseholdForm(
  form: HouseholdFormValues,
  measure: string,
  year: number,
): { errors: HouseholdFormErrors; request: HouseholdRequest | null } {
  const errors: HouseholdFormErrors = {};

  errors.ageHead = ageError(form.ageHead, MIN_ADULT_AGE, MAX_AGE, 'your');
  errors.income = incomeError(form.income, 'Employment income');
  if (form.married) {
    errors.ageSpouse = ageError(form.ageSpouse, MIN_ADULT_AGE, MAX_AGE, "your spouse's");
    errors.spouseIncome = incomeError(form.spouseIncome, 'Spouse employment income');
  }
  if (form.dependents.length > MAX_DEPENDENTS) {
    errors.dependents = `Enter at most ${MAX_DEPENDENTS} dependents.`;
  }
  const dependentAges: Record<number, string> = {};
  for (const d of form.dependents) {
    const message = ageError(d.age, 0, MAX_AGE, "the dependent's");
    if (message) dependentAges[d.key] = message;
  }
  if (Object.keys(dependentAges).length > 0) errors.dependentAges = dependentAges;

  (Object.keys(errors) as (keyof HouseholdFormErrors)[]).forEach((k) => {
    if (errors[k] === undefined) delete errors[k];
  });
  if (Object.keys(errors).length > 0) return { errors, request: null };

  const request: HouseholdRequest = {
    measure,
    year,
    age_head: parseWholeNumber(form.ageHead),
    married: form.married,
    income: form.income,
    dependents: form.dependents.map((d) => ({ age: parseWholeNumber(d.age) })),
  };
  if (form.married) {
    request.age_spouse = parseWholeNumber(form.ageSpouse);
    request.spouse_income = form.spouseIncome;
  }
  return { errors, request };
}

/** Form values for a stored request (example households). */
export function formFromRequest(request: HouseholdRequest): HouseholdFormValues {
  const married = request.married ?? (request.age_spouse !== undefined && request.age_spouse !== null);
  return {
    ageHead: String(request.age_head),
    income: request.income,
    married,
    ageSpouse: married && request.age_spouse != null ? String(request.age_spouse) : String(request.age_head),
    spouseIncome: married ? (request.spouse_income ?? 0) : 0,
    dependents: (request.dependents ?? []).map((d) =>
      newDependent(typeof d === 'number' ? d : d.age),
    ),
  };
}

/** Stable comparison key for two requests (ignores key order). */
export function requestKey(request: HouseholdRequest | null): string {
  if (!request) return '';
  return JSON.stringify({
    measure: request.measure,
    year: request.year,
    age_head: request.age_head,
    income: request.income,
    married: request.married,
    age_spouse: request.married ? (request.age_spouse ?? null) : null,
    spouse_income: request.married ? (request.spouse_income ?? 0) : 0,
    dependents: (request.dependents ?? []).map((d) => (typeof d === 'number' ? d : d.age)),
  });
}

// ── Derived results ─────────────────────────────────────────────────────

export const FILING_STATUS_LABELS: Record<string, string> = {
  SINGLE: 'Single',
  HEAD_OF_HOUSEHOLD: 'Head of household',
  JOINT: 'Married filing jointly',
  SEPARATE: 'Married filing separately',
  SURVIVING_SPOUSE: 'Surviving spouse',
};

export function filingStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return (
    FILING_STATUS_LABELS[status] ??
    status
      .toLowerCase()
      .split('_')
      .join(' ')
      .replace(/^./, (c) => c.toUpperCase())
  );
}

/** reform − baseline for one key at the entered income (0 when absent). */
export function changeAt(result: HouseholdResponse, key: keyof PolicyPoint): number {
  const before = result.at_income.baseline[key] ?? 0;
  const after = result.at_income.reform[key] ?? 0;
  return after - before;
}

export const netIncomeChange = (result: HouseholdResponse): number => changeAt(result, 'net_income');

/** The series the third chart view shows for a measure kind. */
export const KIND_SERIES: Record<MeasureKind, { label: string; keys: (keyof PolicyPoint)[] }> = {
  income_tax: { label: 'State income tax', keys: ['state_tax'] },
  tabor_refund: { label: 'Sales tax refund', keys: ['refund'] },
  school_meals: { label: 'Value of school meals', keys: ['meal_value'] },
  medicaid: { label: 'Medicaid and premium tax credit', keys: ['medicaid', 'ptc'] },
};

const sumAt = (series: PolicySweep, keys: (keyof PolicyPoint)[], i: number) =>
  keys.reduce((total, key) => total + (series[key]?.[i] ?? 0), 0);

export interface HouseholdChartRow {
  income: number;
  baseline: number;
  reform: number;
  change: number;
  kindBaseline: number;
  kindReform: number;
  stateTaxChange: number;
  federalTaxChange: number;
}

/** One row per sweep point. */
export function buildChartRows(result: HouseholdResponse, kind: MeasureKind): HouseholdChartRow[] {
  const { baseline, reform } = result.sweep;
  const keys = KIND_SERIES[kind].keys;
  return result.income_range.map((income, i) => ({
    income,
    baseline: baseline.net_income[i],
    reform: reform.net_income[i],
    change: reform.net_income[i] - baseline.net_income[i],
    kindBaseline: sumAt(baseline, keys, i),
    kindReform: sumAt(reform, keys, i),
    stateTaxChange: reform.state_tax[i] - baseline.state_tax[i],
    federalTaxChange: reform.federal_tax[i] - baseline.federal_tax[i],
  }));
}

export interface AtIncomeRow {
  key: keyof PolicyPoint;
  label: string;
  /** 'usd' values are dollars; 'count' values are people. */
  unit: 'usd' | 'count';
  baseline: number;
  reform: number;
  /** For the household, is a higher value a gain (true) or a cost (false)? */
  higherIsBetter: boolean;
}

/** Rows for the at-income comparison table, by measure kind. Rows that are
 *  zero under both policies are dropped, except net income. */
export function atIncomeRows(result: HouseholdResponse, measure: Measure): AtIncomeRow[] {
  const point = (policy: PolicyName, key: keyof PolicyPoint) => result.at_income[policy][key] ?? 0;
  const row = (
    key: keyof PolicyPoint,
    label: string,
    higherIsBetter: boolean,
    unit: 'usd' | 'count' = 'usd',
  ): AtIncomeRow => ({
    key,
    label,
    unit,
    baseline: point('baseline', key),
    reform: point('reform', key),
    higherIsBetter,
  });
  const rows: AtIncomeRow[] = [row('net_income', 'Household net income', true)];
  switch (measure.kind) {
    case 'income_tax':
      rows.push(row('state_tax', `${measure.state_name} income tax`, false));
      break;
    case 'tabor_refund':
      rows.push(row('refund', 'Sales tax refund', true));
      rows.push(row('state_tax', 'Colorado income tax after credits', false));
      break;
    case 'school_meals':
      rows.push(row('meal_value', 'Value of school meals', true));
      rows.push(row('free_meals', 'Free meals', true));
      rows.push(row('reduced_price_meals', 'Reduced-price meals', true));
      break;
    case 'medicaid':
      rows.push(row('medicaid', 'Medicaid (value of coverage)', true));
      rows.push(row('ptc', 'Premium tax credit', true));
      rows.push(row('marketplace_premium', 'Marketplace premium after the credit', false));
      rows.push(row('medicaid_enrolled', 'People enrolled in Medicaid', true, 'count'));
      break;
  }
  rows.push(row('federal_tax', 'Federal income tax', false));
  return rows.filter(
    (r) => r.key === 'net_income' || Math.round(r.baseline) !== 0 || Math.round(r.reform) !== 0,
  );
}
