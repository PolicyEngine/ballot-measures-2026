import { createRequire } from 'module';
import { stringify, parse, type ParsedUrlQuery } from 'querystring';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextConfig } from 'next';
// Next's own route compilation and matching, so `resolve` below handles
// redirects the way the Next router does. Vercel runs the same rules through
// routes of its own, which `resolveOnVercel` models.
import loadCustomRoutes, { type Redirect } from 'next/dist/lib/load-custom-routes';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { matchHas, prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import nextConfig from '../next.config.js';
import { DEFAULT_BASE_PATH, SITE_URL } from '../lib/config';

// The expectations assume the production basePath, so a local-dev
// NEXT_PUBLIC_BASE_PATH="" (lib/config.ts) mustn't reach next.config.js,
// which reads it on import. vi.hoisted runs before the imports above.
const savedBasePath = vi.hoisted(() => {
  const saved = process.env.NEXT_PUBLIC_BASE_PATH;
  delete process.env.NEXT_PUBLIC_BASE_PATH;
  return saved;
});
afterAll(() => {
  if (savedBasePath !== undefined) process.env.NEXT_PUBLIC_BASE_PATH = savedBasePath;
});

type RoutingUtils = {
  convertRedirects: (
    redirects: Redirect[],
    defaultStatus: number,
  ) => { src: string; headers: { Location: string }; status: number }[];
};
const { convertRedirects } = createRequire(import.meta.url)(
  'next/dist/compiled/@vercel/routing-utils',
) as RoutingUtils;

const PRODUCTION_HOST = 'ballot-measures-2026.vercel.app';
const PUBLIC_ORIGIN = 'https://www.policyengine.org';
const config = nextConfig as NextConfig;
const basePath = config.basePath ?? '';

type Resolved = { status: number; location: URL } | null;
// loadCustomRoutes also returns Next's own trailing-slash redirects, marked internal.
type LoadedRedirect = Redirect & { internal?: boolean };
type Route = LoadedRedirect & { match: ReturnType<typeof getPathMatch> };

type VercelRoute = {
  src: RegExp;
  location: string;
  status: number;
  has?: Redirect['has'];
  missing?: Redirect['missing'];
};

type Tables = { routes: Route[]; vercelRoutes: VercelRoute[] };
let tables: Tables;

/** A config's redirects as Next's router and as Vercel's routes. */
async function buildTables(fromConfig: NextConfig): Promise<Tables> {
  const loaded = (await loadCustomRoutes(fromConfig)).redirects as LoadedRedirect[];
  const restricted = [`${fromConfig.basePath ?? ''}/_next`];
  const routes = loaded.map((route) => ({
    ...route,
    match: getPathMatch(route.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex) => (route.internal ? regex : modifyRouteRegex(regex, restricted)),
    }),
  }));
  // Next 16 hands Vercel each redirect as routing-utils' convertRedirects
  // builds it, passed through modifyRouteRegex with no restricted paths, so
  // without Next's /_next exclusion (next/dist/build/adapter/build-complete.js).
  // Next's own trailing-slash redirects come first. Vercel matches paths
  // case-insensitively: on a test deployment of these rules (Next 16.2.6,
  // 2026-10-29), /US/ZONE-ECHO/x 308'd to the lowercase public path.
  const vercelRoutes = loaded.map((route) => {
    const converted = convertRedirects([route], 307)[0];
    return {
      src: new RegExp(route.internal ? converted.src : modifyRouteRegex(converted.src), 'i'),
      location: converted.headers.Location,
      status: converted.status,
      has: route.has,
      missing: route.missing,
    };
  });
  return { routes, vercelRoutes };
}

beforeAll(async () => {
  tables = await buildTables(config);
});

/**
 * The request headers the rules can see: Vercel sets x-forwarded-host and
 * x-forwarded-proto on each request (both seen on a test deployment,
 * 2026-10-29, x-forwarded-proto as https), so a rule that tests either is
 * judged as it would be there.
 */
function requestHeaders(url: URL, forwardedHost: string): Record<string, string> {
  return { host: url.host, 'x-forwarded-host': forwardedHost, 'x-forwarded-proto': 'https' };
}

