import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductionData } from '../lib/config';

describe('assertProductionData', () => {
  it('stops a production deployment that reads fixture data', () => {
    expect(() => assertProductionData('production', 'data-fixtures')).toThrow(/production must read/);
  });

  it('allows the pipeline data in production and fixtures elsewhere', () => {
    expect(() => assertProductionData('production', 'data')).not.toThrow();
    expect(() => assertProductionData('preview', 'data-fixtures')).not.toThrow();
    expect(() => assertProductionData(undefined, 'data-fixtures')).not.toThrow();
  });
});

describe('robots and sitemap', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('disallow crawling and list nothing outside production', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.resetModules();
    const robots = (await import('../app/robots')).default();
    expect(robots.rules).toEqual({ userAgent: '*', disallow: '/' });
    expect(robots.sitemap).toBeUndefined();
    expect((await import('../app/sitemap')).default()).toEqual([]);
  });

  it('allow crawling and list every page in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_DATA_DIR', 'data');
    vi.resetModules();
    const robots = (await import('../app/robots')).default();
    expect(robots.rules).toEqual({ userAgent: '*', allow: '/' });
    expect(robots.sitemap).toBe('https://policyengine.org/us/ballot-measures-2026/sitemap.xml');
    const pages = (await import('../app/sitemap')).default();
    // The landing page, six measure pages and the Proposition 40 calculator page.
    expect(pages).toHaveLength(8);
    expect(pages.map((p) => p.url)).toContain('https://policyengine.org/us/ballot-measures-2026/ca-prop-40');
  });

  it('refuses to load in production with fixture data', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_DATA_DIR', 'data-fixtures');
    vi.resetModules();
    await expect(import('../lib/config')).rejects.toThrow(/NEXT_PUBLIC_DATA_DIR is "data-fixtures"/);
  });
});

describe('share image', () => {
  it('is the 1200x630 landing map in public/, at an absolute URL under the dashboard', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const { OG_IMAGE, SITE_URL } = await import('../lib/config');
    expect(OG_IMAGE.url).toBe(`${SITE_URL}/og-image.png`);
    const png = readFileSync(join(__dirname, '..', 'public', 'og-image.png'));
    // PNG IHDR: width and height, big-endian, at bytes 16 and 20
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
    expect([OG_IMAGE.width, OG_IMAGE.height]).toEqual([1200, 630]);
  });
});
