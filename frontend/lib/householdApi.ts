/**
 * Client for the household calculator (scripts/modal_household_api.py):
 * POST {HOUSEHOLD_API_URL}/calculate and GET {HOUSEHOLD_API_URL}/health.
 *
 * The endpoint runs the same pinned policyengine-us release as the
 * statewide results. It returns levels under current law ("baseline") and
 * if the measure passes ("reform"), across an earnings sweep and at the
 * entered income; the UI computes every change as reform − baseline.
 * Requests take seconds on a warm container and can take 1-2 minutes on a
 * cold start, hence the 180-second timeout.
 */

import { HOUSEHOLD_API_URL, HOUSEHOLD_TIMEOUT_MS } from './config';

// ── Request ─────────────────────────────────────────────────────────────

export interface DependentInput {
  age: number;
}

export interface HouseholdRequest {
  measure: string;
  year: number;
  /** 18..110 */
  age_head: number;
  married: boolean;
  /** Present when married. */
  age_spouse?: number | null;
  /** Spouse's employment income (fixed, not swept). */
  spouse_income?: number;
  /** Head's employment income (non-negative). */
  income: number;
  dependents: DependentInput[];
}

// ── Response ────────────────────────────────────────────────────────────

/** Kind-specific outputs, in addition to the core three (ballot_calc/household.py KIND_OUTPUTS). */
export const KIND_OUTPUT_KEYS = {
  income_tax: [],
  tabor_refund: ['refund'],
  school_meals: ['meal_value', 'free_meals', 'reduced_price_meals'],
  medicaid: ['medicaid', 'ptc', 'medicaid_enrolled', 'marketplace_premium'],
} as const;

/** One policy's values at the entered income, summed over the household. */
export interface PolicyPoint {
  /** household_net_income */
  net_income: number;
  /** The state's income tax after refundable credits. */
  state_tax: number;
  /** Federal income tax. */
  federal_tax: number;
  // tabor_refund
  /** Colorado six-tier sales tax refund. */
  refund?: number;
  // school_meals
  /** Value of free and reduced-price meals above the paid-meal subsidy. */
  meal_value?: number;
  /** The part of meal_value served free. */
  free_meals?: number;
  /** The part of meal_value served at the reduced price. */
  reduced_price_meals?: number;
  // medicaid
  /** Value of Medicaid coverage (per-enrollee cost). */
  medicaid?: number;
  /** Premium tax credit. */
  ptc?: number;
  /** People enrolled in Medicaid. */
  medicaid_enrolled?: number;
  /** Marketplace premium after the credit. */
  marketplace_premium?: number;
}

/** One policy's values across the earnings sweep (same keys, arrays). */
export type PolicySweep = { [K in keyof PolicyPoint]: number[] };

export type PolicyName = 'baseline' | 'reform';

export interface HouseholdResponse {
  measure: string;
  year: number;
  state: string;
  pin: string;
  /** Measure kind (present in current API responses). */
  kind?: string;
  /** The entered income. */
  income?: number;
  /** Federal filing status at the entered income, e.g. "JOINT". */
  filing_status?: string;
  /** Head employment income on the sweep grid. */
  income_range: number[];
  /** Index of the entered income in `income_range` (null when off-grid). */
  income_index: number | null;
  sweep: Record<PolicyName, PolicySweep>;
  at_income: Record<PolicyName, PolicyPoint>;
}

export interface HealthResponse {
  status: string;
  pin: string;
  measures: string[];
}

const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number');

const isPoint = (v: unknown): v is PolicyPoint =>
  !!v &&
  typeof v === 'object' &&
  ['net_income', 'state_tax', 'federal_tax'].every(
    (k) => typeof (v as Record<string, unknown>)[k] === 'number',
  );

const isSweep = (v: unknown, length: number): v is PolicySweep =>
  !!v &&
  typeof v === 'object' &&
  ['net_income', 'state_tax', 'federal_tax'].every((k) => {
    const arr = (v as Record<string, unknown>)[k];
    return isNumberArray(arr) && arr.length === length;
  });

