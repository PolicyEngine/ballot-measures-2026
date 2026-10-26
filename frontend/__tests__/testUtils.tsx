import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { examplesFor, type ExampleHouseholdsPayload } from '../lib/measures';
import type { HouseholdResponse } from '../lib/householdApi';

export function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return {
    ...utils,
    client,
    rerender: (next: React.ReactElement) =>
      utils.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>),
  };
}

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

/** A synthetic fixture file (scripts/make-fixtures.mjs) as text. */
export const fixtureText = (name: string): string =>
  fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');

/** A synthetic fixture JSON file, parsed. */
export const fixtureJson = <T,>(name: string): T => JSON.parse(fixtureText(name)) as T;

/** A stored calculator response from the example households fixture. */
export function fixtureResponse(slug: string, index: number, year?: number): HouseholdResponse {
  const payload = fixtureJson<ExampleHouseholdsPayload>('example_households.json');
  const { households } = examplesFor(payload, slug, year);
  return households[index].response;
}

/** Every results fixture, keyed by filename. */
export const ALL_FIXTURES = [
  'metrics.csv',
  'distributional_impact.csv',
  'winners_losers.csv',
  'income_brackets.csv',
  'congressional_districts.csv',
  'manifest.json',
  'example_households.json',
];

export const fixtureFiles = (names: string[] = ALL_FIXTURES): Record<string, string> =>
  Object.fromEntries(names.map((n) => [n, fixtureText(n)]));

/** Mock fetch serving `files` (by filename suffix); everything else 404s. */
export function mockDataFiles(files: Record<string, string | object>) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(files).find((name) => url.endsWith(`/${name}`));
    if (!match) {
      return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
        json: () => Promise.reject(new Error('not json')),
      } as Response);
    }
    const body = files[match];
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      json: () =>
        typeof body === 'string' ? Promise.resolve(JSON.parse(body)) : Promise.resolve(body),
    } as Response);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}
