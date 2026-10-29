'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import USStateMap from './USStateMap';
import { buildHashString, parseHashParams } from '@/lib/embedding';
import { landingStates } from '@/lib/landing';
import { isMeasureSlug } from '@/lib/registry';

/**
 * The map is the landing page: selecting a highlighted state opens a dialog
 * with each of its measures. A visually hidden list links every measure for
 * screen readers and crawlers.
 */
export default function LandingPage() {
  const router = useRouter();
  const states = useMemo(() => landingStates(), []);

  // Embedded links can name a measure in the hash (#measure=wa-i-645&tab=statewide).
  useEffect(() => {
    const params = parseHashParams(window.location.hash);
    if (isMeasureSlug(params.measure)) {
      const rest = buildHashString({ ...params, measure: undefined });
      router.replace(`/${params.measure}${rest ? `#${rest}` : ''}`);
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">2026 ballot measures: taxes and benefits</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
        <section aria-label="Map of states with measures" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
          <USStateMap states={states} />
          <p className="mt-2 text-center text-sm text-gray-500">Select a highlighted state to see its measures.</p>
        </section>

        <nav
          aria-label="All measures"
          className="sr-only focus-within:not-sr-only focus-within:block focus-within:rounded-xl focus-within:border focus-within:border-gray-200 focus-within:bg-white focus-within:p-4"
        >
          <ul className="space-y-1 text-sm">
            {states.flatMap((s) =>
              s.measures.map((m) => (
                <li key={m.slug}>
                  <Link href={`/${m.slug}`} className="text-primary-700 hover:underline">
                    {s.name} {m.designation}: {m.shortTitle}
                  </Link>
                </li>
              )),
            )}
          </ul>
        </nav>
      </div>
    </main>
  );
}
