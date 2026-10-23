import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MeasureDashboard from '@/components/MeasureDashboard';
import { MEASURE_CONTENT, MEASURE_SLUGS } from '@/content/measures';
import { SITE_URL } from '@/lib/config';
import { MEASURES_BY_SLUG, measureName } from '@/lib/registry';
import { lowerFirst } from '@/lib/text';

// One static page per measure; any other path is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return MEASURE_SLUGS.map((measure) => ({ measure }));
}

type Params = Promise<{ measure: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { measure: slug } = await params;
  const measure = MEASURES_BY_SLUG[slug];
  const content = MEASURE_CONTENT[slug];
  if (!measure || !content) return {};
  const title = `${measureName(measure)}: ${lowerFirst(measure.short_title)}`;
  const url = `${SITE_URL}/${slug}`;
  return {
    title,
    description: content.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: content.description,
      url,
      siteName: 'PolicyEngine',
      type: 'website',
      locale: 'en_US',
    },
    twitter: { card: 'summary_large_image', title, description: content.description },
  };
}

export default async function MeasurePage({ params }: { params: Params }) {
  const { measure: slug } = await params;
  if (!MEASURES_BY_SLUG[slug] || !MEASURE_CONTENT[slug]) notFound();
  return <MeasureDashboard slug={slug} />;
}
