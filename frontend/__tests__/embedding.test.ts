import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHashString, notifyParent, parseHashParams, parseTab, updateHash } from '../lib/embedding';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseHashParams', () => {
  it('reads the measure, year and tab', () => {
    expect(parseHashParams('#measure=wa-i-645&year=2029&tab=statewide')).toEqual({
      measure: 'wa-i-645',
      year: 2029,
      tab: 'statewide',
    });
  });

  it('accepts the older validation tab name and ignores unknown tabs', () => {
    expect(parseHashParams('tab=validation').tab).toBe('validation');
    // Older and NJ-style tab names still open the right tab.
    expect(parseHashParams('tab=methodology').tab).toBe('validation');
    expect(parseHashParams('tab=policy').tab).toBe('overview');
    expect(parseHashParams('tab=impact').tab).toBe('household');
    expect(parseHashParams('tab=aggregate').tab).toBe('statewide');
    expect(parseHashParams('tab=everything').tab).toBeUndefined();
    expect(parseTab('Districts')).toBe('districts');
  });

  it('ignores malformed years and measures', () => {
    expect(parseHashParams('#year=20x9&measure=<script>')).toEqual({});
  });

  it('reads household inputs', () => {
    expect(parseHashParams('#income=50000&age=40&married=true&dependents=4, 9')).toEqual({
      income: 50000,
      age: 40,
      married: true,
      dependents: [4, 9],
    });
  });

  it('returns nothing for an empty hash', () => {
    expect(parseHashParams('')).toEqual({});
    expect(parseHashParams('#')).toEqual({});
  });
});

describe('buildHashString', () => {
  it('round-trips through parseHashParams', () => {
    const params = { measure: 'co-prop-nn', year: 2028, tab: 'household' as const, income: 40000 };
    expect(parseHashParams(buildHashString(params))).toEqual(params);
  });

  it('omits unset values', () => {
    expect(buildHashString({ tab: 'districts' })).toBe('tab=districts');
    expect(buildHashString({})).toBe('');
  });
});

describe('updateHash', () => {
  it('replaces the hash without adding history and keeps the path', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const lengthBefore = window.history.length;
    updateHash({ tab: 'statewide', year: 2029 });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][2]).toBe(
      `${window.location.pathname}${window.location.search}#year=2029&tab=statewide`,
    );
    expect(window.location.hash).toBe('#year=2029&tab=statewide');
    expect(window.history.length).toBe(lengthBefore);
  });

  it('tells an embedding parent about the change', () => {
    const postMessage = vi.fn();
    const parent = vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage } as unknown as Window);
    notifyParent('#tab=statewide');
    expect(postMessage).toHaveBeenCalledWith({ type: 'hashchange', hash: 'tab=statewide' }, '*');
    expect(postMessage).toHaveBeenCalledWith({ type: 'pathchange', path: '/tab=statewide' }, '*');
    parent.mockRestore();
  });
});
