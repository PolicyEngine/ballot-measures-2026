import type { MetadataRoute } from 'next';
import { IS_PRODUCTION_DEPLOYMENT, SITE_URL } from '@/lib/config';

/** Production allows crawling and lists the sitemap; previews and local builds disallow everything. */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_DEPLOYMENT) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
