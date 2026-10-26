'use client';

import Link from 'next/link';
import { getContent } from '@/content/measures';
import { headlineBasisNote, measureBasis } from '@/lib/figureBasis';
import { headlineFor, type Metrics } from '@/lib/metrics';
import type { Measure } from '@/lib/registry';
import { lowerFirst } from '@/lib/text';
import { BasisBadge } from './FigureBasis';

/** "Tax year 2027" / "Tax years 2028 and 2029" */
export const yearsLabel = (years: number[]): string =>
  years.length === 1
    ? `Tax year ${years[0]}`
    : `Tax years ${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;

interface Props {
  measure: Measure;
  /** metrics.csv values for the measure's headline year; null while loading or missing. */
  metrics: Metrics;
  /** True while metrics.csv is loading. */
  loading?: boolean;
}

/** Landing-page card: the measure, its headline PolicyEngine figure and the official estimate. */
export default function MeasureCard({ measure, metrics, loading = false }: Props) {
  const content = getContent(measure.slug);
  const headline = headlineFor(measure, metrics);
  const conditional = measure.kind_params?.conditional === true;
  // The card is one link, so its note carries no methodology link of its own.
  const basisNote = headline.model ? headlineBasisNote(measure, metrics) : null;

  return (
    <Link
      href={`/${measure.slug}`}
      className="group flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500"
      aria-label={`${measure.state_name} ${measure.designation}: ${measure.short_title}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">
          {measure.state_name} · {measure.designation}
        </span>
        {conditional && (
          <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            Conditional scenario
          </span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-bold text-gray-900 group-hover:text-primary-700">
        {measure.short_title}
      </h3>
      <p className="mt-2 text-sm text-gray-600">{content.description}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
        <div>
          <dt className="text-xs text-gray-500">
            <span className="mr-1">PolicyEngine: {lowerFirst(headline.label)}</span>
            <BasisBadge basis={measureBasis(measure)} />
          </dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
            {headline.model ?? (
              <span className="text-sm font-medium text-gray-500">
                {loading ? 'Loading…' : 'Results not yet available'}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">{headline.officialLabel}</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-700">
            {headline.official ?? <span className="text-sm font-medium text-gray-500">None published</span>}
          </dd>
          {headline.officialSource && (
            <dd className="text-[11px] leading-4 text-gray-500 mt-0.5">{headline.officialSource}</dd>
          )}
        </div>
        {basisNote && (
          <p className="col-span-2 text-[11px] leading-4 text-gray-500" data-testid="headline-basis-note">
            {basisNote}
          </p>
        )}
      </dl>

      <div className="mt-auto flex items-center justify-between pt-4 text-sm">
        <span className="text-gray-500">{yearsLabel(measure.years)}</span>
        <span className="font-semibold text-primary-700 group-hover:underline">
          View analysis <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
