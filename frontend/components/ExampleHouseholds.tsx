'use client';

import { useExampleHouseholds, type ExampleHousehold, type Measure } from '@/lib/measures';
import { coverageOutcome, coverageSummary } from '@/lib/coverage';
import { netIncomeChange } from '@/lib/householdForm';
import { formatUSD, formatUSDWithSign } from '@/lib/format';
import { toneOf, toneText } from './ui';

/** Card body for the Medicaid scenario: the coverage outcome, not a net-income change. */
function CoverageCardBody({ example }: { example: ExampleHousehold }) {
  const outcome = coverageOutcome(example.response);
  return (
    <>
      <span className="mt-2 text-sm font-semibold text-gray-900 leading-5">{coverageSummary(outcome)}</span>
      {outcome.reform === 'marketplace' && outcome.baseline !== 'marketplace' && (
        <span className="mt-1 text-xs text-gray-600">
          Premium after the credit: {formatUSD(outcome.premiumReform)}/year
        </span>
      )}
      {outcome.reformReason && outcome.baseline !== 'no_subsidy' && (
        <span className="mt-1 text-xs text-gray-600">{outcome.reformReason}</span>
      )}
    </>
  );
}

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

function NetIncomeCardBody({ example }: { example: ExampleHousehold }) {
  const change = netIncomeChange(example.response);
  return (
    <span className={`mt-2 text-xl font-bold tabular-nums ${toneText(toneOf(change))}`}>
      {formatUSDWithSign(change)}
      <span className="text-sm font-medium text-gray-500">/year</span>
    </span>
  );
}

/** Precomputed example households for one measure (example_households.json). */
export default function ExampleHouseholds({ measure, year: selectedYear, onSelect, selectedId }: Props) {
  const { households, year, isLoading } = useExampleHouseholds(measure.slug, selectedYear);
  const conditional = measure.kind_params?.conditional === true;
  const coverage = measure.kind === 'medicaid';

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
        {coverage
          ? `Health coverage under current law and in the scenario, ${year}.`
          : `Change in annual net income ${conditional ? 'in the scenario' : `if ${measure.designation} passes`}, ${year}.`}{' '}
        Select one to see its full results.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {households.map((h) => {
          const isSelected = selectedId === h.id;
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
              {coverage ? <CoverageCardBody example={h} /> : <NetIncomeCardBody example={h} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
