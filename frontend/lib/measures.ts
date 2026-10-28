/**
 * The measure registry and the hooks that load each measure's results.
 *
 * Structural facts (state, years, official estimates, whether a state has
 * congressional districts) come from frontend/public/data/measures.json,
 * which `python -m ballot_calc.export` writes from ballot_calc/measures.py.
 * It is imported at build time, so every page knows its measure's tabs and
 * years without a request. Results (CSVs, manifest.json and
 * example_households.json) are fetched at run time from DATA_DIR; a missing
 * file shows as "Results not yet available".
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DATA_DIR } from './config';
import { fetchCsvOrNull, fetchJsonOrNull } from './dataFiles';
import {
  DISTRICTS_FILE,
  STATEWIDE_FILES,
  buildDistricts,
  buildStatewide,
  metricsFor,
  type CsvRow,
  type DistrictRow,
  type StatewideFileKey,
  type StatewideFiles,
  type StatewideResults,
} from './results';
import type { HouseholdRequest, HouseholdResponse } from './householdApi';
import { MEASURES_BY_SLUG, REGISTRY } from './registry';

export * from './registry';

// ── Results files ───────────────────────────────────────────────────────

/** IRS Statistics of Income comparison for one state (ballot_calc/metrics/top_tail.py). */
export interface TopTailState {
  /** Tax year of the model's filers (older manifests call it model_year). */
  filer_year?: number;
  model_year?: number;
  /** Tax year of the IRS figures. */
  soi_year: number;
  model_filers: Record<string, number>;
  soi: Record<string, number>;
  /** model ÷ IRS for each key. */
  coverage: Record<string, number>;
  band_scale?: Record<string, number>;
  /** Older manifests: per "slug:year", the modeled and coverage-scaled revenue change. */
  measures?: Record<
    string,
    {
      revenue_change: number;
      coverage_scaled_revenue_change: number;
    }
  >;
}

/** manifest.json `top_tail`: per state code, or (older manifests) under `states`. */
export type TopTail = Record<string, TopTailState | unknown> & {
  states?: Record<string, TopTailState>;
};

/** One state's IRS comparison from either manifest layout. */
export function topTailFor(topTail: TopTail | null | undefined, state: string): TopTailState | null {
  if (!topTail || typeof topTail !== 'object') return null;
  const entry = (topTail.states?.[state] ?? topTail[state]) as TopTailState | undefined;
  return entry && typeof entry === 'object' && entry.model_filers && entry.soi ? entry : null;
}

/** manifest.json: provenance of the committed results (scripts/DATA_SCHEMA.md). */
export interface Manifest {
  pin: string;
  dataset_revision: string;
  registry_hash: string;
  generated_at_utc: string;
  dataset_repo?: string;
  dataset_filename?: string;
  complete?: boolean;
  /** Present in the synthetic fixture manifest only. */
  synthetic?: boolean;
  /** IRS top-income comparison for CO, CA and WA, or null. */
  top_tail?: TopTail | null;
  /** Income the pipeline adds to SPM resources in both simulations (policyengine-us#9919). */
  spm_resources_adjustment?: SpmResourcesAdjustment | null;
  [key: string]: unknown;
}

export interface SpmResourcesAdjustment {
  applied?: boolean;
  /** Variables added to each SPM unit's resources. */
  added_to_spm_resources?: string[];
  not_added?: string[];
  description?: string;
}

export interface ExampleHousehold {
  id: string;
  label: string;
  description?: string;
  /** The calculator payload. */
  input: HouseholdRequest;
  /** The calculator's response for `input`. */
  response: HouseholdResponse;
}

/**
 * One measure's examples. scripts/compute_example_households.py writes
 * every scored year (`years: {"2027": {households}}`); a single-year
 * `{year, households}` entry is also accepted.
 */
export interface ExampleMeasureEntry {
  years?: Record<string, { households: ExampleHousehold[] }>;
  year?: number;
  households?: ExampleHousehold[];
}

export interface ExampleHouseholdsPayload {
  pin: string;
  generated_at_utc?: string;
  measures: Record<string, ExampleMeasureEntry>;
}

/** A measure's examples for `year` when computed, else for its first computed year. */
export function examplesFor(
  payload: ExampleHouseholdsPayload | null | undefined,
  slug: string,
  year?: number | null,
): { year: number | null; households: ExampleHousehold[] } {
  const entry = payload?.measures?.[slug];
  if (!entry) return { year: null, households: [] };
  if (entry.years && typeof entry.years === 'object') {
    const years = Object.keys(entry.years)
      .map(Number)
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    const chosen = year !== undefined && year !== null && years.includes(year) ? year : years[0];
    const households = chosen === undefined ? [] : entry.years[String(chosen)]?.households;
    return Array.isArray(households) && chosen !== undefined
      ? { year: chosen, households }
      : { year: null, households: [] };
  }
  if (Array.isArray(entry.households) && typeof entry.year === 'number') {
    return { year: entry.year, households: entry.households };
  }
  return { year: null, households: [] };
}

