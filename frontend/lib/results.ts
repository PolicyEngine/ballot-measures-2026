/**
 * Build one measure-year's results from the parsed results CSVs
 * (scripts/DATA_SCHEMA.md). Every CSV starts with `measure,year`; these
 * helpers filter on both, so the measure and year selectors need no refetch.
 *
 * Units follow the data contract: rates in metrics.csv are percents
 * (12.3 = 12.3%), `relative_change` and the winners/losers and district
 * shares are fractions (0.123 = 12.3%), and dollar amounts are annual.
 * Budget figures are signed from the government's side: a positive
 * `state_budget_impact` means the state gains revenue or spends less.
 */

import type { CsvRow } from './parseCSV';

export type { CsvRow };

export interface DecileRow {
  decile: number;
  /** Average change in household net income, dollars. */
  average_change: number;
  /** Change as a fraction of the decile's baseline net income. */
  relative_change: number;
}

export interface WinnersLosersShares {
  gain_more_5pct: number;
  gain_less_5pct: number;
  no_change: number;
  lose_less_5pct: number;
  lose_more_5pct: number;
}

export const WINNERS_LOSERS_KEYS: (keyof WinnersLosersShares)[] = [
  'gain_more_5pct',
  'gain_less_5pct',
  'no_change',
  'lose_less_5pct',
  'lose_more_5pct',
];

export interface IncomeBracketRow {
  bracket: string;
  households: number;
  winners: number;
  losers: number;
  total_change: number;
  average_change: number;
  state_budget_impact: number;
}

export interface DistrictRow {
  /** "CO-01" */
  district: string;
  /** "1".."52" */
  district_number: string;
  state: string;
  households: number;
  average_household_income_change: number;
  /** Fraction of baseline net income. */
  relative_household_income_change: number;
  /** Fractions of households. */
  winners_share: number;
  losers_share: number;
  state_budget_impact: number;
}

export interface StatewideResults {
  measure: string;
  year: number;
  metrics: Record<string, number>;
  deciles: DecileRow[] | null;
  winnersLosers: {
    all: WinnersLosersShares;
    deciles: (WinnersLosersShares & { decile: number })[];
  } | null;
  incomeBrackets: IncomeBracketRow[] | null;
}

/** The statewide CSVs, keyed by the name the builder uses. */
export const STATEWIDE_FILES = {
  metrics: 'metrics.csv',
  distributional: 'distributional_impact.csv',
  winnersLosers: 'winners_losers.csv',
  incomeBrackets: 'income_brackets.csv',
} as const;

export type StatewideFileKey = keyof typeof STATEWIDE_FILES;

/** Parsed rows per file; null when the file is missing. */
export type StatewideFiles = Record<StatewideFileKey, CsvRow[] | null>;

export const DISTRICTS_FILE = 'congressional_districts.csv';

export const num = (value: string | number | undefined | null): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Rows for one measure and tax year. */
export function rowsFor(rows: CsvRow[] | null | undefined, slug: string, year: number): CsvRow[] {
  if (!rows) return [];
  return rows.filter(
    (r) => String(r.measure ?? '').trim() === slug && Number(r.year) === year,
  );
}

/** metrics.csv rows for one measure-year as a lookup, or null when there are none. */
export function metricsFor(
  rows: CsvRow[] | null | undefined,
  slug: string,
  year: number,
): Record<string, number> | null {
  const selected = rowsFor(rows, slug, year);
  if (selected.length === 0) return null;
  const out: Record<string, number> = {};
  for (const r of selected) {
    const value =
      typeof r.value === 'number'
        ? r.value
        : String(r.value ?? '').trim() === ''
          ? NaN
          : Number(r.value);
    // Blank or non-numeric cells mean "not computed"; leave them out.
    if (String(r.metric ?? '').trim() && Number.isFinite(value)) {
      out[String(r.metric).trim()] = value;
    }
  }
  return out;
}

/** Metric value, or null when the metric is absent. */
export function metric(
  metrics: Record<string, number> | null | undefined,
  name: string,
): number | null {
  if (!metrics || !(name in metrics)) return null;
  const v = metrics[name];
  return Number.isFinite(v) ? v : null;
}

