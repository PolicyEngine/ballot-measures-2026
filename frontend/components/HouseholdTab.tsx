'use client';

import { useRef } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { getContent } from '@/content/measures';
import ExampleHouseholds from './ExampleHouseholds';
import HouseholdForm from './HouseholdForm';
import ImpactAnalysis from './ImpactAnalysis';
import { Callout, YearPills } from './ui';
import { formFromRequest, requestKey, validateHouseholdForm, type HouseholdFormValues } from '@/lib/householdForm';
import type { HouseholdRequest, HouseholdResponse } from '@/lib/householdApi';
import type { ExampleHousehold, Measure } from '@/lib/measures';

export interface SubmittedHousehold {
  request: HouseholdRequest;
  /** Stored example result; null for live calculations. */
  precomputed: HouseholdResponse | null;
  exampleId: string | null;
  exampleLabel: string | null;
}

export interface HouseholdTabState {
  form: HouseholdFormValues;
  submitted: SubmittedHousehold | null;
}

/** Notes under the dependents list, by measure kind. */
const DEPENDENTS_NOTES: Record<Measure['kind'], string | undefined> = {
  income_tax: undefined,
  tabor_refund: 'Refunds go to adult filers; dependents do not receive their own.',
  school_meals: 'School meals apply to children aged 5 to 17.',
  medicaid: 'Children keep their coverage in the scenario; only adults covered through expansion lose Medicaid.',
};

interface Props {
  measure: Measure;
  year: number;
  /** Shows FUTA's year pills for measures scored in several years. */
  onYearChange?: (year: number) => void;
  state: HouseholdTabState;
  setState: React.Dispatch<React.SetStateAction<HouseholdTabState>>;
}

/** Household impact tab, ordered like the NJ dashboard's: examples, the form, then the impact analysis. */
export default function HouseholdTab({ measure, year, onYearChange, state, setState }: Props) {
  const content = getContent(measure.slug);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const fetching = useIsFetching({ queryKey: ['householdImpact'] }) > 0;
  const { form, submitted } = state;

  const scrollToResults = () => {
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
    );
  };

  const handleSelectExample = (example: ExampleHousehold, exampleYear: number) => {
    const request: HouseholdRequest = {
      ...example.input,
      measure: measure.slug,
      year: example.input.year ?? exampleYear,
    };
    setState({
      form: formFromRequest(request),
      submitted: {
        request,
        precomputed: example.response,
        exampleId: example.id,
        exampleLabel: example.label,
      },
    });
    scrollToResults();
  };

  const handleSubmit = (request: HouseholdRequest) => {
    setState((s) => ({
      ...s,
      submitted: { request, precomputed: null, exampleId: null, exampleLabel: null },
    }));
    scrollToResults();
  };

  const currentRequest = validateHouseholdForm(form, measure.slug, year).request;
  const inputsChanged =
    submitted !== null &&
    currentRequest !== null &&
    requestKey(currentRequest) !== requestKey(submitted.request);

  return (
    <div className="space-y-6">
      <p className="text-gray-700">{content.householdNote}</p>
      {onYearChange && <YearPills years={measure.years} value={year} onChange={onYearChange} />}

      <ExampleHouseholds
        measure={measure}
        year={year}
        onSelect={handleSelectExample}
        selectedId={submitted?.exampleId ?? null}
      />

      <HouseholdForm
        // Remount when an example loads so stale validation messages clear.
        key={submitted?.exampleId ?? 'custom'}
        measure={measure.slug}
        year={year}
        values={form}
        onChange={(values) => setState((s) => ({ ...s, form: values }))}
        onSubmit={handleSubmit}
        busy={fetching}
        dependentsNote={DEPENDENTS_NOTES[measure.kind]}
      />

      {submitted && (
        <div ref={resultsRef} className="scroll-mt-4 space-y-6">
          <h2 className="text-2xl font-bold text-primary">Impact analysis</h2>
          {inputsChanged && (
            <Callout role="status">
              Your inputs or the selected year have changed. Select calculate impact to update these
              results.
            </Callout>
          )}
          <ImpactAnalysis
            measure={measure}
            request={submitted.request}
            precomputed={submitted.precomputed}
            exampleLabel={submitted.exampleLabel}
          />
        </div>
      )}

    </div>
  );
}
