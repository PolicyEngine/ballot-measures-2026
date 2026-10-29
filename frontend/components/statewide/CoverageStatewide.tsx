'use client';

/**
 * Statewide view for the Medicaid scenario (South Dakota): people and
 * government spending rather than household net income. The unsuffixed
 * metrics are calibrated to administrative enrollment when the pipeline
 * publishes `enrollment_calibration_factor`; the Methods tab shows the
 * model's values before calibration.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactUSD, formatCount, formatShare } from '@/lib/format';
import { CORE_METRICS, MEDICAID_METRICS as MC } from '@/lib/metrics';
import { metric, type StatewideResults } from '@/lib/results';
import {
  CHART_MARGIN,
  ChartFigure,
  ChartTooltip,
  SignedBarLabel,
  TICK_STYLE,
  niceDomain,
} from '../chartUtils';
import { Callout, StatCard } from '../ui';
import { DASH, money, show, signedMoney } from './KindSummary';
import { budgetText } from './sections';

/** One line on the statewide tab; the full reason is on the Methods tab. */
export const PEOPLE_NOT_DOLLARS =
  'This scenario is shown in people and government spending rather than household net income.';

/** Which part of the Medicaid scenario's statewide view to show. */
export type CoverageSection = 'coverage' | 'budget';

export default function CoverageStatewide({
  data,
  section = 'coverage',
}: {
  data: StatewideResults;
  section?: CoverageSection;
}) {
  const m = data.metrics;
  const losing = metric(m, MC.peopleLosingMedicaid);
  const below = metric(m, MC.losingBelow100fpl);
  const above = metric(m, MC.losing100PlusFpl);
  const gaining = metric(m, MC.gainingPtc);
  // Calibrated pages pair the calibrated counts with the administrative
  // enrollment they are scaled to (baseline_expansion_enrollees stays the model's).
  const enrolled = metric(m, MC.adminExpansionEnrollees) ?? metric(m, MC.baselineExpansionEnrollees);
  const share = (v: number | null) => (v !== null && losing ? formatShare(v / losing) : null);
  const withShare = (v: number | null, text: string) => {
    const s = share(v);
    return s ? `${s} of those losing Medicaid${text ? `; ${text}` : ''}` : text;
  };
  const stateChange = metric(m, MC.medicaidStateCostChange);
  const ptc = metric(m, MC.ptcChange);
  const federalBudget = metric(m, CORE_METRICS.federalBudgetImpact);
  const federalMedicaid = metric(m, MC.medicaidFederalCostChange);
  // Who pays what: state and federal Medicaid fall, federal premium tax credits rise.
  const spending = [
    { label: 'State Medicaid', payer: 'state', value: stateChange },
    { label: 'Federal Medicaid', payer: 'federal', value: federalMedicaid },
    { label: 'Premium tax credits', payer: 'federal', value: ptc },
  ].filter((d): d is { label: string; payer: string; value: number } => d.value !== null);
  const spendingAxis = niceDomain(spending.map((d) => d.value));

  if (section === 'budget') {
    // One card per government, each amount stated once.
    return (
      <section aria-labelledby="coverage-spending-heading" className="space-y-3">
        <h3 id="coverage-spending-heading" className="text-lg font-semibold text-gray-800">
          Government spending, {data.year}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            highlight
            label={stateChange !== null && stateChange > 0 ? 'State cost' : 'State savings'}
            value={stateChange === null ? DASH : `${money(Math.abs(stateChange))} a year`}
            detail={`${stateChange !== null && stateChange > 0 ? 'Higher' : 'Lower'} state Medicaid spending at today's 10% state share`}
          />
          <StatCard
            label="Federal Medicaid"
            value={show(metric(m, MC.medicaidFederalCostChange), signedMoney)}
            detail={[
              ptc === null ? null : `Premium tax credits ${signedMoney(ptc)}`,
              federalBudget === null ? null : `federal budget ${budgetText(federalBudget)}`,
            ]
              .filter(Boolean)
              .join('; ')}
          />
        </div>
        {spending.length > 0 && (
          <ChartFigure
            title={`Change in government spending, ${data.year}`}
            legend={[
              { label: 'State', color: 'var(--chart-1)' },
              { label: 'Federal', color: 'var(--chart-3)' },
            ]}
            caption="Medicaid spending falls as expansion adults lose coverage; premium tax credits rise for those who qualify for subsidized marketplace coverage."
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={spending} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tick={TICK_STYLE} stroke="var(--chart-axis)" />
                <YAxis
                  domain={spendingAxis.domain}
                  ticks={spendingAxis.ticks}
                  tickFormatter={(v: number) => formatCompactUSD(v)}
                  tick={TICK_STYLE}
                  stroke="var(--chart-axis)"
                  width={72}
                />
                <Tooltip
                  cursor={{ fill: 'var(--gray-100)' }}
                  content={<ChartTooltip formatter={(v) => signedMoney(v)} />}
                />
                <ReferenceLine y={0} stroke="var(--chart-axis)" />
                <Bar dataKey="value" name="Change in spending" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="value"
                    content={(props) => <SignedBarLabel {...(props as object)} format={(v) => signedMoney(v)} />}
                  />
                  {spending.map((d) => (
                    <Cell key={d.label} fill={d.payer === 'state' ? 'var(--chart-1)' : 'var(--chart-3)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFigure>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="coverage-people-heading" className="space-y-3">
        <h3 id="coverage-people-heading" className="text-lg font-semibold text-gray-800">
          Health coverage in the scenario, {data.year}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            highlight
            label="People losing Medicaid"
            value={show(losing, formatCount)}
            detail={
              enrolled === null
                ? 'Adults covered through expansion'
                : `Of ${formatCount(enrolled)} enrolled through expansion under current law`
            }
          />
          <StatCard
            label="In the coverage gap"
            value={show(below, formatCount)}
            detail={withShare(below, 'income below the poverty line, with no subsidized marketplace option')}
          />
          <StatCard
            label="Income at or above the poverty line (may qualify for marketplace subsidies)"
            value={show(above, formatCount)}
            detail={withShare(above, '') || undefined}
          />
          <StatCard
            label="Gaining a premium tax credit"
            value={show(gaining, formatCount)}
            detail="People losing Medicaid whose premium tax credit rises, allowing for those who do not enroll"
          />
        </div>
      </section>

      <Callout>
        Adults with income below the poverty line do not qualify for marketplace premium tax credits,
        so in this scenario they lose Medicaid without a subsidized alternative. Adults at or above
        the poverty line may qualify for premium tax credits to buy marketplace coverage.
      </Callout>
    </div>
  );
}
