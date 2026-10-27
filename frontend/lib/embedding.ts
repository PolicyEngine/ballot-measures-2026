/**
 * Embedding utilities for iframe integration with policyengine.org
 *
 * This module provides:
 * 1. Hash-based parameter parsing (e.g., #measure=wa-i-645&year=2029&tab=statewide)
 * 2. hashchange event listener support to respond to URL changes
 * 3. postMessage communication to sync state with the parent frame
 */

export const TAB_IDS = ['overview', 'household', 'statewide', 'districts', 'validation'] as const;
export type TabId = (typeof TAB_IDS)[number];

/**
 * Other names that still open a tab: the methods tab's earlier id
 * (`tab=methodology`) and the NJ dashboard's ids.
 */
const TAB_ALIASES: Record<string, TabId> = {
  methodology: 'validation',
  policy: 'overview',
  impact: 'household',
  aggregate: 'statewide',
};

export interface HashParams {
  country?: string;
  /** Measure slug, e.g. "wa-i-645". */
  measure?: string;
  /** Tax year shown on the statewide and district tabs. */
  year?: number;
  tab?: TabId;
  income?: number;
  age?: number;
  married?: boolean;
  dependents?: number[];
}

export function parseTab(value: string | null | undefined): TabId | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if ((TAB_IDS as readonly string[]).includes(v)) return v as TabId;
  return TAB_ALIASES[v];
}

/**
 * Parse hash parameters from URL hash string
 * @param hash - The URL hash string (with or without leading #)
 * @returns Parsed parameters object
 */
export function parseHashParams(hash: string = ''): HashParams {
  const hashString = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!hashString) return {};

  const params: HashParams = {};
  const searchParams = new URLSearchParams(hashString);

  const country = searchParams.get('country');
  if (country) params.country = country;

  const measure = searchParams.get('measure');
  if (measure && /^[a-z0-9-]+$/i.test(measure.trim())) params.measure = measure.trim().toLowerCase();

  const year = searchParams.get('year');
  if (year && /^\d{4}$/.test(year.trim())) params.year = parseInt(year, 10);

  const tab = parseTab(searchParams.get('tab'));
  if (tab) params.tab = tab;

  const income = searchParams.get('income');
  if (income) {
    const parsed = parseInt(income, 10);
    if (!isNaN(parsed)) params.income = parsed;
  }

  const age = searchParams.get('age');
  if (age) {
    const parsed = parseInt(age, 10);
    if (!isNaN(parsed)) params.age = parsed;
  }

  const married = searchParams.get('married');
  if (married) params.married = married === 'true' || married === '1';

  const dependents = searchParams.get('dependents');
  if (dependents) {
    const ages = dependents
      .split(',')
      .map((d) => parseInt(d.trim(), 10))
      .filter((n) => !isNaN(n));
    if (ages.length > 0) params.dependents = ages;
  }

  return params;
}

/**
 * Get the country from the URL hash
 * @returns The country code (defaults to 'us')
 */
export function getCountryFromHash(): string {
  if (typeof window === 'undefined') return 'us';
  const params = parseHashParams(window.location.hash);
  return params.country || 'us';
}

/**
 * Build a hash string from parameters
 * @param params - Parameters to encode
 * @returns Hash string (without leading #)
 */
export function buildHashString(params: HashParams): string {
  const searchParams = new URLSearchParams();

  if (params.country) searchParams.set('country', params.country);
  if (params.measure) searchParams.set('measure', params.measure);
  if (params.year !== undefined) searchParams.set('year', String(params.year));
  if (params.tab) searchParams.set('tab', params.tab);
  if (params.income !== undefined) searchParams.set('income', String(params.income));
  if (params.age !== undefined) searchParams.set('age', String(params.age));
  if (params.married !== undefined) searchParams.set('married', String(params.married));
  if (params.dependents && params.dependents.length > 0) {
    searchParams.set('dependents', params.dependents.join(','));
  }

  return searchParams.toString();
}

/**
 * Update the URL hash without triggering a page reload
 * @param params - Parameters to set in the hash
 */
export function updateHash(params: HashParams): void {
  if (typeof window === 'undefined') return;
  const hashString = buildHashString(params);
  const newHash = hashString ? `#${hashString}` : '';
  if (window.location.hash !== newHash) {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}${newHash}`,
    );
    notifyParent(newHash);
  }
}

/**
 * Notify the parent frame of a hash change via postMessage
 * @param hash - The new hash string
 */
export function notifyParent(hash: string): void {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return; // Not in an iframe

  const hashWithoutPrefix = hash.startsWith('#') ? hash.slice(1) : hash;

  // Send hashchange message for compatibility with IframeContent component
  window.parent.postMessage({ type: 'hashchange', hash: hashWithoutPrefix }, '*');

  // Also send pathchange for alternative routing patterns
  window.parent.postMessage(
    { type: 'pathchange', path: hashWithoutPrefix ? `/${hashWithoutPrefix}` : '/' },
    '*',
  );
}

/**
 * Check if the app is running inside an iframe
 * @returns true if embedded in an iframe
 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return window.parent !== window;
}

/**
 * Send a message to the parent frame
 * @param type - Message type
 * @param data - Additional data to include
 */
export function sendMessageToParent(type: string, data: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!isEmbedded()) return;

  window.parent.postMessage({ type, ...data }, '*');
}

/**
 * Notify parent that the dashboard is ready
 */
export function notifyReady(): void {
  sendMessageToParent('ready', { source: 'ballot-measures-2026' });
}

/**
 * Notify parent of a state change
 * @param state - Current state to sync
 */
export function syncStateWithParent(state: HashParams): void {
  sendMessageToParent('statechange', { state });
}
