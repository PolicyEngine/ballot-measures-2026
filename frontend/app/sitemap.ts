import type { MetadataRoute } from 'next';
import { MEASURE_SLUGS } from '@/content/measures';
import { SITE_URL } from '@/lib/config';

/** The landing page and one page per measure. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    ...MEASURE_SLUGS.map((slug) => ({
      url: `${SITE_URL}/${slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
