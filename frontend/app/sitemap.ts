import type { MetadataRoute } from 'next';
import { LINKED_TOOLS } from '@/content/linkedTools';
import { MEASURE_SLUGS } from '@/content/measures';
import { IS_PRODUCTION_DEPLOYMENT, SITE_URL } from '@/lib/config';

/** The landing page, one page per measure and each linked calculator's page; empty outside production. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_PRODUCTION_DEPLOYMENT) return [];
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    ...[...MEASURE_SLUGS, ...LINKED_TOOLS.map((t) => t.slug)].map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
