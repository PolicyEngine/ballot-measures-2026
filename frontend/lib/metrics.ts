/**
 * metrics.csv keys (scripts/DATA_SCHEMA.md), grouped by measure kind, and
 * the helpers that turn them into headline figures and model-vs-official
 * comparisons.
 *
 * Units: dollar amounts are annual dollars; `*_rate` values are percents
 * (12.3 = 12.3%); `*_rate_change` values are percentage points;
 * `*_percent_change` values are percents of the baseline rate. Budget
 * figures are signed from the government's side: a positive
 * `state_budget_impact` means the state gains revenue or spends less.
 */

import { formatCompactUSD, formatCount, formatUSDRange } from './format';
import { metric } from './results';
import type { Measure, MeasureKind, OfficialEstimate } from './registry';

export const CORE_METRICS = {
  households: 'households',
  sampleHouseholds: 'sample_households',
  effectiveSampleHouseholds: 'effective_sample_households',
  affectedSampleHouseholds: 'affected_sample_households',
  effectiveAffectedSampleHouseholds: 'effective_affected_sample_households',
  netIncomeChangeTotal: 'net_income_change_total',
  avgHouseholdNetIncomeChange: 'avg_household_net_income_change',
  winners: 'winners',
  losers: 'losers',
  winnersRate: 'winners_rate',
  losersRate: 'losers_rate',
  avgGain: 'avg_gain',
  avgLoss: 'avg_loss',
  peopleLiftedOutOfPoverty: 'people_lifted_out_of_poverty',
  peoplePushedIntoPoverty: 'people_pushed_into_poverty',
  childrenLiftedOutOfPoverty: 'children_lifted_out_of_poverty',
  childrenPushedIntoPoverty: 'children_pushed_into_poverty',
  stateRevenueImpact: 'state_revenue_impact',
  stateSpendingImpact: 'state_spending_impact',
  stateBudgetImpact: 'state_budget_impact',
  federalRevenueImpact: 'federal_revenue_impact',
  federalSpendingImpact: 'federal_spending_impact',
  federalBudgetImpact: 'federal_budget_impact',
  targetChange: 'target_change',
} as const;

export const POVERTY_MEASURES = [
  { key: 'poverty', label: 'Poverty' },
  { key: 'child_poverty', label: 'Child poverty' },
  { key: 'deep_poverty', label: 'Deep poverty' },
  { key: 'deep_child_poverty', label: 'Deep child poverty' },
] as const;

export type PovertyMeasure = (typeof POVERTY_MEASURES)[number]['key'];
export type PovertySuffix = 'baseline_rate' | 'reform_rate' | 'rate_change' | 'percent_change';

export const povertyMetric = (measure: PovertyMeasure, suffix: PovertySuffix): string =>
  `${measure}_${suffix}`;

export const INCOME_TAX_METRICS = {
  taxUnitsPayingMore: 'tax_units_paying_more',
  taxUnitsPayingLess: 'tax_units_paying_less',
  avgTaxChangePayingMore: 'avg_tax_change_paying_more',
  avgTaxChangePayingLess: 'avg_tax_change_paying_less',
  revenueShareAgi1mPlus: 'revenue_share_agi_1m_plus',
  baselineStateIncomeTax: 'baseline_state_income_tax',
  /** State revenue change scaled to IRS top-income coverage (methodology tab only). */
  revenueCoverageScaled: 'revenue_coverage_scaled',
} as const;

export const TABOR_REFUND_METRICS = {
  refundTotalBaseline: 'refund_total_baseline',
  refundRecipientsBaseline: 'refund_recipients_baseline',
  avgRefundBaseline: 'avg_refund_baseline',
} as const;

export const SCHOOL_MEALS_METRICS = {
  k12ChildrenModel: 'k12_children_model',
  childrenNewlyFreeModel: 'children_newly_free_model',
  mealValueChangeModel: 'meal_value_change_model',
  mealValueChangeAdjustedLow: 'meal_value_change_adjusted_low',
  mealValueChangeAdjustedHigh: 'meal_value_change_adjusted_high',
  stateCostAdjustedLow: 'state_cost_adjusted_low',
  stateCostAdjustedHigh: 'state_cost_adjusted_high',
  stateCostBienniumLow: 'state_cost_biennium_low',
  stateCostBienniumHigh: 'state_cost_biennium_high',
  /** The participation-adjusted midpoint plus administration (scripts/DATA_SCHEMA.md). */
  stateCostCentral: 'state_cost_central',
  stateCostBienniumCentral: 'state_cost_biennium_central',
  participationLunch: 'participation_lunch',
  participationBreakfast: 'participation_breakfast',
  enrollmentScale: 'enrollment_scale',
} as const;

