import type { Metadata } from 'next';
import LinkedToolPage from '@/components/LinkedToolPage';
import { CA_PROP_40 } from '@/content/linkedTools';
import { SITE_URL } from '@/lib/config';
import { lowerFirst } from '@/lib/text';

// A static folder, so it takes precedence over [measure] (whose dynamicParams is false).
const tool = CA_PROP_40;
const title = `${tool.stateName} ${tool.designation}: ${lowerFirst(tool.shortTitle)}`;
const url = `${SITE_URL}/${tool.slug}`;

export const metadata: Metadata = {
  title,
  description: tool.overview,
  alternates: { canonical: url },
  openGraph: {
    title,
    description: tool.overview,
    url,
    siteName: 'PolicyEngine',
    type: 'website',
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title, description: tool.overview },
};

export default function CaProp40Page() {
  return <LinkedToolPage tool={tool} />;
}
