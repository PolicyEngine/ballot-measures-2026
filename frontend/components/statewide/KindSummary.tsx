'use client';

/**
 * Headline cards and budget detail for each measure kind. Household gains
 * and losses use the gain (green) and loss (red) card styles; budget
 * figures stay neutral, since a change in state revenue or spending is not
 * a gain or loss to a household.
 */

import {
  formatCompactCount,
  formatCompactUSD,
  formatCount,
  formatPercent,
  formatShare,
  formatUSD,
  formatUSDRange,
  formatUSDWithSign,
} from '@/lib/format';
import {
  CORE_METRICS as C,
  INCOME_TAX_METRICS as IT,
  MEDICAID_METRICS as MC,
  SCHOOL_MEALS_METRICS as SM,
  TABOR_REFUND_METRICS as TR,
  metricRange,
  type Metrics,
} from '@/lib/metrics';
import type { Measure } from '@/lib/registry';
import { metric } from '@/lib/results';
import { MetricCard } from '../ui';

const DASH = '—';

/**
 * Participation rates are fractions in the data contract (0.79 = 79%);
 * read anything above 1.5 as already in percent, in case a run reports it so.
 */
export const asPercent = (v: number) => (Math.abs(v) <= 1.5 ? v * 100 : v);

/** Students newly qualifying for free meals, scaled to public enrollment when the scale exists. */
export function newlyFreeStudents(metrics: Metrics): { scaled: number | null; model: number | null } {
  const model = metric(metrics, SM.childrenNewlyFreeModel);
  const scale = metric(metrics, SM.enrollmentScale);
  return { model, scaled: model !== null && scale !== null ? model * scale : model };
}
const show = (value: number | null, f: (v: number) => string) => (value === null ? DASH : f(value));
// Model estimates: three significant digits.
const money = (v: number) => formatCompactUSD(v, { sig3: true });
const signedMoney = (v: number) => formatCompactUSD(v, { sig3: true, sign: true });
const range = (metrics: Metrics, name: string) => {
  const r = metricRange(metrics, name);
  return r ? formatUSDRange(r.low, r.high, true, true) : DASH;
};

/** Average change in household net income. Statewide headline cards stay
 *  neutral for every measure; gain and loss colors mark individual
 *  households' changes on the household tab. */
function AverageChangeCard({ metrics }: { metrics: Metrics }) {
  const avg = metric(metrics, C.avgHouseholdNetIncomeChange);
  const total = metric(metrics, C.netIncomeChangeTotal);
  return (
    <MetricCard
      label="Average change in household net income"
      value={show(avg, (v) => `${formatUSDWithSign(v)}/year`)}
      detail={total === null ? undefined : `Over all households; ${signedMoney(total)} in total`}
    />
  );
}

/** Shares of households whose net income rises or falls (neutral card). */
function GainingLosingCard({ metrics }: { metrics: Metrics }) {
  const winners = metric(metrics, C.winnersRate);
  const losers = metric(metrics, C.losersRate);
  return (
    <MetricCard
      label="Households gaining / losing"
      value={
        winners === null || losers === null
          ? DASH
          : `${formatPercent(winners)} / ${formatPercent(losers)}`
      }
      detail="Net income up or down by more than $1"
    />
  );
}

export function KindHeadlineCards({ measure, metrics }: { measure: Measure; metrics: Metrics }) {
  const m = metrics;
  switch (measure.kind) {
    case 'income_tax': {
      const more = metric(m, IT.taxUnitsPayingMore);
      const less = metric(m, IT.taxUnitsPayingLess);
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Change in state income tax revenue"
            value={show(metric(m, C.stateBudgetImpact), signedMoney)}
            detail="Positive means the state collects more"
          />
          <GainingLosingCard metrics={m} />
          <MetricCard
            label="Tax units paying more / less"
            value={
              more === null || less === null
                ? DASH
                : `${formatCompactCount(more)} / ${formatCompactCount(less)}`
            }
            detail="Filers and their dependents whose state income tax rises or falls"
          />
        </div>
      );
    }
    case 'tabor_refund': {
      const recipients = metric(m, TR.refundRecipientsBaseline);
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Sales tax refunds not paid"
            value={show(metric(m, C.stateBudgetImpact), money)}
            detail="Revenue the state keeps if the measure passes"
          />
          <AverageChangeCard metrics={m} />
          <MetricCard
            label="Refunds under current law"
            value={show(metric(m, TR.refundTotalBaseline), money)}
            detail={
              recipients === null
                ? undefined
                : `${formatCount(recipients)} recipients; ${show(
                    metric(m, TR.avgRefundBaseline),
                    formatUSD,
                  )} on average`
            }
          />
        </div>
      );
    }
    case 'school_meals': {
      const students = newlyFreeStudents(m);
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="State cost per year"
            value={range(m, 'state_cost_adjusted')}
            detail="Low and high participation cases"
          />
          <MetricCard
            label="Students newly qualifying for free meals"
            value={show(students.scaled, formatCount)}
            detail={
              students.model !== null && students.scaled !== students.model
                ? `Scaled to public school enrollment (model count ${formatCount(students.model)})`
                : 'Students who would pay full or reduced price under current law'
            }
          />
          <MetricCard
            label="Value of meals to families per year"
            value={range(m, 'meal_value_change_adjusted')}
            detail="Low and high participation cases"
          />
        </div>
      );
    }
    case 'medicaid':
      // The Medicaid scenario has its own coverage view (CoverageStatewide).
      return null;
  }
}