export const MEDICAID_METRICS = {
  peopleLosingMedicaid: 'people_losing_medicaid',
  losingBelow100fpl: 'losing_below_100fpl',
  losing100PlusFpl: 'losing_100_plus_fpl',
  gainingPtc: 'gaining_ptc',
  medicaidCostChange: 'medicaid_cost_change',
  medicaidStateCostChange: 'medicaid_state_cost_change',
  medicaidFederalCostChange: 'medicaid_federal_cost_change',
  ptcChange: 'ptc_change',
  baselineExpansionEnrollees: 'baseline_expansion_enrollees',
  /** Department of Social Services expansion enrollment the counts are calibrated to. */
  adminExpansionEnrollees: 'admin_expansion_enrollees',
  /** admin ÷ model expansion enrollment; multiplies every calibrated count and cost. */
  enrollmentCalibrationFactor: 'enrollment_calibration_factor',
} as const;

/** The uncalibrated twin of a calibrated metric (SD publishes both). */
export const modelMetric = (name: string): string => `${name}_model`;

/** Every kind-specific key, for checks and downloads. */
export const KIND_METRICS: Record<MeasureKind, readonly string[]> = {
  income_tax: Object.values(INCOME_TAX_METRICS),
  tabor_refund: Object.values(TABOR_REFUND_METRICS),
  school_meals: Object.values(SCHOOL_MEALS_METRICS),
  medicaid: Object.values(MEDICAID_METRICS),
};

export type Metrics = Record<string, number> | null | undefined;

/** A metric or its `_low`/`_high` pair, as a range; null when neither exists. */
/**
 * North Dakota's central state cost, per year and per two-year budget:
 * state_cost_central and state_cost_biennium_central, or, before the
 * pipeline publishes them, minus state_budget_impact and twice that.
 */
export function stateCostCentral(metrics: Metrics): { annual: number | null; biennium: number | null } {
  const budget = metric(metrics, CORE_METRICS.stateBudgetImpact);
  const annual = metric(metrics, SCHOOL_MEALS_METRICS.stateCostCentral) ?? (budget === null ? null : -budget);
  const biennium =
    metric(metrics, SCHOOL_MEALS_METRICS.stateCostBienniumCentral) ?? (annual === null ? null : 2 * annual);
  return { annual, biennium };
}

export function metricRange(metrics: Metrics, name: string): { low: number; high: number } | null {
  const single = metric(metrics, name);
  if (single !== null) return { low: single, high: single };
  const low = metric(metrics, `${name}_low`);
  const high = metric(metrics, `${name}_high`);
  if (low === null && high === null) return null;
  return { low: low ?? (high as number), high: high ?? (low as number) };
}

// ── Model vs official estimates ─────────────────────────────────────────

export type EstimatePosition = 'below' | 'within' | 'above' | 'equal';

export interface EstimateComparison {
  estimate: OfficialEstimate;
  model: { low: number; high: number } | null;
  /** Model midpoint as a percent of the official midpoint. */
  ratioPercent: number | null;
  /** Where the model midpoint falls relative to the official range. */
  position: EstimatePosition | null;
  /**
   * When a model range overlaps an official range but its midpoint falls
   * outside it: which end lies within ("high", "low"), or "spans" when the
   * model range contains the official one.
   */
  overlap: 'high' | 'low' | 'spans' | null;
}

const mid = (r: { low: number; high: number }) => (r.low + r.high) / 2;

export function compareEstimate(estimate: OfficialEstimate, metrics: Metrics): EstimateComparison {
  const model = metricRange(metrics, estimate.metric);
  if (!model) return { estimate, model: null, ratioPercent: null, position: null, overlap: null };
  const official = mid(estimate);
  const m = mid(model);
  const ratioPercent = official !== 0 ? (m / official) * 100 : null;
  const [lo, hi] = [Math.min(estimate.low, estimate.high), Math.max(estimate.low, estimate.high)];
  const position: EstimatePosition =
    lo === hi
      ? m === lo
        ? 'equal'
        : m < lo
          ? 'below'
          : 'above'
      : m < lo
        ? 'below'
        : m > hi
          ? 'above'
          : 'within';
  const inside = (v: number) => v >= lo && v <= hi;
  const overlap =
    lo === hi || model.low === model.high || position === 'within'
      ? null
      : inside(model.high) && !inside(model.low)
        ? 'high'
        : inside(model.low) && !inside(model.high)
          ? 'low'
          : model.low < lo && model.high > hi
            ? 'spans'
            : null;
  return { estimate, model, ratioPercent, position, overlap };
}

