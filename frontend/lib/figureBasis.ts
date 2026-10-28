/**
 * What each figure on the dashboard is based on, for the Methods tab's
 * "How these figures are produced" table.
 *
 * - model: PolicyEngine's output as is (the income tax measures, and every
 *   household-calculator result).
 * - calibrated: model output adjusted to administrative data after the run
 *   (North Dakota: public enrollment and meal participation; South Dakota:
 *   the Department of Social Services' expansion enrollment).
 * - forecast: model output with a forecast input (Proposition NN's
 *   current-law refund amounts come from the Legislative Council Staff
 *   September 2026 forecast).
 * - adjusted: poverty figures, whose SPM resources add income the released
 *   model omits (policyengine-us#9919).
 *
 * Every number in the table comes from metrics.csv; none is typed in.
 */

import { formatCompactUSD, formatCount } from './format';
import {
  MEDICAID_METRICS as MC,
  SCHOOL_MEALS_METRICS as SM,
  type Metrics,
} from './metrics';
import type { Measure } from './registry';
import { metric } from './results';

export type FigureBasis = 'model' | 'calibrated' | 'forecast' | 'adjusted';

export const BASIS_LABELS: Record<FigureBasis, string> = {
  model: 'Model estimate',
  calibrated: 'Calibrated',
  forecast: 'Forecast input',
  adjusted: 'Adjusted',
};

/** Id of the Methods tab's "How these figures are produced" section. */
export const FIGURE_BASIS_ID = 'figure-basis';

/** Basis of a measure's headline and statewide figures. */
export function measureBasis(m: Pick<Measure, 'kind'>): FigureBasis {
  switch (m.kind) {
    case 'school_meals':
    case 'medicaid':
      return 'calibrated';
    case 'tabor_refund':
      return 'forecast';
    default:
      return 'model';
  }
}

export const FORECAST_INPUT_NOTE =
  'Current-law refund amounts come from the Legislative Council Staff’s September 2026 forecast.';

export const SPM_ADJUSTMENT_NOTE =
  'Poverty figures add partnership and S corporation income, farm rental income and the Alaska Permanent Fund dividend to SPM resources, which the released model omits (policyengine-us#9919).';

const usd = (v: number) => formatCompactUSD(v, { sig3: true });

export interface BasisRow {
  figure: string;
  bases: FigureBasis[];
  /** The factor or source, numbers read from the data. */
  source: string;
}

const pct = (v: number | null) => (v === null ? null : `${Math.round((Math.abs(v) <= 1.5 ? v * 100 : v) * 10) / 10}%`);

/** Rows of the Methods tab's "How these figures are produced" table. */
export function figureBasisRows(
  m: Pick<Measure, 'kind'>,
  metrics: Metrics,
  spmAdjusted: boolean,
): BasisRow[] {
  const poverty: BasisRow[] = spmAdjusted
    ? [{ figure: 'Poverty', bases: ['adjusted'], source: SPM_ADJUSTMENT_NOTE }]
    : [];
  switch (m.kind) {
    case 'income_tax':
      return [
        {
          figure: 'Revenue change, households gaining and losing, income deciles',
          bases: ['model'],
          source: 'PolicyEngine microsimulation (policyengine-us), no calibration after the run',
        },
        ...poverty,
        {
          figure: 'Household calculator',
          bases: ['model'],
          source: 'The model’s own per-household calculation, no calibration',
        },
      ];
    case 'tabor_refund':
      return [
        {
          figure: 'Sales tax refunds not paid, refunds under current law, state budget',
          bases: ['forecast'],
          source: `${FORECAST_INPUT_NOTE.replace(/\.$/, '')}: the six-tier amounts and income thresholds for tax years 2027 and 2028`,
        },
        {
          figure: 'Household net income changes, deciles, households gaining and losing',
          bases: ['forecast'],
          source: 'The same forecast refund amounts, applied to every household in the model',
        },
        ...poverty,
        {
          figure: 'Household calculator',
          bases: ['forecast'],
          source: 'The same forecast refund amounts; the model’s own per-household calculation, no calibration',
        },
      ];
    case 'school_meals': {
      const scale = metric(metrics, SM.enrollmentScale);
      const lunch = pct(metric(metrics, SM.participationLunch));
      const breakfast = pct(metric(metrics, SM.participationBreakfast));
      const unadjusted = metric(metrics, SM.mealValueChangeModel);
      const students = metric(metrics, SM.childrenNewlyFreeModel);
      const scaleText = scale === null ? 'scaled to public school enrollment' : `×${scale.toFixed(3)} to public school enrollment`;
      return [
        {
          figure: 'State cost (per year and per two-year budget, low and high cases), value of meals to families',
          bases: ['calibrated'],
          source: [
            scaleText,
            lunch && breakfast ? `current participation ${lunch} at lunch and ${breakfast} at breakfast (low case)` : null,
            unadjusted === null ? null : `model before calibration ${usd(unadjusted)} a year`,
          ]
            .filter(Boolean)
            .join('; '),
        },
        {
          figure: 'Students newly qualifying for free meals',
          bases: ['calibrated'],
          source: [scaleText, students === null ? null : `model count ${formatCount(students)}`]
            .filter(Boolean)
            .join('; '),
        },
        {
          figure: 'Household gains: deciles, households gaining and losing, income bands',
          bases: ['calibrated'],
          source: 'The participation-adjusted midpoint of the low and high cases',
        },
        ...(spmAdjusted
          ? [
              {
                figure: 'Poverty',
                bases: ['calibrated', 'adjusted'] as FigureBasis[],
                source: `The participation-adjusted midpoint. ${SPM_ADJUSTMENT_NOTE}`,
              },
            ]
          : []),
        {
          figure: 'Household calculator',
          bases: ['model'],
          source: 'Assumes each child eats school breakfast and lunch every school day; no calibration',
        },
      ];
    }
    case 'medicaid': {
      const factor = metric(metrics, MC.enrollmentCalibrationFactor);
      const admin = metric(metrics, MC.adminExpansionEnrollees);
      const model = metric(metrics, MC.baselineExpansionEnrollees);
      const scaling =
        factor === null
          ? 'Not calibrated in these results'
          : [
              `×${factor.toFixed(3)}`,
              admin === null ? null : `to the Department of Social Services’ ${formatCount(admin)} expansion enrollees`,
              model === null ? null : `(model count ${formatCount(model)})`,
            ]
              .filter(Boolean)
              .join(' ');
      return [
        {
          figure: 'People losing Medicaid, in the coverage gap, at or above the poverty line, gaining a premium tax credit',
          bases: factor === null ? ['model'] : ['calibrated'],
          source: scaling,
        },
        {
          figure: 'State and federal Medicaid spending, premium tax credits, budget impacts',
          bases: factor === null ? ['model'] : ['calibrated'],
          source: scaling,
        },
        {
          figure: 'Household calculator',
          bases: ['model'],
          source: 'The model’s Medicaid eligibility and marketplace coverage rules; no calibration',
        },
      ];
    }
    default:
      return [];
  }
}