/** The first redirect a request to `url` gets, given the x-forwarded-host Vercel sets. */
function resolve(url: string, forwardedHost: string, from: Tables = tables): Resolved {
  const requested = new URL(url);
  const query = parse(requested.search.slice(1));
  const req = { headers: requestHeaders(requested, forwardedHost) };
  for (const route of from.routes) {
    const params = route.match(requested.pathname);
    if (!params) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matchHas reads only req.headers
    const hasParams = matchHas(req as any, query, route.has, route.missing);
    if (!hasParams) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: route.destination,
      params: { ...params, ...hasParams },
      query,
    });
    const location = new URL(
      parsedDestination.hostname
        ? `${parsedDestination.protocol}//${parsedDestination.hostname}${parsedDestination.pathname}`
        : `${requested.origin}${parsedDestination.pathname}`,
    );
    location.search = stringify(parsedDestination.query as ParsedUrlQuery);
    return { status: route.statusCode ?? (route.permanent ? 308 : 307), location };
  }
  return null;
}

/**
 * Whether a request meets one `has` or `missing` condition, as Next's
 * matchHas judges it: an absent or empty header never meets it, an absent or
 * empty value only asks for the header, and any other value is wrapped in
 * `^…$` without a group. So `https|http` anchors only its ends; the escaped
 * literal host these rules use has to match the whole header. Vercel
 * overwrites x-forwarded-host, so whether its edge anchors the same way
 * couldn't be tried there, nor how it treats an empty value. Condition types
 * these rules don't use throw, so a rule that adds one has to extend the
 * model first.
 */
function meetsCondition(condition: NonNullable<Redirect['has']>[number], headers: Record<string, string>) {
  if (condition.type !== 'header') throw new Error(`the Vercel model doesn't handle ${condition.type} conditions`);
  const header = headers[condition.key.toLowerCase()];
  if (!header) return false;
  return !condition.value || new RegExp(`^${condition.value}$`).test(header);
}

/**
 * The first redirect a request to `url` gets from Vercel's routes: every
 * `has` condition met, no `missing` one, and the request's query riding
 * along when the destination sets none.
 *
 * Both models take the URL as WHATWG URL parsing leaves it, so they don't
 * cover what Vercel's edge does before any rule: it 308s /a//b to /a/b on the
 * same host and answers an encoded NUL with 400 (both seen on the test
 * deployment).
 */
function resolveOnVercel(url: string, forwardedHost: string, from: Tables = tables): Resolved {
  const requested = new URL(url);
  const headers = requestHeaders(requested, forwardedHost);
  for (const route of from.vercelRoutes) {
    const match = route.src.exec(requested.pathname);
    if (!match) continue;
    const met =
      (route.has ?? []).every((condition) => meetsCondition(condition, headers)) &&
      !(route.missing ?? []).some((condition) => meetsCondition(condition, headers));
    if (!met) continue;
    const location = new URL(
      route.location.replace(/\$(\d)/g, (_, index) => match[Number(index)] ?? ''),
      requested,
    );
    if (!location.search) location.search = requested.search;
    return { status: route.status, location };
  }
  return null;
}

type Resolver = typeof resolve;

/** Follows redirects from `url` as a browser would, with Vercel's x-forwarded-host on each hop. */
function follow(
  url: string,
  forwardedHostFor: (host: string) => string,
  resolver: Resolver = resolve,
): { url: URL; hops: number } {
  let current = new URL(url);
  for (let hops = 0; hops < 10; hops++) {
    if (current.origin === PUBLIC_ORIGIN) return { url: current, hops };
    const next = resolver(current.href, forwardedHostFor(current.host));
    if (!next) return { url: current, hops };
    current = next.location;
  }
  throw new Error(`redirect loop from ${url}`);
}

const direct = (path: string) => `https://${PRODUCTION_HOST}${path}`;
const pairs = (search: string) => Array.from(new URLSearchParams(search), ([key, value]) => `${key}=${value}`).sort();

// The paths of the seven links the 29 October 2026 US newsletter sent.
const NEWSLETTER_PATHS = [
  '',
  '/ca-prop-3',
  '/co-amendment-87',
  '/co-prop-nn',
  '/nd-measure-2',
  '/sd-amendment-i',
  '/wa-i-645',
];

