import { stringify, parse, type ParsedUrlQuery } from 'querystring';
import { beforeAll, describe, expect, it } from 'vitest';
import type { NextConfig } from 'next';
// Next's own route compilation and matching, so these tests resolve redirects
// the way the Next router does (Vercel serves the same compiled regexes and
// has-conditions).
import loadCustomRoutes, { type Redirect } from 'next/dist/lib/load-custom-routes';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { matchHas, prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import nextConfig from '../next.config.js';
import { DEFAULT_BASE_PATH, SITE_URL } from '../lib/config';

const PRODUCTION_HOST = 'ballot-measures-2026.vercel.app';
const PUBLIC_ORIGIN = 'https://www.policyengine.org';
const config = nextConfig as NextConfig;
const basePath = config.basePath ?? '';

type Resolved = { status: number; location: URL } | null;
// loadCustomRoutes also returns Next's own trailing-slash redirects, marked internal.
type LoadedRedirect = Redirect & { internal?: boolean };
type Route = LoadedRedirect & { match: ReturnType<typeof getPathMatch> };

let routes: Route[];

beforeAll(async () => {
  const restricted = [`${basePath}/_next`];
  routes = ((await loadCustomRoutes(config)).redirects as LoadedRedirect[]).map((route) => ({
    ...route,
    match: getPathMatch(route.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex) => (route.internal ? regex : modifyRouteRegex(regex, restricted)),
    }),
  }));
});

/** The first redirect a request to `url` gets, given the x-forwarded-host Vercel sets. */
function resolve(url: string, forwardedHost: string): Resolved {
  const requested = new URL(url);
  const query = parse(requested.search.slice(1));
  const req = { headers: { host: requested.host, 'x-forwarded-host': forwardedHost } };
  for (const route of routes) {
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

/** Follows redirects from `url` as a browser would, with Vercel's x-forwarded-host on each hop. */
function follow(url: string, forwardedHostFor: (host: string) => string): { url: URL; hops: number } {
  let current = new URL(url);
  for (let hops = 0; hops < 10; hops++) {
    if (current.origin === PUBLIC_ORIGIN) return { url: current, hops };
    const next = resolve(current.href, forwardedHostFor(current.host));
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
    const resolved = resolve(
      direct(`${basePath}/ca-prop-40?utm_source=newsletter&utm_medium=email&tab=household&tab=statewide`),
      PRODUCTION_HOST,
    );
    expect(resolved!.location.origin + resolved!.location.pathname).toBe(`${PUBLIC_ORIGIN}${basePath}/ca-prop-40`);
    expect(pairs(resolved!.location.search)).toEqual(
      pairs('utm_source=newsletter&utm_medium=email&tab=household&tab=statewide'),
    );
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
    // Near misses the dot-escaped, anchored match must reject.
    'ballot-measures-2026Xvercel.app',
    'xballot-measures-2026.vercel.app',
    'ballot-measures-2026.vercel.app.evil.example',
    'localhost:3010',
  ];

  it('leave policyengine.org, previews and other hosts on the page', () => {
    for (const host of OTHER_HOSTS) {
      for (const suffix of [...NEWSLETTER_PATHS, '/ca-prop-40', '/data/manifest.json']) {
        expect(resolve(direct(`${basePath}${suffix}`), host), `${host} ${suffix}`).toBeNull();
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
    .filter((segment) => !/^\.+$/.test(segment));
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
      if (suffix.startsWith('/_next')) {
        // Next keeps its own assets out of custom redirects.
        expect(resolved, label).toBeNull();
        continue;
      }
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

  it('has its own rule for the bare basePath, ahead of /:path*', async () => {
    // Next's router sends the bare basePath through /:path* without a trailing
    // slash, but Vercel's routing adds one (seen on a test deployment,
    // 2026-10-29), which costs policyengine.org a second hop. The tests above
    // run Next's router, so this pins the rule Vercel needs.
    const custom = (await config.redirects!()).filter((r) => r.basePath !== false);
    const bare = custom.findIndex((r) => r.source === '/' && r.destination === `${PUBLIC_ORIGIN}${basePath}`);
    const deep = custom.findIndex((r) => r.source === '/:path*');
    expect(bare).toBeGreaterThanOrEqual(0);
    expect(bare).toBeLessThan(deep);
  });
});
