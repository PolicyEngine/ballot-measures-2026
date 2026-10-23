'use client';

import { useState } from 'react';
import { formatCount } from '@/lib/format';
import { useStatewideResults, type Measure } from '@/lib/measures';
import { CORE_METRICS } from '@/lib/metrics';
import { metric } from '@/lib/results';
import DownloadResults from './DownloadResults';
import { Callout, Loading, ResultsUnavailable } from './ui';
import { KindHeadlineCards } from './statewide/KindSummary';
import {
  BudgetSection,
  CoverageSection,
  DistributionalSection,
  IncomeBandsSection,
  PovertySection,
  WinnersSection,
} from './statewide/sections';

type Section = 'budget' | 'distributional' | 'winners' | 'bands' | 'poverty' | 'coverage';

/** Statewide sections; Medicaid measures show coverage in place of poverty. */
export function statewideSections(measure: Measure): { key: Section; label: string }[] {
  return [
    { key: 'budget', label: 'Budget' },
    { key: 'distributional', label: 'By income decile' },
    { key: 'winners', label: 'Gains and losses' },
    { key: 'bands', label: 'By income band' },
    measure.kind === 'medicaid'
      ? { key: 'coverage', label: 'Health coverage' }
      : { key: 'poverty', label: 'Poverty' },
  ];
}

/** Below this effective sample of affected households, flag the estimate as imprecise. */
export const SMALL_EFFECTIVE_SAMPLE = 50;

/** Note when the change rests on few survey households (Kish effective sample). */
export function PrecisionNote({ metrics }: { metrics: Record<string, number> }) {
  const effective = metric(metrics, CORE_METRICS.effectiveAffectedSampleHouseholds);
  const sampled = metric(metrics, CORE_METRICS.affectedSampleHouseholds);
  if (effective === null || effective >= SMALL_EFFECTIVE_SAMPLE) return null;
  return (
    <Callout role="note">
      These figures rest on {sampled === null ? 'a small number of' : formatCount(sampled)} sampled
      households that the measure affects. Their survey weights vary, so together they carry the
      statistical weight of about {formatCount(Math.max(1, effective))} independent households (the
      effective sample size), and the estimates are approximate. The methodology tab compares them
      with official estimates.
    </Callout>
  );
}

interface Props {
  measure: Measure;
  year: number;
}

export default function AggregateImpact({ measure, year }: Props) {
  const { data, isLoading, error } = useStatewideResults(measure.slug, year);
  const [section, setSection] = useState<Section>('budget');
  const sections = statewideSections(measure);
  const conditional = measure.kind_params?.conditional === true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary-700">{measure.state_name} statewide impact</h2>
          <p className="text-sm text-gray-600 mt-1">
            {conditional
              ? `The scenario in which expansion ends, compared with current law, ${year}.`
              : `If ${measure.designation} passes, compared with current law, tax year ${year}.`}
          </p>
        </div>
        <DownloadResults slug={measure.slug} file="metrics.csv" label="Download statewide results (CSV)" />
      </div>

      {isLoading ? (
        <Loading label={`Loading ${measure.state_name} results…`} />
      ) : error ? (
        <ResultsUnavailable
          title="Statewide results not yet available"
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : !data ? (
        <ResultsUnavailable
          title="Statewide results not yet available"
          detail={`metrics.csv has no rows for ${measure.slug} in ${year}.`}
        />
      ) : (
        <>
          <KindHeadlineCards measure={measure} metrics={data.metrics} />
          <PrecisionNote metrics={data.metrics} />

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Statewide sections">
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={section === s.key}
                onClick={() => setSection(s.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  section === s.key
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {section === 'budget' && <BudgetSection measure={measure} data={data} />}
          {section === 'distributional' && <DistributionalSection data={data} />}
          {section === 'winners' && <WinnersSection data={data} />}
          {section === 'bands' && <IncomeBandsSection data={data} />}
          {section === 'poverty' && <PovertySection data={data} />}
          {section === 'coverage' && <CoverageSection data={data} />}
        </>
      )}

      <Callout>
        These estimates are static: they hold work, investment and where people live fixed.
      </Callout>
    </div>
  );
}
