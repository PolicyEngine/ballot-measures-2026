import Script from 'next/script';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import { BASE_PATH, IS_PRODUCTION_DEPLOYMENT, OG_IMAGE, SITE_URL } from '@/lib/config';

const GA_ID = 'G-2YHG89FY0N';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const TITLE = '2026 ballot measures: taxes and benefits';
const DESCRIPTION =
  "PolicyEngine's estimates of how selected tax and benefit measures on the November 3, 2026 ballot in California, Colorado, North Dakota, South Dakota and Washington would affect households and state budgets, beside official estimates where they exist.";

export const metadata: Metadata = {
  title: { default: `${TITLE} | PolicyEngine`, template: '%s | PolicyEngine' },
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'PolicyEngine',
    type: 'website',
    locale: 'en_US',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  other: {
    // Meta tags can't read CSS variables: this is --primary (#2C7A7B) from
    // @policyengine/ui-kit's light theme tokens.
    'theme-color': '#2C7A7B',
  },
  icons: {
    icon: `${BASE_PATH}/favicon.svg`,
  },
  // Only the production deployment is indexed; previews are not.
  robots: {
    index: IS_PRODUCTION_DEPLOYMENT,
    follow: IS_PRODUCTION_DEPLOYMENT,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
