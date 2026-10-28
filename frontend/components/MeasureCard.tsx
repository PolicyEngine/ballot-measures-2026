'use client';

import Link from 'next/link';
import { headlineFor, type Metrics } from '@/lib/metrics';
import type { Measure } from '@/lib/registry';
import { lowerFirst } from '@/lib/text';

/** "Tax year 2027" / "Tax years 2028 and 2029" */
export const yearsLabel = (years: number[]): string =>
  years.length === 1
    ? `Tax year ${years[0]}`
    : `Tax years ${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;

/** "Official: +$1.97B", or "Official: 29,055 enrolled through expansion" when it measures something else. */
export function officialLine(official: string, officialLabel: string): string {
  return officialLabel === 'Official estimate'
    ? `Official: ${official}`
    : `Official: ${official} ${lowerFirst(officialLabel)}`;
}

interface Props {
  measure: Measure;
  /** metrics.csv values for the measure's headline year; null while loading or missing. */
  metrics: Metrics;
  /** True while metrics.csv is loading. */
  loading?: boolean;
}

/** Landing-page card: state, designation, short title, PolicyEngine's headline and the official figure. */
export default function MeasureCard({ measure, metrics, loading = false }: Props) {
  const headline = headlineFor(measure, metrics);
  const conditional = measure.kind_params?.conditional === true;
  const badge = 'rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700';

  return (
    <Link
      href={`/${measure.slug}`}
      className="group flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500"
      aria-label={`${measure.state_name} ${measure.designation}: ${measure.short_title}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">
          {measure.state_name} · {measure.designation}
        </span>
        {measure.show_districts && <span className={badge}>District map</span>}
        {conditional && <span className={badge}>Conditional scenario</span>}
      </div>
      <h3 className="mt-1 text-lg font-bold text-gray-900 group-hover:text-primary-700">{measure.short_title}</h3>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500">PolicyEngine: {lowerFirst(headline.label)}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
          {headline.model ?? (
            <span className="text-sm font-medium text-gray-500">
              {loading ? 'Loading…' : 'Results not yet available'}
            </span>
          )}
        </p>
        <p className="mt-1 text-sm tabular-nums text-gray-600">
          {headline.official ? officialLine(headline.official, headline.officialLabel) : 'No official estimate'}
        </p>
      </div>

      <p className="mt-auto pt-4 text-sm font-semibold text-primary-700 group-hover:underline">
        View analysis <span aria-hidden="true">→</span>
      </p>
    </Link>
  );
}