const nonEmpty = <T>(rows: T[]): T[] | null => (rows.length > 0 ? rows : null);

function shares(r: CsvRow): WinnersLosersShares {
  return {
    gain_more_5pct: num(r.gain_more_5pct),
    gain_less_5pct: num(r.gain_less_5pct),
    no_change: num(r.no_change),
    lose_less_5pct: num(r.lose_less_5pct),
    lose_more_5pct: num(r.lose_more_5pct),
  };
}

/**
 * One measure-year's statewide results, or null when metrics.csv has no
 * rows for it. `bracketOrder` lists the income-band labels in display order
 * (the registry's `income_bands`).
 */
export function buildStatewide(
  files: StatewideFiles,
  slug: string,
  year: number,
  bracketOrder: string[] = [],
): StatewideResults | null {
  const metrics = metricsFor(files.metrics, slug, year);
  if (!metrics) return null;

  const deciles: DecileRow[] = rowsFor(files.distributional, slug, year)
    .map((r) => ({
      decile: num(r.decile),
      average_change: num(r.average_change),
      relative_change: num(r.relative_change),
    }))
    .filter((r) => r.decile >= 1 && r.decile <= 10)
    .sort((a, b) => a.decile - b.decile);

  const wlRows = rowsFor(files.winnersLosers, slug, year);
  const allRow = wlRows.find((r) => String(r.decile).trim().toLowerCase() === 'all');
  const wlDeciles = wlRows
    .filter((r) => String(r.decile).trim().toLowerCase() !== 'all')
    .map((r) => ({ decile: num(r.decile), ...shares(r) }))
    .filter((r) => r.decile >= 1 && r.decile <= 10)
    .sort((a, b) => a.decile - b.decile);
  const winnersLosers = allRow ? { all: shares(allRow), deciles: wlDeciles } : null;

  const orderIndex = (label: string) => {
    const i = bracketOrder.indexOf(label);
    return i === -1 ? bracketOrder.length : i;
  };
  const incomeBrackets: IncomeBracketRow[] = rowsFor(files.incomeBrackets, slug, year)
    .map((r) => ({
      bracket: String(r.bracket),
      households: num(r.households),
      winners: num(r.winners),
      losers: num(r.losers),
      total_change: num(r.total_change),
      average_change: num(r.average_change),
      state_budget_impact: num(r.state_budget_impact),
    }))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => orderIndex(a.r.bracket) - orderIndex(b.r.bracket) || a.i - b.i)
    .map(({ r }) => r);

  return {
    measure: slug,
    year,
    metrics,
    deciles: nonEmpty(deciles),
    winnersLosers,
    incomeBrackets: nonEmpty(incomeBrackets),
  };
}

/** District number ("1".."52") from "CO-01", "CO-1" or a numeric geoid (801). */
export function districtNumber(value: string | number): string {
  const text = String(value).trim();
  const dashed = text.split('-')[1];
  if (dashed !== undefined) {
    const n = parseInt(dashed, 10);
    return Number.isNaN(n) ? '' : String(n);
  }
  const n = parseInt(text, 10);
  if (Number.isNaN(n)) return '';
  // Geoids are state FIPS x 100 + district.
  return String(n >= 100 ? n % 100 : n);
}

/** One measure-year's districts in one state, sorted by number. */
export function buildDistricts(
  rows: CsvRow[] | null | undefined,
  slug: string,
  year: number,
  stateCode: string,
): DistrictRow[] {
  return rowsFor(rows, slug, year)
    .filter((r) => {
      const state = String(r.state ?? '').trim();
      return state === '' ? String(r.district).startsWith(`${stateCode}-`) : state === stateCode;
    })
    .map((r) => {
      const number = districtNumber(r.district);
      return {
        district: `${stateCode}-${number.padStart(2, '0')}`,
        district_number: number,
        state: stateCode,
        households: num(r.households),
        average_household_income_change: num(r.average_household_income_change),
        relative_household_income_change: num(r.relative_household_income_change),
        winners_share: num(r.winners_share),
        losers_share: num(r.losers_share),
        state_budget_impact: num(r.state_budget_impact),
      };
    })
    .filter((d) => d.district_number !== '')
    .sort((a, b) => Number(a.district_number) - Number(b.district_number));
}
