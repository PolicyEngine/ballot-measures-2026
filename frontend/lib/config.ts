/**
 * Dashboard-wide constants: where the app is served, where its data files
 * live, and the household calculator endpoint. Every file that builds a URL
 * imports it from here.
 */

/** Default base path; mirrors next.config.js. Set NEXT_PUBLIC_BASE_PATH=""
 *  for local development at the site root. */
export const DEFAULT_BASE_PATH = '/us/ballot-measures-2026';

export const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : DEFAULT_BASE_PATH;

/** Canonical public URL (policyengine.org serves the app through a zone rewrite). */
export const SITE_URL = 'https://policyengine.org/us/ballot-measures-2026';

/**
 * Folder under public/ that holds the microsimulation results (CSVs,
 * manifest.json and example_households.json). Defaults to `data`, the
 * pipeline's output. Previews can point it at `data-fixtures`, the synthetic
 * files the UI is built against; the dashboard then shows a "Placeholder
 * data" banner.
 */
export const DATA_DIR = (process.env.NEXT_PUBLIC_DATA_DIR || 'data').replace(/^\/+|\/+$/g, '') || 'data';

/** True when the dashboard reads anything other than the pipeline's results. */
export const USING_PLACEHOLDER_DATA = DATA_DIR !== 'data';

/** URL of a results file (frontend/public/<DATA_DIR>/<filename>). */
export const dataUrl = (filename: string): string => `${BASE_PATH}/${DATA_DIR}/${filename}`;

/** URL of a static asset in frontend/public/ that does not depend on DATA_DIR. */
export const assetUrl = (path: string): string => `${BASE_PATH}/${path.replace(/^\/+/, '')}`;

/** 119th Congress district boundaries (national file, filtered per state). */
export const DISTRICTS_GEOJSON_URL = assetUrl('data/geojson/congressional_districts.geojson');

/** Modal household calculator (scripts/modal_household_api.py). Set
 *  NEXT_PUBLIC_HOUSEHOLD_API_URL per Vercel environment (the preview app
 *  for previews, the production app for production). */
export const HOUSEHOLD_API_URL = (
  process.env.NEXT_PUBLIC_HOUSEHOLD_API_URL ??
  'https://policyengine--ballot-measures-2026-household-householdapi-web.modal.run'
).replace(/\/+$/, '');

/** Warm requests take seconds; a cold start can take 1-2 minutes. */
export const HOUSEHOLD_TIMEOUT_MS = 180_000;
