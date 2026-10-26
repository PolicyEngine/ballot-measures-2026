import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HouseholdApiError,
  calculateHousehold,
  fetchHealth,
  formatErrorDetail,
  isHouseholdResponse,
  requestBody,
  type HouseholdRequest,
  type HouseholdResponse,
} from '../lib/householdApi';
import { HOUSEHOLD_API_URL } from '../lib/config';
import { fixtureResponse } from './testUtils';

const RESPONSE: HouseholdResponse = fixtureResponse('wa-i-645', 1, 2028);

const REQUEST: HouseholdRequest = {
  measure: 'wa-i-645',
  year: 2028,
  age_head: 50,
  married: false,
  age_spouse: 48,
  spouse_income: 10,
  income: 1_500_000,
  dependents: [{ age: 9 }],
};

const respond = (status: number, body: unknown) =>
  vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response),
  );

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requestBody', () => {
  it('drops spouse fields for a single filer', () => {
    expect(requestBody(REQUEST)).toEqual({
      measure: 'wa-i-645',
      year: 2028,
      age_head: 50,
      married: false,
      income: 1_500_000,
      dependents: [{ age: 9 }],
    });
  });

  it('keeps them for a married couple', () => {
    expect(requestBody({ ...REQUEST, married: true })).toMatchObject({ age_spouse: 48, spouse_income: 10 });
  });
});

describe('calculateHousehold', () => {
  it('posts the request to /calculate and returns the response', async () => {
    const fetchMock = respond(200, RESPONSE);
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await calculateHousehold(REQUEST);
    expect(result.at_income.reform.net_income).toBe(RESPONSE.at_income.reform.net_income);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${HOUSEHOLD_API_URL}/calculate`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(requestBody(REQUEST));
  });

  it('raises a validation error on 422 with the endpoint’s message', async () => {
    global.fetch = respond(422, { detail: 'income must be between 0 and 100,000,000' }) as unknown as typeof fetch;
    const error = await calculateHousehold(REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(HouseholdApiError);
    expect(error.kind).toBe('validation');
    expect(error.message).toMatch(/income must be between/);
  });

  it('raises a server error on 500 and on an unexpected body', async () => {
    global.fetch = respond(500, { detail: 'boom' }) as unknown as typeof fetch;
    await expect(calculateHousehold(REQUEST)).rejects.toMatchObject({ kind: 'server', status: 500 });
    global.fetch = respond(200, { hello: 'world' }) as unknown as typeof fetch;
    await expect(calculateHousehold(REQUEST)).rejects.toMatchObject({ kind: 'server' });
  });

  it('raises a network error when the endpoint is unreachable', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    await expect(calculateHousehold(REQUEST)).rejects.toMatchObject({ kind: 'network' });
  });

  it('times out', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const pending = calculateHousehold(REQUEST, { timeoutMs: 1000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    const error = await pending;
    expect(error).toBeInstanceOf(HouseholdApiError);
    expect(error.kind).toBe('timeout');
  });
});

describe('isHouseholdResponse', () => {
  it('accepts the fixture response and rejects partial ones', () => {
    expect(isHouseholdResponse(RESPONSE)).toBe(true);
    expect(isHouseholdResponse({ ...RESPONSE, sweep: { baseline: RESPONSE.sweep.baseline } })).toBe(false);
    expect(
      isHouseholdResponse({
        ...RESPONSE,
        sweep: { ...RESPONSE.sweep, reform: { ...RESPONSE.sweep.reform, net_income: [1] } },
      }),
    ).toBe(false);
    expect(isHouseholdResponse(null)).toBe(false);
  });
});

describe('formatErrorDetail', () => {
  it('reads FastAPI error bodies', () => {
    expect(formatErrorDetail({ detail: 'bad age' })).toBe('bad age');
    expect(formatErrorDetail({ detail: [{ loc: ['body', 'income'], msg: 'field required' }] })).toBe(
      'income: field required',
    );
    expect(formatErrorDetail(null)).toBeNull();
  });
});

describe('fetchHealth', () => {
  it('returns the pin and measures, or null when unhealthy', async () => {
    global.fetch = respond(200, { status: 'ok', pin: 'policyengine-us==2.60.4', measures: ['wa-i-645'] }) as unknown as typeof fetch;
    expect(await fetchHealth()).toEqual({ status: 'ok', pin: 'policyengine-us==2.60.4', measures: ['wa-i-645'] });
    global.fetch = respond(503, {}) as unknown as typeof fetch;
    expect(await fetchHealth()).toBeNull();
  });
});