const STATIC_FILE_OPTIONS = {
  // A missing file resolves to null; network and server errors retry twice.
  retry: 2,
  retryDelay: (attempt: number) => Math.min(300 * 2 ** attempt, 2000),
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
} as const;

/** The registry, for components that prefer a hook. It is static. */
export function useMeasures() {
  return REGISTRY;
}

/** A results CSV (all measures); data is null when the file is missing. */
export function useResultsCsv(filename: string, enabled = true) {
  return useQuery<CsvRow[] | null>({
    queryKey: ['csv', DATA_DIR, filename],
    queryFn: () => fetchCsvOrNull(filename),
    enabled,
    ...STATIC_FILE_OPTIONS,
  });
}

/** One measure-year's metrics.csv values; data is null when missing. */
export function useMetrics(slug: string, year: number) {
  const query = useResultsCsv(STATEWIDE_FILES.metrics);
  const data = useMemo(
    () => (query.data ? metricsFor(query.data, slug, year) : null),
    [query.data, slug, year],
  );
  return { ...query, data };
}

/** Every measure's headline metrics (for the landing page); null when metrics.csv is missing. */
export function useAllMetrics() {
  return useResultsCsv(STATEWIDE_FILES.metrics);
}

async function fetchStatewideFiles(): Promise<StatewideFiles> {
  const keys = Object.keys(STATEWIDE_FILES) as StatewideFileKey[];
  const results = await Promise.all(keys.map((key) => fetchCsvOrNull(STATEWIDE_FILES[key])));
  return Object.fromEntries(keys.map((key, i) => [key, results[i]])) as StatewideFiles;
}

/** All statewide CSVs, fetched once and shared by every measure and year. */
export function useStatewideFiles(enabled = true) {
  return useQuery<StatewideFiles>({
    queryKey: ['statewide', DATA_DIR],
    queryFn: fetchStatewideFiles,
    enabled,
    ...STATIC_FILE_OPTIONS,
  });
}

/** One measure-year's statewide results; data is null when not yet available. */
export function useStatewideResults(slug: string, year: number) {
  const query = useStatewideFiles();
  const measure = MEASURES_BY_SLUG[slug];
  const data: StatewideResults | null = useMemo(
    () =>
      query.data
        ? buildStatewide(
            query.data,
            slug,
            year,
            (measure?.income_bands ?? []).map((b) => b.label),
          )
        : null,
    [query.data, slug, year, measure],
  );
  return { ...query, data };
}

/** One measure-year's congressional districts; data is null when the file is missing. */
export function useDistrictResults(slug: string, year: number) {
  const query = useResultsCsv(DISTRICTS_FILE);
  const measure = MEASURES_BY_SLUG[slug];
  const data: DistrictRow[] | null = useMemo(
    () => (query.data && measure ? buildDistricts(query.data, slug, year, measure.state) : null),
    [query.data, slug, year, measure],
  );
  return { ...query, data };
}

export function isManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Manifest>;
  return typeof v.pin === 'string' && typeof v.dataset_revision === 'string';
}

/** manifest.json; data is null when missing. */
export function useManifest() {
  return useQuery<Manifest | null>({
    queryKey: ['json', DATA_DIR, 'manifest.json'],
    queryFn: async () => {
      const payload = await fetchJsonOrNull<unknown>('manifest.json');
      return isManifest(payload) ? payload : null;
    },
    ...STATIC_FILE_OPTIONS,
  });
}

export function isExampleHouseholdsPayload(value: unknown): value is ExampleHouseholdsPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ExampleHouseholdsPayload>;
  return !!v.measures && typeof v.measures === 'object' && !Array.isArray(v.measures);
}

/** example_households.json; data is null when missing or in an older format. */
export function useExampleHouseholdsFile() {
  return useQuery<ExampleHouseholdsPayload | null>({
    queryKey: ['json', DATA_DIR, 'example_households.json'],
    queryFn: async () => {
      const payload = await fetchJsonOrNull<unknown>('example_households.json');
      return isExampleHouseholdsPayload(payload) ? payload : null;
    },
    ...STATIC_FILE_OPTIONS,
  });
}

/** One measure's example households for a tax year (empty when unavailable). */
export function useExampleHouseholds(slug: string, year?: number | null) {
  const query = useExampleHouseholdsFile();
  const selected = useMemo(() => examplesFor(query.data, slug, year), [query.data, slug, year]);
  return { ...query, year: selected.year, households: selected.households };
}
