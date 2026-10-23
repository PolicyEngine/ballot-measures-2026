'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MeasureCard from './MeasureCard';
import StateTileMap, { type HighlightedState } from './StateTileMap';
import { Callout } from './ui';
import { formatLongDate } from '@/lib/format';
import { buildHashString, parseHashParams } from '@/lib/embedding';
import {
  ELECTION_DATE,
  MEASURES,
  isMeasureSlug,
  measuresByState,
  useAllMetrics,
} from '@/lib/measures';
import { metricsFor } from '@/lib/results';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

const STATE_NOTES: Record<string, string> = {
  CO: 'Colorado voters decide both measures separately. Each is modeled on its own against current law; the overview pages describe how they interact with other measures on the ballot.',
};

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

  const highlighted: HighlightedState[] = groups.map((g) => ({
    code: g.state,
    name: g.stateName,
    measures: g.measures.map((m) => m.designation),
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

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            2026 ballot measures: taxes and benefits
          </h1>
          <p className="text-lg opacity-90">
            How {numberWord(MEASURES.length)} measures on the {formatLongDate(ELECTION_DATE)} ballot
            in {numberWord(groups.length)} states would change household taxes and benefits,
            compared with current law.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        <section className="bg-white rounded-lg shadow-md p-4 sm:p-6 grid gap-6 md:grid-cols-2 md:items-center">
          <StateTileMap
            highlighted={highlighted}
            onSelect={selectState}
            selected={selectedState}
          />
          <div className="space-y-3 text-gray-700">
            <h2 className="text-xl font-bold text-gray-900">About this dashboard</h2>
            <p>
              For each measure, PolicyEngine compares what happens if it passes with current law:
              for a household you describe, statewide, and by congressional district in states
              with more than one district. South Dakota&apos;s measure has no immediate effect, so
              its page shows a conditional scenario.
            </p>
            <p>
              Official estimates from each state appear beside PolicyEngine&apos;s, with notes on
              how they differ. PolicyEngine is nonpartisan and takes no position on any ballot
              measure.
            </p>
            <p className="text-sm text-gray-500">Select a highlighted state or a measure below.</p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-x-4 gap-y-10 md:grid-cols-2">
          {groups.map((group) => {
            const several = group.measures.length > 1;
            return (
              <section
                key={group.state}
                id={`state-${group.state.toLowerCase()}`}
                aria-labelledby={`state-${group.state.toLowerCase()}-heading`}
                className={`scroll-mt-20 rounded-lg flex flex-col ${several ? 'md:col-span-2' : ''} ${
                  selectedState === group.state
                    ? 'ring-2 ring-primary-500 ring-offset-4 ring-offset-gray-50'
                    : ''
                }`}
              >
                <h2
                  id={`state-${group.state.toLowerCase()}-heading`}
                  className="text-2xl font-bold text-gray-900 mb-1"
                >
                  {group.stateName}
                </h2>
                {STATE_NOTES[group.state] && (
                  <p className="text-sm text-gray-600 mb-1 max-w-3xl">{STATE_NOTES[group.state]}</p>
                )}
                <div className={`grid grid-cols-1 gap-4 mt-3 flex-1 ${several ? 'md:grid-cols-2' : ''}`}>
                  {group.measures.map((m) => (
                    <MeasureCard
                      key={m.slug}
                      measure={m}
                      metrics={metricsFor(metricsFile.data, m.slug, m.headline_year)}
                      loading={metricsFile.isLoading}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <Callout title="How to read these estimates">
          <p>
            Every figure compares a measure that passes with current law in the same tax year; for
            South Dakota, it compares current law with a scenario in which the federal share falls
            below 90% and expansion ends. Estimates are static: they hold behavior such as work, investment and where people
            live fixed. Each measure page lists what the model leaves out and compares its figures
            with official estimates.
          </p>
        </Callout>
      </div>
    </main>
  );
}