export interface DetailRow {
  label: string;
  value: string;
}

/** Kind-specific rows for the budget section's detail table. */
export function kindDetailRows(measure: Measure, metrics: Metrics): DetailRow[] {
  const m = metrics;
  switch (measure.kind) {
    case 'income_tax': {
      const baseline = metric(m, IT.baselineStateIncomeTax);
      const change = metric(m, C.stateRevenueImpact);
      return [
        { label: 'State income tax under current law', value: show(baseline, money) },
        {
          label: 'Change as a share of current-law income tax',
          value:
            baseline && change !== null ? formatPercent((change / baseline) * 100, 1, { sign: true }) : DASH,
        },
        {
          // Exceeds 100% when tax units below $1 million pay less in total.
          label: 'Share of the change from tax units with income of $1 million or more',
          value: show(metric(m, IT.revenueShareAgi1mPlus), (v) => formatShare(v)),
        },
        {
          label: 'Average tax increase, tax units paying more',
          value: show(metric(m, IT.avgTaxChangePayingMore), formatUSDWithSign),
        },
        {
          label: 'Average tax decrease, tax units paying less',
          value: show(metric(m, IT.avgTaxChangePayingLess), formatUSDWithSign),
        },
      ];
    }
    case 'tabor_refund':
      return [
        { label: 'Sales tax refunds under current law', value: show(metric(m, TR.refundTotalBaseline), money) },
        {
          label: 'Recipients under current law',
          value: show(metric(m, TR.refundRecipientsBaseline), formatCount),
        },
        { label: 'Average refund per recipient', value: show(metric(m, TR.avgRefundBaseline), formatUSD) },
      ];
    case 'school_meals':
      return [
        {
          label: 'Value of meals if every student ate both meals every day',
          value: show(metric(m, SM.mealValueChangeModel), money),
        },
        { label: 'Value of meals, participation-adjusted', value: range(m, 'meal_value_change_adjusted') },
        { label: 'State cost per year, participation-adjusted', value: range(m, 'state_cost_adjusted') },
        { label: 'State cost per two-year budget', value: range(m, 'state_cost_biennium') },
        {
          label: 'Lunch participation (share of enrolled students on a typical day)',
          value: show(metric(m, SM.participationLunch), (v) => formatPercent(asPercent(v))),
        },
        {
          label: 'Breakfast participation',
          value: show(metric(m, SM.participationBreakfast), (v) => formatPercent(asPercent(v))),
        },
        {
          label: 'Model children per enrolled student (enrollment scaling)',
          value: show(metric(m, SM.enrollmentScale), (v) => v.toFixed(2)),
        },
      ];
    case 'medicaid':
      return [
        {
          label: 'Change in total Medicaid spending',
          value: show(metric(m, MC.medicaidCostChange), signedMoney),
        },
        { label: 'State share', value: show(metric(m, MC.medicaidStateCostChange), signedMoney) },
        { label: 'Federal share', value: show(metric(m, MC.medicaidFederalCostChange), signedMoney) },
        {
          label: 'Change in marketplace premium tax credits',
          value: show(metric(m, MC.ptcChange), signedMoney),
        },
        {
          label: 'People losing Medicaid whose premium tax credit rises',
          value: show(metric(m, MC.gainingPtc), formatCount),
        },
      ];
  }
}

export { DASH, show, money, signedMoney };