describe('direct visits to the production host', () => {
  it('308 each newsletter link to the same page on policyengine.org', () => {
    for (const suffix of NEWSLETTER_PATHS) {
      const resolved = resolve(direct(`${basePath}${suffix}`), PRODUCTION_HOST);
      expect(resolved?.status).toBe(308);
      expect(resolved?.location.href).toBe(`${PUBLIC_ORIGIN}${basePath}${suffix}`);
    }
  });

  it('keep the query, including tracking parameters and repeated keys', () => {
    for (const resolver of [resolve, resolveOnVercel]) {
      const resolved = resolver(
        direct(`${basePath}/ca-prop-40?utm_source=newsletter&utm_medium=email&tab=household&tab=statewide`),
        PRODUCTION_HOST,
      );
      expect(resolved!.location.origin + resolved!.location.pathname, resolver.name).toBe(
        `${PUBLIC_ORIGIN}${basePath}/ca-prop-40`,
      );
      expect(pairs(resolved!.location.search), resolver.name).toEqual(
        pairs('utm_source=newsletter&utm_medium=email&tab=household&tab=statewide'),
      );
    }
  });

  // What a test deployment of these rules answered (2026-10-29): the path
  // byte for byte, and the query re-serialized with the same decoded pairs.
  // Not here: an unnamed parameter. `?=val&blank=` came back `?val&blank=`,
  // so the pair ('', 'val') became ('val', ''), while both models keep it.
  const ENCODED = [
    '/a%20b',
    '/caf%C3%A9',
    '/%F0%9F%97%B3',
    '/a%2Fb',
    '/a%2520b',
    '/x?q=1+2',
    '/x?q=%3B',
    '/x?a=&b',
    '/x?flag',
    '/x?a=1&&b=2',
    '/x?q=a%26b',
  ];

  it('keep encoded paths and awkward queries, as Vercel did', () => {
    for (const resolver of [resolve, resolveOnVercel]) {
      for (const suffix of ENCODED) {
        const requested = new URL(direct(`${basePath}${suffix}`));
        const resolved = resolver(requested.href, PRODUCTION_HOST);
        const label = `${resolver.name} ${suffix}`;
        expect(resolved?.status, label).toBe(308);
        expect(resolved!.location.origin + resolved!.location.pathname, label).toBe(
          `${PUBLIC_ORIGIN}${requested.pathname}`,
        );
        expect(pairs(resolved!.location.search), label).toEqual(pairs(requested.search));
      }
    }
  });

  it('send the host root to the dashboard', () => {
    expect(resolve(direct('/'), PRODUCTION_HOST)?.location.href).toBe(`${PUBLIC_ORIGIN}${basePath}`);
  });

  it('reach policyengine.org through at most the trailing-slash hop', () => {
    for (const suffix of NEWSLETTER_PATHS) {
      const landed = follow(direct(`${basePath}${suffix}/`), (host) => host);
      expect(landed.url.href).toBe(`${PUBLIC_ORIGIN}${basePath}${suffix}`);
      expect(landed.hops).toBeLessThanOrEqual(2);
    }
  });
});

describe('requests that must not redirect', () => {
  const OTHER_HOSTS = [
    'www.policyengine.org',
    'policyengine.org',
    // policyengine-app-v2 previews proxy to the same production host.
    'policyengine-website-git-add-ballot-measures-2026-policy-engine.vercel.app',
    // This project's previews, other aliases and deployment URLs.
    'ballot-measures-2026-q7g5g0966-policy-engine.vercel.app',
    'ballot-measures-2026-policy-engine.vercel.app',
    'ballot-measures-2026-git-main-policy-engine.vercel.app',
    // Near misses the dot-escaped, whole-header match must reject.
    'ballot-measures-2026Xvercel.app',
    'xballot-measures-2026.vercel.app',
    'ballot-measures-2026.vercel.app.evil.example',
    'localhost:3010',
  ];

  it('leave policyengine.org, previews and other hosts on the page', () => {
    for (const resolver of [resolve, resolveOnVercel]) {
      for (const host of OTHER_HOSTS) {
        for (const suffix of [...NEWSLETTER_PATHS, '/ca-prop-40', '/data/manifest.json']) {
          expect(resolver(direct(`${basePath}${suffix}`), host), `${resolver.name} ${host} ${suffix}`).toBeNull();
        }
      }
    }
  });
});

// Seeded so a failure reproduces; prints the seed and the input.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEGMENT_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_.~';
const QUERY_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_';

