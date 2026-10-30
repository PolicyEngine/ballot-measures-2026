/** @type {import('next').NextConfig} */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config file
const path = require('path');

// Use empty string for local dev (NEXT_PUBLIC_BASE_PATH=""), otherwise default to production path
const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
  ? process.env.NEXT_PUBLIC_BASE_PATH
  : "/us/ballot-measures-2026";

// policyengine.org serves this app at the same path: policyengine-app-v2's
// website/src/data/appZoneRoutes.ts rewrites /us/ballot-measures-2026 to
// PRODUCTION_HOST. The redirects below send visits straight to
// PRODUCTION_HOST (links shared before the route went live) there instead,
// path and query kept.
const PUBLIC_URL = "https://www.policyengine.org/us/ballot-measures-2026";
const PRODUCTION_HOST = "ballot-measures-2026.vercel.app";

// Vercel sets x-forwarded-host to the host the visitor asked for, and
// overwrites any value the visitor sends: PRODUCTION_HOST on a direct visit,
// www.policyengine.org on a request policyengine.org proxies. Matching
// PRODUCTION_HOST, rather than excluding policyengine.org, leaves previews
// and policyengine-app-v2's preview deployments (which proxy to this same
// host) unredirected.
//
// That relies on policyengine.org reaching this app through a Vercel rewrite
// that keeps www.policyengine.org in x-forwarded-host, as one did on a test
// deployment (2026-10-29, both projects in PolicyEngine's Vercel team). A
// proxy that forwarded PRODUCTION_HOST there instead would get the 308 back
// and loop. Other paths in, such as another Vercel team or a proxy outside
// Vercel, weren't tried, so after any change to how policyengine.org reaches
// this app, check that PUBLIC_URL still answers 200 (README, Deploy).
const directVisit = [
  { type: "header", key: "x-forwarded-host", value: PRODUCTION_HOST.replace(/\./g, "\\.") },
];

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  // Set the output file tracing root to this project's frontend directory
  // to avoid issues with lockfiles in parent directories
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      // The host's root, outside the basePath, would otherwise 404.
      { source: "/", basePath: false, has: directVisit, destination: PUBLIC_URL, permanent: true },
      // The bare basePath, which /:path* would send to PUBLIC_URL + "/".
      { source: "/", has: directVisit, destination: PUBLIC_URL, permanent: true },
      { source: "/:path*", has: directVisit, destination: `${PUBLIC_URL}/:path*`, permanent: true },
    ];
  },
};

module.exports = nextConfig;