export function isHouseholdResponse(value: unknown): value is HouseholdResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<HouseholdResponse>;
  if (!isNumberArray(v.income_range) || v.income_range.length === 0) return false;
  const n = v.income_range.length;
  return (
    isSweep(v.sweep?.baseline, n) &&
    isSweep(v.sweep?.reform, n) &&
    isPoint(v.at_income?.baseline) &&
    isPoint(v.at_income?.reform)
  );
}

// ── Errors ──────────────────────────────────────────────────────────────

export type HouseholdApiErrorKind = 'validation' | 'timeout' | 'network' | 'server';

export class HouseholdApiError extends Error {
  kind: HouseholdApiErrorKind;
  status: number | null;
  detail: string | null;

  constructor(
    kind: HouseholdApiErrorKind,
    message: string,
    status: number | null = null,
    detail: string | null = null,
  ) {
    super(message);
    this.name = 'HouseholdApiError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

/** Turn a FastAPI error body into readable text. `detail` is a string for
 *  the endpoint's own 422s and a list of {loc, msg} for schema errors. */
export function formatErrorDetail(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === 'string') return body.trim() || null;
  if (typeof body !== 'object') return String(body);
  const detail = (body as { detail?: unknown }).detail;
  if (detail == null) return null;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (d && typeof d === 'object') {
          const item = d as { loc?: unknown[]; msg?: string };
          const loc = Array.isArray(item.loc) ? item.loc.filter((p) => p !== 'body').join('.') : '';
          return loc ? `${loc}: ${item.msg ?? ''}`.trim() : (item.msg ?? JSON.stringify(d));
        }
        return String(d);
      })
      .join('; ');
  }
  return JSON.stringify(detail);
}

// ── Calls ───────────────────────────────────────────────────────────────

export interface CalculateOptions {
  /** Abort signal from the caller (e.g. react-query). */
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
}

/** The request body the endpoint expects (no spouse fields when single). */
export function requestBody(request: HouseholdRequest): HouseholdRequest {
  const body: HouseholdRequest = {
    measure: request.measure,
    year: request.year,
    age_head: request.age_head,
    married: request.married,
    income: request.income,
    dependents: request.dependents.map((d) => ({ age: d.age })),
  };
  if (request.married) {
    body.age_spouse = request.age_spouse ?? null;
    body.spouse_income = request.spouse_income ?? 0;
  }
  return body;
}

export async function calculateHousehold(
  request: HouseholdRequest,
  options: CalculateOptions = {},
): Promise<HouseholdResponse> {
  const { signal, timeoutMs = HOUSEHOLD_TIMEOUT_MS, baseUrl = HOUSEHOLD_API_URL } = options;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody(request)),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new HouseholdApiError(
        'timeout',
        `The household calculator did not respond within ${Math.round(
          timeoutMs / 1000,
        )} seconds. Try again: a server that has just started usually answers the next request within seconds.`,
      );
    }
    if (signal?.aborted) throw err;
    throw new HouseholdApiError(
      'network',
      'Could not reach the household calculator. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const detail = formatErrorDetail(body);
    if (response.status === 422) {
      throw new HouseholdApiError(
        'validation',
        `The calculator rejected these inputs: ${detail ?? 'invalid request'}`,
        422,
        detail,
      );
    }
    throw new HouseholdApiError(
      'server',
      `The household calculator returned an error (HTTP ${response.status})${
        detail ? `: ${detail}` : ''
      }.`,
      response.status,
      detail,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!isHouseholdResponse(json)) {
    throw new HouseholdApiError(
      'server',
      'The household calculator returned an unexpected response.',
      response.status,
    );
  }
  return json;
}

/** GET /health; null when the endpoint is unreachable or unhealthy. */
export async function fetchHealth(
  options: { baseUrl?: string; signal?: AbortSignal } = {},
): Promise<HealthResponse | null> {
  const { baseUrl = HOUSEHOLD_API_URL, signal } = options;
  try {
    const res = await fetch(`${baseUrl}/health`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<HealthResponse>;
    return typeof json.status === 'string' && typeof json.pin === 'string'
      ? { status: json.status, pin: json.pin, measures: json.measures ?? [] }
      : null;
  } catch {
    return null;
  }
}
