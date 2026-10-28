'use client';

/**
 * Statewide impact tab, laid out like the NJ CTC dashboard's: "{State}
 * impact analysis" with year pills, headline stat cards, then
 * sub-navigation pills (budgetary, distributional, winners and losers,
 * poverty). The Medicaid scenario has coverage and budgetary sections
 * instead. Notes on how the figures are produced are on the Methods tab.
 */

import { useState } from 'react';
import { useStatewideResults, type Measure } from '@/lib/measures';
import { type StatewideResults } from '@/lib/results';
import { MethodsLink } from './MethodsLink';
import { LoadError, Loading, ResultsUnavailable, YearPills, rovingKeyDown } from './ui';
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

/** Why a measure has no district breakdown: one line (CA and WA: too few sample households; ND and SD: one district). */
export function noDistrictsText(measure: Measure): string | null {
  if (measure.show_districts) return null;
  return measure.has_districts
    ? `No district breakdown for ${measure.designation}: too few sample households carry the change.`
    : `No district breakdown: ${measure.state_name} has one at-large congressional district.`;
}

export function NoDistrictsNote({ measure }: { measure: Measure }) {
  const text = measure.has_districts ? noDistrictsText(measure) : null;
  if (!text) return null;
  return (
    <p className="text-sm text-gray-600" data-testid="no-districts-note">
      {text}
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

      <SectionPills sections={STATEWIDE_SECTIONS} value={section} onChange={setSection} />

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
function CoverageStatewideTabs({ data }: { data: StatewideResults }) {
  const [section, setSection] = useState<CoverageSection>('coverage');
  return (
    <>
      <p className="text-sm text-gray-700">{PEOPLE_NOT_DOLLARS}</p>
      <SectionPills sections={COVERAGE_SECTIONS} value={section} onChange={setSection} />
      <CoverageStatewide data={data} section={section} />
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
  const { data, isLoading, error, refetch } = useStatewideResults(measure.slug, year);
  const conditional = measure.kind_params?.conditional === true;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">{measure.state_name} impact analysis</h2>
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
        <LoadError onRetry={() => void refetch()} />
      ) : !data ? (
        <ResultsUnavailable
          title="Statewide results not yet available"
          detail={`metrics.csv has no rows for ${measure.slug} in ${year}.`}
        />
      ) : measure.kind === 'medicaid' ? (
        <CoverageStatewideTabs data={data} />
      ) : (
        <NetIncomeStatewide measure={measure} data={data} />
      )}

      <NoDistrictsNote measure={measure} />
      <p className="text-sm">
        <MethodsLink>How these figures are produced</MethodsLink>
      </p>
    </div>
  );
}
