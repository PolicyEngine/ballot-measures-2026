'use client';

/**
 * Statewide view for the Medicaid scenario (South Dakota): people and
 * government spending rather than household net income. The unsuffixed
 * metrics are calibrated to administrative enrollment when the pipeline
 * publishes `enrollment_calibration_factor`; the methodology tab shows the
 * model's values before calibration.
 */

import { formatCompactUSD, formatCount, formatShare } from '@/lib/format';
import { MEDICAID_METRICS as MC } from '@/lib/metrics';
import { metric, type StatewideResults } from '@/lib/results';
import { Callout, MetricCard } from '../ui';
import { show, signedMoney } from './KindSummary';

export const PEOPLE_NOT_DOLLARS =
  'This scenario is shown in people and government spending rather than household net income: PolicyEngine values Medicaid at its average cost per enrollee, the same for every adult, while premium tax credits rise with age, so net income would show some adults gaining when they move to marketplace coverage.';

export default function CoverageStatewide({ data }: { data: StatewideResults }) {
  const m = data.metrics;
  const losing = metric(m, MC.peopleLosingMedicaid);
  const below = metric(m, MC.losingBelow100fpl);
  const above = metric(m, MC.losing100PlusFpl);
  const gaining = metric(m, MC.gainingPtc);
  // Calibrated pages pair the calibrated counts with the administrative
  // enrollment they are scaled to (baseline_expansion_enrollees stays the model's).
  const enrolled = metric(m, MC.adminExpansionEnrollees) ?? metric(m, MC.baselineExpansionEnrollees);
  const calibrated = metric(m, MC.enrollmentCalibrationFactor) !== null;
  const share = (v: number | null) => (v !== null && losing ? formatShare(v / losing) : null);
  const withShare = (v: number | null, text: string) => {
    const s = share(v);
    return s ? `${s} of those losing Medicaid${text ? `; ${text}` : ''}` : text;
  };
  // The same figure as the methodology tab: a tenth of expansion spending.
  const total = metric(m, MC.medicaidCostChange);
  const perTenPoints = total === null ? null : formatCompactUSD(Math.abs(total) * 0.1, { sig3: true });

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-700">{PEOPLE_NOT_DOLLARS}</p>

      <section aria-labelledby="coverage-people-heading" className="space-y-3">
        <h3 id="coverage-people-heading" className="text-lg font-semibold text-gray-800">
          Health coverage in the scenario, {data.year}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="People losing Medicaid"
            value={show(losing, formatCount)}
            detail={
              enrolled === null
                ? 'Adults covered through expansion'
                : `Of ${formatCount(enrolled)} enrolled through expansion under current law`
            }
          />
          <MetricCard
            label="In the coverage gap"
            value={show(below, formatCount)}
            detail={withShare(below, 'income below the poverty line, with no subsidized marketplace option')}
          />
          <MetricCard
            label="Income at or above the poverty line (may qualify for marketplace subsidies)"
            value={show(above, formatCount)}
            detail={withShare(above, '') || undefined}
          />
          <MetricCard
            label="Gaining a premium tax credit"
            value={show(gaining, formatCount)}
            detail="People losing Medicaid whose premium tax credit rises, allowing for those who do not enroll"
          />
        </div>
      </section>

      <section aria-labelledby="coverage-spending-heading" className="space-y-3">
        <h3 id="coverage-spending-heading" className="text-lg font-semibold text-gray-800">
          Government spending, {data.year}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Change in state Medicaid spending"
            value={show(metric(m, MC.medicaidStateCostChange), signedMoney)}
            detail={`The state's 10% share of expansion costs under current law.${
              perTenPoints
                ? ` Each 10-point drop in the federal share would shift about ${perTenPoints} a year to the state if expansion continued.`
                : ''
            }`}
          />
          <MetricCard
            label="Change in federal Medicaid spending"
            value={show(metric(m, MC.medicaidFederalCostChange), signedMoney)}
            detail="The federal share of expansion costs"
          />
          <MetricCard
            label="Change in premium tax credits"
            value={show(metric(m, MC.ptcChange), signedMoney)}
            detail="Federal credits for people who move to marketplace coverage"
          />
        </div>
        <p className="text-xs text-gray-500">
          Negative values mean less spending. Spending changes compare the scenario with current law
          at today&apos;s federal share; the methodology tab shows how the state&apos;s cost would
          change with a lower federal share.
          {calibrated
            ? ' Counts and costs are calibrated to the Department of Social Services’ expansion enrollment; the methodology tab shows the model’s values before calibration.'
            : ''}
        </p>
      </section>

      <Callout>
        Adults with income below the poverty line do not qualify for marketplace premium tax credits,
        so in this scenario they lose Medicaid without a subsidized alternative. Adults at or above
        the poverty line may qualify for premium tax credits to buy marketplace coverage.
      </Callout>
    </div>
  );
}