function randomCase(random: () => number) {
  const pick = (chars: string, length: number) =>
    Array.from({ length }, () => chars[Math.floor(random() * chars.length)]).join('');
  const segments = Array.from({ length: Math.floor(random() * 4) }, () => pick(SEGMENT_CHARS, 1 + Math.floor(random() * 12)))
    // A segment of only dots is path traversal, not a page.
    .filter((segment) => !/^\.+$/.test(segment))
    // Next's router keeps /_next out of custom redirects and Vercel's routes
    // don't; a test below covers those paths on Vercel.
    .filter((segment, index) => !(index === 0 && segment === '_next'));
  const suffix = segments.map((segment) => `/${segment}`).join('');
  const search = Array.from({ length: Math.floor(random() * 4) }, () =>
    `${pick(QUERY_CHARS, 1 + Math.floor(random() * 8))}=${pick(QUERY_CHARS, Math.floor(random() * 8))}`,
  ).join('&');
  return { suffix, search };
}

describe('invariants over generated paths and queries', () => {
  const SEED = 20261029;
  const CASES = 2000;

  it('a direct visit lands on the same path and query on policyengine.org, without a loop', () => {
    const random = mulberry32(SEED);
    for (let i = 0; i < CASES; i++) {
      const { suffix, search } = randomCase(random);
      const url = direct(`${basePath}${suffix}${search ? `?${search}` : ''}`);
      const label = `seed ${SEED} case ${i}: ${url}`;
      const resolved = resolve(url, PRODUCTION_HOST);
      expect(resolved?.status, label).toBe(308);
      expect(resolved!.location.origin + resolved!.location.pathname, label).toBe(`${PUBLIC_ORIGIN}${basePath}${suffix}`);
      expect(pairs(resolved!.location.search), label).toEqual(pairs(search));
      // The destination is never this host, so a redirect can't repeat.
      expect(resolved!.location.host, label).not.toBe(PRODUCTION_HOST);
    }
  });

  it('a proxied request is never redirected off its host', () => {
    const random = mulberry32(SEED + 1);
    for (let i = 0; i < CASES; i++) {
      const { suffix, search } = randomCase(random);
      const url = direct(`${basePath}${suffix}${search ? `?${search}` : ''}`);
      expect(resolve(url, 'www.policyengine.org'), `seed ${SEED + 1} case ${i}: ${url}`).toBeNull();
    }
  });
});

describe('the redirect target', () => {
  it('serves the basePath and the canonical URL path', () => {
    expect(basePath).toBe(DEFAULT_BASE_PATH);
    expect(new URL(SITE_URL).pathname).toBe(basePath);
    const target = resolve(direct(basePath), PRODUCTION_HOST)!.location;
    expect(target.origin).toBe(PUBLIC_ORIGIN);
    expect(target.pathname).toBe(new URL(SITE_URL).pathname);
  });
});

