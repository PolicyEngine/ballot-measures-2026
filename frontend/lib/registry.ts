/**
 * The measure registry: frontend/public/data/measures.json, which
 * `python -m ballot_calc.export` writes from ballot_calc/measures.py.
 * It is imported at build time, so every page knows its measure's tabs,
 * years and official estimates without a request. Pure data (no React), so
 * server components can import it.
 */

import registryJson from '@/public/data/measures.json';

// ── Registry types ──────────────────────────────────────────────────────

export const MEASURE_KINDS = ['income_tax', 'tabor_refund', 'school_meals', 'medicaid'] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

export interface OfficialEstimate {
  source: string;
  url: string;
  /** Period as the source states it, e.g. "FY 2027-28". */
  period: string;
  /** Model tax year the estimate is compared with. */
  model_year: number;
  /** metrics.csv key it is compared with (a `_low`/`_high` pair may stand in for it). */
  metric: string;
  low: number;
  high: number;
  unit: 'usd' | 'people';
  /** How the source's concept differs from the model's. */
  note: string;
}

export interface IncomeBand {
  low: number;
  high: number;
  label: string;
}

export interface ExampleProfile {
  label: string;
  income: number;
  age_head: number;
  married: boolean;
  spouse_income: number;
  dependents: number[];
}

export interface Measure {
  slug: string;
  state: string;
  state_name: string;
  state_fips: number;
  designation: string;
  short_title: string;
  kind: MeasureKind;
  years: number[];
  headline_year: number;
  headline_metric: string;
  has_districts: boolean;
  district_count: number;
  official_estimates: OfficialEstimate[];
  income_bands: IncomeBand[];
  sweep_max: number;
  example_profiles: ExampleProfile[];
  kind_params: Record<string, unknown>;
  target_variable: string;
  target_sign: number;
  baseline_overrides: Record<string, Record<string, unknown>>;
  reform_overrides: Record<string, Record<string, unknown>>;
}

export interface MeasuresRegistry {
  election_date: string;
  pin: string;
  registry_hash: string;
  measures: Measure[];
}

// measures.json writes non-finite numbers as the strings "Infinity" and
// "-Infinity" so the file stays valid JSON.
const toNumber = (value: unknown): number => {
  if (value === 'Infinity') return Infinity;
  if (value === '-Infinity') return -Infinity;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? 0 : n;
};

type RawMeasure = Omit<Measure, 'income_bands'> & {
  income_bands: [number | string, number | string, string][];
};

export function normalizeRegistry(raw: unknown): MeasuresRegistry {
  const r = raw as Omit<MeasuresRegistry, 'measures'> & { measures: RawMeasure[] };
  return {
    election_date: r.election_date,
    pin: r.pin,
    registry_hash: r.registry_hash,
    measures: r.measures.map((m) => ({
      ...m,
      years: m.years.map(Number),
      income_bands: m.income_bands.map(([low, high, label]) => ({
        low: toNumber(low),
        high: toNumber(high),
        label,
      })),
      official_estimates: m.official_estimates.map((e) => ({
        ...e,
        low: toNumber(e.low),
        high: toNumber(e.high),
        unit: e.unit === 'people' ? 'people' : 'usd',
      })),
      example_profiles: m.example_profiles ?? [],
      kind_params: m.kind_params ?? {},
    })),
  };
}

export const REGISTRY: MeasuresRegistry = normalizeRegistry(registryJson);

/** Every measure, in registry order. */
export const MEASURES: readonly Measure[] = REGISTRY.measures;

export const MEASURES_BY_SLUG: Readonly<Record<string, Measure>> = Object.fromEntries(
  MEASURES.map((m) => [m.slug, m]),
);

/** "2026-11-03" */
export const ELECTION_DATE = REGISTRY.election_date;

export function isMeasureSlug(slug: string | null | undefined): slug is string {
  return typeof slug === 'string' && slug in MEASURES_BY_SLUG;
}

export function getMeasure(slug: string): Measure {
  const measure = MEASURES_BY_SLUG[slug];
  if (!measure) throw new Error(`Unknown measure: ${slug}`);
  return measure;
}

/** "Colorado Amendment 87" */
export const measureName = (m: Measure): string => `${m.state_name} ${m.designation}`;

/** A valid tax year for the measure: `year` when scored, else the headline year. */
export function resolveYear(m: Measure, year: number | null | undefined): number {
  return year !== null && year !== undefined && m.years.includes(year) ? year : m.headline_year;
}

/** Measures grouped by state, states in registry order. */
export function measuresByState(): { state: string; stateName: string; measures: Measure[] }[] {
  const groups: { state: string; stateName: string; measures: Measure[] }[] = [];
  for (const m of MEASURES) {
    const group = groups.find((g) => g.state === m.state);
    if (group) group.measures.push(m);
    else groups.push({ state: m.state, stateName: m.state_name, measures: [m] });
  }
  return groups;
}

/** Official estimates compared with the model in a given tax year. */
export const estimatesForYear = (m: Measure, year: number): OfficialEstimate[] =>
  m.official_estimates.filter((e) => e.model_year === year);
