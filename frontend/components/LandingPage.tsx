'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MeasureCard from './MeasureCard';
import USStateMap, { type MapState } from './USStateMap';
import { formatLongDate } from '@/lib/format';
import { buildHashString, parseHashParams } from '@/lib/embedding';
import {
  ELECTION_DATE,
  MEASURES,
  isMeasureSlug,
  measuresByState,
  useAllMetrics,
} from '@/lib/measures';
import { headlineFor } from '@/lib/metrics';
import { metricsFor } from '@/lib/results';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function LandingPage() {
  const router = useRouter();
  const groups = useMemo(() => measuresByState(), []);
  const metricsFile = useAllMetrics();
  const [selectedState, setSelectedState] = useState<string | null>(null);

  // Embedded links can name a measure in the hash (#measure=wa-i-645&tab=statewide).
  useEffect(() => {
    const params = parseHashParams(window.location.hash);
    if (isMeasureSlug(params.measure)) {
      const rest = buildHashString({ ...params, measure: undefined });
      router.replace(`/${params.measure}${rest ? `#${rest}` : ''}`);
    }
  }, [router]);

  const mapStates: MapState[] = groups.map((g) => ({
    code: g.state,
    name: g.stateName,
    measures: g.measures.map((m) => {
      const headline = headlineFor(m, metricsFor(metricsFile.data, m.slug, m.headline_year));
      return {
        designation: m.designation,
        shortTitle: m.short_title,
        label: headline.label,
        headline: headline.model,
        official: headline.official,
      };
    }),
  }));

  const selectState = (code: string) => {
    const group = groups.find((g) => g.state === code);
    if (!group) return;
    if (group.measures.length === 1) {
      router.push(`/${group.measures[0].slug}`);
      return;
    }
    setSelectedState(code);
    document
      .getElementById(`state-${code.toLowerCase()}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // One line for a state with several measures, e.g. Colorado's two.
  const several = groups.filter((g) => g.measures.length > 1);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">2026 ballot measures: taxes and benefits</h1>
          <p className="mt-1 text-sm text-gray-600">
            {capitalize(numberWord(MEASURES.length))} measures in {numberWord(groups.length)} states ·{' '}
            {formatLongDate(ELECTION_DATE)} · Compared with current law (South Dakota’s as a
            conditional scenario)
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <section aria-label="Map of states with measures" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
          <USStateMap states={mapStates} onSelect={selectState} selected={selectedState} />
        </section>

        <section aria-labelledby="measures-heading" className="space-y-3">
          <h2 id="measures-heading" className="sr-only">
            Measures
          </h2>
          {several.map((g) => (
            <p key={g.state} className="text-sm text-gray-600">
              {g.stateName} voters decide {g.measures.map((m) => m.designation).join(' and ')} separately; each is
              modeled against current law.
            </p>
          ))}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MEASURES.map((m) => {
              const first = MEASURES.find((x) => x.state === m.state) === m;
              return (
                <div
                  key={m.slug}
                  id={first ? `state-${m.state.toLowerCase()}` : undefined}
                  data-state={m.state}
                  className={`scroll-mt-20 rounded-xl ${
                    selectedState === m.state ? 'ring-2 ring-primary-500 ring-offset-4 ring-offset-gray-50' : ''
                  }`}
                >
                  <MeasureCard
                    measure={m}
                    metrics={metricsFor(metricsFile.data, m.slug, m.headline_year)}
                    loading={metricsFile.isLoading}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