describe("Vercel's routes for the same rules", () => {
  const SEED = 20261030;
  const CASES = 2000;
  const landing = (url: URL) => `${url.origin}${url.pathname} ${pairs(url.search).join('&')}`;

  it('send each newsletter link, the bare basePath and the host root to policyengine.org in one hop', () => {
    for (const path of ['/', ...NEWSLETTER_PATHS.map((suffix) => `${basePath}${suffix}`)]) {
      const resolved = resolveOnVercel(direct(path), PRODUCTION_HOST);
      expect(resolved?.status, path).toBe(308);
      // Without the bare-basePath rule, /:path* would send it to PUBLIC_URL + "/".
      expect(resolved?.location.href, path).toBe(`${PUBLIC_ORIGIN}${path === '/' ? basePath : path}`);
    }
  });

  it('land every generated direct visit where Next lands it, within the trailing-slash hop', () => {
    const random = mulberry32(SEED);
    for (let i = 0; i < CASES; i++) {
      const { suffix, search } = randomCase(random);
      const slash = random() < 0.3 ? '/' : '';
      const url = direct(`${basePath}${suffix}${slash}${search ? `?${search}` : ''}`);
      const label = `seed ${SEED} case ${i}: ${url}`;
      const onVercel = follow(url, (host) => host, resolveOnVercel);
      const onNext = follow(url, (host) => host);
      expect(landing(onVercel.url), label).toBe(landing(onNext.url));
      expect(onVercel.url.origin, label).toBe(PUBLIC_ORIGIN);
      expect(onVercel.hops, label).toBeLessThanOrEqual(slash ? 2 : 1);
    }
  });

  it('send direct requests for _next assets to policyengine.org, which proxies them back', () => {
    const asset = `${basePath}/_next/static/chunks/main.js?v=1`;
    expect(resolveOnVercel(direct(asset), PRODUCTION_HOST)?.location.href).toBe(`${PUBLIC_ORIGIN}${asset}`);
    expect(resolveOnVercel(direct(asset), 'www.policyengine.org')).toBeNull();
  });

  it('send an upper-case basePath to the lower-case public URL', () => {
    expect(
      resolveOnVercel(direct(`${basePath.toUpperCase()}/ca-prop-40`), PRODUCTION_HOST)?.location.href,
    ).toBe(`${PUBLIC_ORIGIN}${basePath}/ca-prop-40`);
  });

  // Each condition on one catch-all rule, judged for a direct visit by both
  // models. Next's matchHas is the reference; a rule these rules might take
  // next, such as a `missing` header, has to come out the same in both.
  const CONDITIONS: [string, Pick<Redirect, 'has' | 'missing'>, boolean][] = [
    ['no condition', {}, true],
    ['has this host', { has: [{ type: 'header', key: 'x-forwarded-host', value: 'ballot-measures-2026\\.vercel\\.app' }] }, true],
    ['has another host', { has: [{ type: 'header', key: 'x-forwarded-host', value: 'www\\.policyengine\\.org' }] }, false],
    ['has x-forwarded-proto', { has: [{ type: 'header', key: 'x-forwarded-proto' }] }, true],
    ['has x-forwarded-proto http', { has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }] }, false],
    ['missing x-forwarded-proto', { missing: [{ type: 'header', key: 'x-forwarded-proto' }] }, false],
    ['missing an absent header', { missing: [{ type: 'header', key: 'x-not-sent' }] }, true],
    ['missing the proxy host', { missing: [{ type: 'header', key: 'x-forwarded-host', value: 'www\\.policyengine\\.org' }] }, true],
    ['missing this host', { missing: [{ type: 'header', key: 'x-forwarded-host', value: 'ballot-measures-2026\\.vercel\\.app' }] }, false],
    ['has x-forwarded-proto, value empty', { has: [{ type: 'header', key: 'x-forwarded-proto', value: '' }] }, true],
    ['missing x-forwarded-proto, value empty', { missing: [{ type: 'header', key: 'x-forwarded-proto', value: '' }] }, false],
  ];

  it.each(CONDITIONS)('judge a rule with %s as Next does', async (_, condition, redirects) => {
    const from = await buildTables({
      basePath,
      async redirects() {
        return [{ source: '/:path*', destination: `${PUBLIC_ORIGIN}${basePath}/:path*`, permanent: true, ...condition }];
      },
    });
    const url = direct(`${basePath}/x`);
    expect(Boolean(resolve(url, PRODUCTION_HOST, from))).toBe(redirects);
    expect(Boolean(resolveOnVercel(url, PRODUCTION_HOST, from))).toBe(redirects);
  });

  it("meet a header condition exactly when Next's matchHas does", () => {
    const headerValues = [undefined, '', 'https', 'http', 'https-x'];
    const values = [undefined, '', 'https', 'https|http', 'http.*', 'h'];
    for (const header of headerValues) {
      for (const value of values) {
        const headers: Record<string, string> = header === undefined ? {} : { 'x-h': header };
        const condition = { type: 'header' as const, key: 'X-H', ...(value === undefined ? {} : { value }) };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matchHas reads only req.headers
        const next = Boolean(matchHas({ headers } as any, {}, [condition], []));
        expect(meetsCondition(condition, headers), `header ${header}, value ${value}`).toBe(next);
      }
    }
  });

  it('never send a proxied request off its host', () => {
    const random = mulberry32(SEED + 1);
    const hosts = ['www.policyengine.org', 'policyengine-website-git-x-policy-engine.vercel.app'];
    for (let i = 0; i < CASES; i++) {
      const { suffix, search } = randomCase(random);
      const slash = random() < 0.3 ? '/' : '';
      const url = direct(`${basePath}${suffix}${slash}${search ? `?${search}` : ''}`);
      for (const host of hosts) {
        const resolved = resolveOnVercel(url, host);
        // Next's own trailing-slash redirect stays on the host.
        if (resolved) expect(resolved.location.host, `${host} ${url}`).toBe(PRODUCTION_HOST);
      }
    }
  });
});