/**
 * Format an official estimate or a model value in the estimate's unit.
 * Official figures keep their stated precision; `model` rounds dollar
 * amounts to three significant digits.
 */
export function formatEstimateValue(
  range: { low: number; high: number },
  unit: OfficialEstimate['unit'],
  options: { sign?: boolean; model?: boolean } = {},
): string {
  if (unit === 'people') {
    return range.low === range.high
      ? formatCount(range.low)
      : `${formatCount(range.low)} to ${formatCount(range.high)}`;
  }
  if (range.low === range.high) {
    return formatCompactUSD(range.low, { precise: true, sig3: options.model, sign: options.sign });
  }
  return formatUSDRange(range.low, range.high, true, options.model);
}

// ── Headline figures (landing cards and the measure hero) ───────────────

export interface Headline {
  /** What the figure measures, sentence case. */
  label: string;
  /** PolicyEngine's figure, formatted; null until results exist. */
  model: string | null;
  /** The comparable official estimate, formatted; null when there is none. */
  official: string | null;
  /** Source and period of the official estimate. */
  officialSource: string | null;
  /** The official estimate's source alone, for one-line card details. */
  officialShortSource: string | null;
  /** Label for the official figure when it measures something else. */
  officialLabel: string;
}

function officialFor(m: Measure, metricName: string): OfficialEstimate | null {
  return (
    m.official_estimates.find(
      (e) => e.model_year === m.headline_year && e.metric === metricName,
    ) ??
    m.official_estimates.find((e) => e.metric === metricName) ??
    null
  );
}

/** Shorter source names for cards. */
export function shortSource(source: string): string {
  return source
    .replace(/^Colorado Legislative Council Staff, /, 'Legislative Council Staff, ')
    .replace(/^Washington Office of Financial Management$/, 'Office of Financial Management')
    .replace(/^California Legislative Analyst's Office$/, "Legislative Analyst's Office")
    .replace(/^North Dakota Secretary of State, /, 'Secretary of State, ')
    .replace(/^South Dakota Secretary of State, /, 'Secretary of State, ')
    .replace(/^South Dakota Department of Social Services, /, 'Department of Social Services, ');
}

/** The headline figure for a measure's headline year. */
export function headlineFor(m: Measure, metrics: Metrics): Headline {
  const year = m.headline_year;
  const withOfficial = (
    label: string,
    model: string | null,
    officialMetric: string,
    officialLabel = 'Official estimate',
    sign = false,
  ): Headline => {
    const estimate = officialFor(m, officialMetric);
    return {
      label,
      model,
      official: estimate ? formatEstimateValue(estimate, estimate.unit, { sign }) : null,
      officialSource: estimate ? `${shortSource(estimate.source)}, ${estimate.period}` : null,
      officialShortSource: estimate ? shortSource(estimate.source) : null,
      officialLabel,
    };
  };

  switch (m.kind) {
    case 'income_tax': {
      const v = metric(metrics, CORE_METRICS.stateBudgetImpact);
      return withOfficial(
        `Change in state revenue, ${year}`,
        v === null ? null : formatCompactUSD(v, { sign: true, sig3: true }),
        CORE_METRICS.stateBudgetImpact,
        'Official estimate',
        true,
      );
    }
    case 'tabor_refund': {
      const v = metric(metrics, CORE_METRICS.stateBudgetImpact);
      return withOfficial(
        `Sales tax refunds not paid, ${year}`,
        v === null ? null : formatCompactUSD(v, { sig3: true }),
        CORE_METRICS.stateBudgetImpact,
      );
    }
    case 'school_meals': {
      // One central figure; the low and high cases appear on the Methods tab.
      const { biennium } = stateCostCentral(metrics);
      return withOfficial(
        'State cost per two-year budget',
        biennium === null ? null : formatCompactUSD(biennium, { sig3: true }),
        'state_cost_biennium',
      );
    }
    case 'medicaid': {
      const v = metric(metrics, MEDICAID_METRICS.peopleLosingMedicaid);
      // Prefer the administrative enrollment count over the pamphlet's figure.
      const officialMetric = officialFor(m, MEDICAID_METRICS.adminExpansionEnrollees)
        ? MEDICAID_METRICS.adminExpansionEnrollees
        : MEDICAID_METRICS.baselineExpansionEnrollees;
      return withOfficial(
        `People losing Medicaid in the scenario, ${year}`,
        v === null ? null : formatCount(v),
        officialMetric,
        'Enrolled through expansion',
      );
    }
  }
}
