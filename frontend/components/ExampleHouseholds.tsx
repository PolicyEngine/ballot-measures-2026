'use client';

import { useExampleHouseholds, type ExampleHousehold, type Measure } from '@/lib/measures';
import { netIncomeChange } from '@/lib/householdForm';
import { formatUSDWithSign } from '@/lib/format';
import { toneOf, toneText } from './ui';

interface Props {
  measure: Measure;
  /** Tax year selected on the dashboard. */
  year: number;
  /** Fires when a card is chosen; the parent fills the form and shows the
   *  stored result without calling the calculator. */
  onSelect: (example: ExampleHousehold, year: number) => void;
  /** id of the active example, so its card can highlight itself. */
  selectedId?: string | null;
}

/** Precomputed example households for one measure (example_households.json). */
export default function ExampleHouseholds({ measure, year: selectedYear, onSelect, selectedId }: Props) {
  const { households, year, isLoading } = useExampleHouseholds(measure.slug, selectedYear);
  const conditional = measure.kind_params?.conditional === true;

  if (isLoading) return null;

  if (households.length === 0 || year === null) {
    return (
      <p className="bg-gray-50 border border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600">
        Example household results are not yet available. The calculator below still works.
      </p>
    );
  }

  return (
    <section aria-labelledby="example-households-heading">
      <h3 id="example-households-heading" className="text-lg font-semibold text-gray-900 mb-1">
        Example households
      </h3>
      <p className="text-sm text-gray-600 mb-3">
        Change in annual net income {conditional ? 'in the scenario' : `if ${measure.designation} passes`},{' '}
        {year}. Select one to see its full results.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {households.map((h) => {
          const isSelected = selectedId === h.id;
          const change = netIncomeChange(h.response);
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelect(h, year)}
              aria-pressed={isSelected}
              title={h.description}
              className={`flex flex-col text-left rounded-lg border p-3 transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-primary-500 ring-offset-1 bg-white border-primary-500'
                  : 'bg-gray-50 border-gray-200 hover:border-primary-500'
              }`}
            >
              <span className="text-sm font-semibold text-gray-800 leading-5">{h.label}</span>
              <span className={`mt-2 text-xl font-bold tabular-nums ${toneText(toneOf(change))}`}>
                {formatUSDWithSign(change)}
                <span className="text-sm font-medium text-gray-500">/year</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
