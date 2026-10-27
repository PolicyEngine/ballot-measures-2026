'use client';

/**
 * Statewide impact tab, laid out like the NJ CTC dashboard's: "{State}
 * impact analysis" with FUTA's download button and year pills, headline
 * stat cards, then sub-navigation pills (budgetary, distributional,
 * winners and losers, poverty). The Medicaid scenario has coverage and
 * budgetary sections instead.
 */

import { useState } from 'react';
import { formatCount } from '@/lib/format';
import { useStatewideResults, type Measure } from '@/lib/measures';
import { CORE_METRICS } from '@/lib/metrics';
import { metric, type StatewideResults } from '@/lib/results';
import DownloadResults from './DownloadResults';
import { FORECAST_INPUT_NOTE } from '@/lib/figureBasis';
import { BasisNote } from './FigureBasis';
import { Callout, Loading, ResultsUnavailable, YearPills, rovingKeyDown } from './ui';
import CoverageStatewide, { PEOPLE_NOT_DOLLARS, type CoverageSection } from './statewide/CoverageStatewide';
import { KindHeadlineCards } from './statewide/KindSummary';
import {
  BudgetSection,
  DistributionalSection,
  IncomeBandsTable,
  PovertySection,
  WinnersSection,
} from './statewide/sections';

type Section = 'budget' | 'distributional' | 'winners' | 'poverty';

/** Statewide sections for the net-income measures, with the NJ dashboard's names. */
export const STATEWIDE_SECTIONS: { key: Section; label: string }[] = [
  { key: 'budget', label: 'Budgetary impact' },
  { key: 'distributional', label: 'Distributional impact' },
  { key: 'winners', label: 'Winners & losers' },
  { key: 'poverty', label: 'Poverty impact' },
];

/** The Medicaid scenario's sections. */
export const COVERAGE_SECTIONS: { key: CoverageSection; label: string }[] = [
  { key: 'coverage', label: 'Coverage impact' },
  { key: 'budget', label: 'Budgetary impact' },
];

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
      effective sample size), and the estimates are approximate. The validation and methods tab
      compares them with official estimates.
    </Callout>
  );
}

/** Why a measure in a state with districts has no district breakdown (CA, WA). */
export function NoDistrictsNote({ measure, metrics }: { measure: Measure; metrics?: Record<string, number> }) {
  if (!measure.has_districts || measure.show_districts) return null;
  const effective = metric(metrics, CORE_METRICS.effectiveAffectedSampleHouseholds);
  return (
    <p className="text-sm text-gray-600" data-testid="no-districts-note">
      This dashboard does not break {measure.designation} down by congressional district: few sample
      households carry the change
      {effective !== null ? ` (an effective sample of about ${formatCount(Math.max(1, effective))})` : ''}, so
      district figures would be unreliable.
    </p>
  );
}

/** NJ's sub-navigation pills (a tablist with arrow keys). */
function SectionPills<K extends string>({
  sections,
  value,
  onChange,
}: {
  sections: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Statewide sections"
      onKeyDown={(e) =>
        rovingKeyDown(
          e,
          sections.map((s) => s.key),
          value,
          onChange,
        )
      }
    >
      {sections.map((s) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={value === s.key}
          tabIndex={value === s.key ? 0 : -1}
          onClick={() => onChange(s.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === s.key ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function NetIncomeStatewide({ measure, data }: { measure: Measure; data: StatewideResults }) {
  const [section, setSection] = useState<Section>('budget');
  return (
    <>
      <KindHeadlineCards measure={measure} metrics={data.metrics} />
      {measure.kind === 'tabor_refund' && <BasisNote basis="forecast">{FORECAST_INPUT_NOTE}</BasisNote>}
      <PrecisionNote metrics={data.metrics} />

      <SectionPills sections={STATEWIDE_SECTIONS} value={section} onChange={setSection} />

      {measure.kind === 'school_meals' && (
        <BasisNote basis="calibrated">
          Household gains in these sections, including the poverty figures, use the
          participation-adjusted midpoint of the low and high cases, not the model&apos;s
          assumption that every student eats both meals every day.
        </BasisNote>
      )}
      {section === 'budget' && (
        <div className="space-y-10">
          <BudgetSection measure={measure} data={data} />
          <IncomeBandsTable data={data} />
        </div>
      )}
      {section === 'distributional' && <DistributionalSection data={data} />}
      {section === 'winners' && <WinnersSection data={data} />}
      {section === 'poverty' && <PovertySection data={data} />}
    </>
  );
}

/** The Medicaid scenario: people first, then spending; never net income. */
function CoverageStatewideTabs({ measure, data }: { measure: Measure; data: StatewideResults }) {
  const [section, setSection] = useState<CoverageSection>('coverage');
  return (
    <>
      <p className="text-sm text-gray-700">{PEOPLE_NOT_DOLLARS}</p>
      <PrecisionNote metrics={data.metrics} />
      <SectionPills sections={COVERAGE_SECTIONS} value={section} onChange={setSection} />
      <CoverageStatewide data={data} section={section} />
      {section === 'budget' && <BudgetSection measure={measure} data={data} />}
    </>
  );
}

interface Props {
  measure: Measure;
  year: number;
  /** Shows FUTA's year pills for measures scored in several years. */
  onYearChange?: (year: number) => void;
}

export default function AggregateImpact({ measure, year, onYearChange }: Props) {
  const { data, isLoading, error } = useStatewideResults(measure.slug, year);
  const conditional = measure.kind_params?.conditional === true;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-primary">{measure.state_name} impact analysis</h2>
          <DownloadResults slug={measure.slug} file="metrics.csv" label="Download CSV" />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Tax year {year}.{' '}
          {conditional
            ? 'The scenario in which expansion ends, compared with current law.'
            : `If ${measure.designation} passes, compared with current law.`}
        </p>
      </div>
      {onYearChange && <YearPills years={measure.years} value={year} onChange={onYearChange} />}

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
      ) : measure.kind === 'medicaid' ? (
        <CoverageStatewideTabs measure={measure} data={data} />
      ) : (
        <NetIncomeStatewide measure={measure} data={data} />
      )}

      <NoDistrictsNote measure={measure} metrics={data?.metrics} />

      <Callout>
        These estimates are static: they hold work, investment and where people live fixed.
      </Callout>
    </div>
  );
}
