'use client';

import { getContent } from '@/content/measures';
import { formatCount, formatPercent, formatTimestamp } from '@/lib/format';
import {
  REGISTRY,
  topTailFor,
  useManifest,
  useResultsCsv,
  type Manifest,
  type Measure,
} from '@/lib/measures';
import {
  CORE_METRICS as C,
  MEDICAID_METRICS as MC,
  SCHOOL_MEALS_METRICS as SM,
  INCOME_TAX_METRICS as IT,
  compareEstimate,
  formatEstimateValue,
  modelMetric,
  type EstimateComparison,
} from '@/lib/metrics';
import { STATEWIDE_FILES, metric, metricsFor } from '@/lib/results';
import { SimpleDataTable } from './PolicyOverview';
import { asPercent } from './statewide/KindSummary';
import { Callout, CompareTable, ExternalLink } from './ui';

const DASH = '—';

const POSITION_TEXT = {
  below: 'below',
  above: 'above',
  within: 'within',
  equal: 'equal to',
} as const;

function differenceText(c: EstimateComparison): string {
  if (!c.model || c.position === null) return DASH;
  const official = c.estimate;
  const range = official.low !== official.high;
  if (range) return `${POSITION_TEXT[c.position]} the official range`;
  if (c.ratioPercent === null) return DASH;
  return `${formatPercent(c.ratioPercent, 0)} of the official figure`;
}

/** "Before calibration: 55,952" under a calibrated figure (SD publishes `<metric>_model`). */
function ModelBeforeCalibration({
  metrics,
  name,
  unit,
}: {
  metrics: Record<string, number> | null;
  name: string;
  unit: 'usd' | 'people';
}) {
  const raw = metric(metrics, modelMetric(name));
  if (raw === null || metric(metrics, MC.enrollmentCalibrationFactor) === null) return null;
  return (
    <span className="block text-xs font-normal text-gray-500">
      Before calibration: {formatEstimateValue({ low: raw, high: raw }, unit, { sign: raw < 0, model: true })}
    </span>
  );
}

/**
 * Rows of the model-vs-calibrated table: the model value's key and the
 * calibrated value's key (scripts/DATA_SCHEMA.md: calibrated keys keep their
 * unscaled value under `<key>_model`; enrollment pairs the model's own count
 * with the administrative one).
 */
const CALIBRATION_ROWS: { label: string; model: string; calibrated: string; unit: 'usd' | 'people' }[] = [
  {
    label: 'Enrolled through expansion under current law',
    model: MC.baselineExpansionEnrollees,
    calibrated: MC.adminExpansionEnrollees,
    unit: 'people',
  },
  ...(
    [
      [MC.peopleLosingMedicaid, 'People losing Medicaid', 'people'],
      [MC.losingBelow100fpl, 'In the coverage gap (income below the poverty line)', 'people'],
      [MC.losing100PlusFpl, 'Income at or above the poverty line', 'people'],
      [MC.gainingPtc, 'Gaining a premium tax credit', 'people'],
      [MC.medicaidCostChange, 'Change in Medicaid spending', 'usd'],
      [MC.medicaidStateCostChange, 'State share', 'usd'],
      [MC.medicaidFederalCostChange, 'Federal share', 'usd'],
      [MC.ptcChange, 'Change in premium tax credits', 'usd'],
      [C.stateBudgetImpact, 'State budget impact', 'usd'],
      [C.federalBudgetImpact, 'Federal budget impact', 'usd'],
    ] as const
  ).map(([key, label, unit]) => ({ label, model: modelMetric(key), calibrated: key, unit })),
];

/** Model vs calibrated values for the Medicaid scenario; null until the pipeline publishes them. */
export function CalibrationTable({ metrics }: { metrics: Record<string, number> | null }) {
  const factor = metric(metrics, MC.enrollmentCalibrationFactor);
  if (factor === null) return null;
  const admin = metric(metrics, MC.adminExpansionEnrollees);
  const fmt = (v: number | null, unit: 'usd' | 'people') =>
    v === null ? DASH : formatEstimateValue({ low: v, high: v }, unit, { sign: unit === 'usd' && v !== 0, model: true });
  const rows = CALIBRATION_ROWS.filter(
    (r) => metric(metrics, r.model) !== null || metric(metrics, r.calibrated) !== null,
  ).map((r) => ({
    label: r.label,
    values: [fmt(metric(metrics, r.model), r.unit), fmt(metric(metrics, r.calibrated), r.unit)],
  }));
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700">
        PolicyEngine&apos;s model counts more adults enrolled through expansion than the state
        reports, so the coverage and budget figures on these pages are scaled to the Department of
        Social Services&apos; enrollment
        {admin !== null ? ` (${formatCount(admin)} people)` : ''}: a calibration factor of{' '}
        {factor.toFixed(3)}. Household-level figures are not scaled.
      </p>
      <CompareTable
        caption="Model and calibrated values"
        firstColumn="Measure"
        columns={['Model', 'Calibrated to enrollment']}
        rows={rows}
      />
    </div>
  );
}

/**
 * Official figures the model is calibrated to: compare them with the
 * model's own value instead (enrollment calibrated to administrative data
 * matches it by construction).
 */
const CALIBRATION_TARGETS: Record<string, string> = {
  [MC.adminExpansionEnrollees]: MC.baselineExpansionEnrollees,
};

/** Model vs official estimates, one row per official estimate. */
export function ValidationTable({
  measure,
  metricsByYear,
}: {
  measure: Measure;
  metricsByYear: Record<number, Record<string, number> | null>;
}) {
  const rows = measure.official_estimates.map((e) => {
    const target = CALIBRATION_TARGETS[e.metric];
    const metrics = metricsByYear[e.model_year] ?? null;
    const comparison = compareEstimate(target ? { ...e, metric: target } : e, metrics);
    // Enrollment rows compare the model's own count, before calibration.
    const calibrated = metric(metrics, MC.enrollmentCalibrationFactor) !== null;
    const calibrationNote = target
      ? 'Model before calibration; the dashboard scales its counts and costs to this figure'
      : calibrated && e.metric === MC.baselineExpansionEnrollees
        ? 'Model before calibration to the Department of Social Services’ enrollment'
        : null;
    return { ...comparison, estimate: e, calibrationNote };
  });
  if (rows.length === 0) {
    return <p className="text-sm text-gray-600">No official estimate has been published for this measure.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-sm font-semibold text-gray-800 mb-2">
          PolicyEngine and official estimates
        </caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="text-left py-2 pr-3 font-medium text-gray-600">Official source and period</th>
            <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Official estimate</th>
            <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">PolicyEngine</th>
            <th scope="col" className="text-left py-2 px-3 font-medium text-gray-600">Comparison</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 align-top">
          {rows.map((c, i) => (
            <tr key={`${c.estimate.source}-${c.estimate.period}-${i}`}>
              <th scope="row" className="text-left py-3 pr-3 font-normal text-gray-800">
                <ExternalLink href={c.estimate.url}>{c.estimate.source}</ExternalLink>
                <span className="block text-xs text-gray-500 mt-0.5">{c.estimate.period}</span>
                {c.estimate.note && (
                  <span className="block text-xs text-gray-500 mt-1">{c.estimate.note}</span>
                )}
              </th>
              <td className="py-3 px-3 text-right tabular-nums text-gray-800 whitespace-nowrap">
                {formatEstimateValue(c.estimate, c.estimate.unit, { sign: c.estimate.low < 0 })}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">
                {c.model
                  ? formatEstimateValue(c.model, c.estimate.unit, { sign: c.model.low < 0, model: true })
                  : 'Pending'}
                <span className="block text-xs font-normal text-gray-500">{c.estimate.model_year}</span>
                <ModelBeforeCalibration
                  metrics={metricsByYear[c.estimate.model_year] ?? null}
                  name={c.estimate.metric}
                  unit={c.estimate.unit}
                />
              </td>
              <td className="py-3 px-3 text-gray-700">
                {differenceText(c)}
                {c.calibrationNote && (
                  <span className="block text-xs text-gray-500 mt-0.5">{c.calibrationNote}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SampleSizes({
  measure,
  metricsByYear,
}: {
  measure: Measure;
  metricsByYear: Record<number, Record<string, number> | null>;
}) {
  const show = (v: number | null) => (v === null ? DASH : formatCount(v));
  return (
    <CompareTable
      caption="Survey households behind the estimates"
      firstColumn="Households"
      columns={measure.years.map(String)}
      rows={[
        {
          label: `Sampled in ${measure.state_name}`,
          values: measure.years.map((y) => show(metric(metricsByYear[y], C.sampleHouseholds))),
        },
        {
          label: 'Effective sample size',
          values: measure.years.map((y) => show(metric(metricsByYear[y], C.effectiveSampleHouseholds))),
        },
        {
          label: 'Sampled households the measure affects',
          values: measure.years.map((y) => show(metric(metricsByYear[y], C.affectedSampleHouseholds))),
        },
        {
          label: 'Effective sample size, affected households',
          values: measure.years.map((y) =>
            show(metric(metricsByYear[y], C.effectiveAffectedSampleHouseholds)),
          ),
        },
      ]}
    />
  );
}

function KindMethodology({
  measure,
  metrics,
}: {
  measure: Measure;
  metrics: Record<string, number> | null;
}) {
  switch (measure.kind) {
    case 'school_meals': {
      const unadjusted = metric(metrics, SM.mealValueChangeModel);
      const lunch = metric(metrics, SM.participationLunch);
      const breakfast = metric(metrics, SM.participationBreakfast);
      const scale = metric(metrics, SM.enrollmentScale);
      return (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>Participation adjustment.</strong>{' '}
            PolicyEngine values each meal a student would newly receive free and, by default,
            assumes every child aged 5 to 17 eats breakfast and lunch on each of 180 school days.
            Not every student does, so the statewide figures scale
            the model to public school enrollment (excluding schools that already serve every meal
            free) and to the meals served per enrolled student on a typical day, from federal
            average daily participation data. The low case keeps today&apos;s participation; the
            high case adds the increase the Department of Public Instruction assumed from states
            that serve every student free (9 percentage points for lunch, 12 for breakfast). The
            midpoint drives the statewide charts and poverty figures.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Value of newly free meals if every student ate both meals daily:{' '}
              {unadjusted === null
                ? DASH
                : formatEstimateValue({ low: unadjusted, high: unadjusted }, 'usd', { model: true })}
            </li>
            <li>Lunch participation: {lunch === null ? DASH : formatPercent(asPercent(lunch))}</li>
            <li>Breakfast participation: {breakfast === null ? DASH : formatPercent(asPercent(breakfast))}</li>
            <li>Enrollment scaling factor: {scale === null ? DASH : scale.toFixed(3)}</li>
          </ul>
        </div>
      );
    }
    case 'medicaid': {
      const enrolledModel =
        metric(metrics, modelMetric(MC.baselineExpansionEnrollees)) ??
        metric(metrics, MC.baselineExpansionEnrollees);
      const total = metric(metrics, MC.medicaidCostChange);
      const state = metric(metrics, MC.medicaidStateCostChange);
      const usd = (v: number) => formatEstimateValue({ low: v, high: v }, 'usd', { model: true });
      return (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>People rather than net income.</strong> PolicyEngine values Medicaid at its
            average cost per enrollee, the same for every adult, while marketplace premium tax
            credits rise with age. A net-income comparison would therefore show some adults gaining
            when they move from Medicaid to marketplace coverage, so this scenario is reported in
            people, premiums and government spending. None of these figures reflect differences in
            cost sharing or access to care.
          </p>
          <p>
            <strong>Expansion enrollment.</strong>{' '}
            {`The model counts ${enrolledModel === null ? 'a pending number of' : formatCount(enrolledModel)} people enrolled through expansion under current law.`}{' '}
            The Department of Social Services reports an average of 29,055 a month in state fiscal
            year 2025, and the ballot pamphlet&apos;s statements cite about 30,000.
          </p>
          <CalibrationTable metrics={metrics} />
          {total !== null && (
            <p>
              <strong>Expansion costs.</strong>{' '}
              {metric(metrics, MC.enrollmentCalibrationFactor) !== null
                ? 'After calibration to enrollment, Medicaid'
                : 'Medicaid'}{' '}
              spending on the expansion group is {usd(Math.abs(total))} a year
              {state !== null ? `, of which the state pays ${usd(Math.abs(state))} at today's 10% share` : ''}.
              The state spending change on the statewide tab compares the scenario with current
              law at that 10% share. Each 10-percentage-point drop in the federal share would shift
              about {usd(Math.abs(total) * 0.1)} a year of that spending to the state if expansion
              continued.
            </p>
          )}
        </div>
      );
    }
    case 'tabor_refund':
      return (
        <p className="text-sm text-gray-700">
          <strong>Refund tiers.</strong> Current law in the model uses the six-tier refund amounts
          and income thresholds from the Legislative Council Staff September 2026 forecast for tax
          years 2027 and 2028, applied to both simulations. Refunds are claimed per qualifying
          adult, so a joint return receives two.
        </p>
      );
    case 'income_tax':
      return (
        <p className="text-sm text-gray-700">
          <strong>Top incomes.</strong>{' '}
          Changes in tax on high incomes drive this measure&apos;s revenue. The few sampled
          households at the top carry large weights, so the comparison with IRS data and the
          effective sample sizes above are the best guides to the estimate&apos;s precision.
        </p>
      );
  }
}

const SOI_ROWS: { key: string; label: string; money: boolean }[] = [
  { key: 'returns_500k_1m', label: 'Returns with income of $500,000 to $1 million', money: false },
  { key: 'agi_500k_1m', label: 'Adjusted gross income of those returns', money: true },
  { key: 'returns_1m_plus', label: 'Returns with income of $1 million or more', money: false },
  { key: 'agi_1m_plus', label: 'Adjusted gross income of $1 million-plus returns', money: true },
  { key: 'agi_above_1m', label: 'Income above $1 million', money: true },
];

/** Model filers vs IRS Statistics of Income at the top, and the coverage-scaled revenue. */
export function TopTailComparison({
  measure,
  year,
  manifest,
  metrics,
}: {
  measure: Measure;
  year: number;
  manifest: Manifest | null | undefined;
  /** The measure-year's metrics.csv values (revenue_coverage_scaled, soi_coverage_*). */
  metrics?: Record<string, number> | null;
}) {
  if (measure.kind !== 'income_tax') return null;
  const state = topTailFor(manifest?.top_tail, measure.state);
  // Revenue: the model's change and the coverage-scaled one, from metrics.csv
  // (older manifests carried them per measure-year under top_tail).
  const fromManifest = state?.measures?.[`${measure.slug}:${year}`];
  const scaled = metric(metrics, IT.revenueCoverageScaled) ?? fromManifest?.coverage_scaled_revenue_change ?? null;
  const revenue =
    metric(metrics, C.stateRevenueImpact) ?? metric(metrics, C.stateBudgetImpact) ?? fromManifest?.revenue_change ?? null;
  const returnsRatio = metric(metrics, 'soi_coverage_returns_1m_plus') ?? state?.coverage?.returns_1m_plus ?? null;
  const incomeRatio = metric(metrics, 'soi_coverage_agi_above_1m') ?? state?.coverage?.agi_above_1m ?? null;
  if (!state && scaled === null && returnsRatio === null) return null;

  const fmt = (v: number | undefined, money: boolean) =>
    v === undefined || !Number.isFinite(v)
      ? DASH
      : money
        ? formatEstimateValue({ low: v, high: v }, 'usd')
        : formatCount(v);
  const usd = (v: number) => formatEstimateValue({ low: v, high: v }, 'usd', { sign: true, model: true });
  const filerYear = state?.filer_year ?? state?.model_year;
  return (
    <section aria-labelledby="top-tail-heading" className="space-y-3">
      <h3 id="top-tail-heading" className="text-lg font-semibold text-gray-900">
        Top incomes compared with IRS data
      </h3>
      {state ? (
        <CompareTable
          caption={`${measure.state_name} filers: model (${filerYear ?? 'model'} data) and IRS Statistics of Income (${state.soi_year})`}
          firstColumn="Filers"
          columns={['Model', 'IRS', 'Model ÷ IRS']}
          rows={SOI_ROWS.map((r) => ({
            label: r.label,
            values: [
              fmt(state.model_filers?.[r.key], r.money),
              fmt(state.soi?.[r.key], r.money),
              state.coverage?.[r.key] === undefined ? DASH : formatPercent(state.coverage[r.key] * 100, 0),
            ],
          }))}
        />
      ) : (
        <CompareTable
          caption={`${measure.state_name} filers: model ÷ IRS Statistics of Income`}
          firstColumn="Filers"
          columns={['Model ÷ IRS']}
          rows={[
            {
              label: 'Returns with income of $1 million or more',
              values: [returnsRatio === null ? DASH : formatPercent(returnsRatio * 100, 0)],
            },
            {
              label: 'Income above $1 million',
              values: [incomeRatio === null ? DASH : formatPercent(incomeRatio * 100, 0)],
            },
          ]}
        />
      )}
      {scaled !== null && revenue !== null && (
        <p className="text-sm text-gray-700">
          The model&apos;s revenue change for {year} is <strong>{usd(revenue)}</strong>. Scaling the
          change in each income band so the model&apos;s top-income returns and income match the IRS
          figures gives <strong>{usd(scaled)}</strong>. The scaled figure is an adjustment for
          comparison, not a separate simulation; the dashboard&apos;s headline figures are the
          model&apos;s own.
        </p>
      )}
    </section>
  );
}

function overrideLines(overrides: Measure['reform_overrides']): string[] {
  return Object.entries(overrides).flatMap(([path, periods]) =>
    Object.entries(periods).map(([period, value]) => `${path} = ${JSON.stringify(value)} (${period})`),
  );
}

function ModelAndData({ measure, manifest }: { measure: Measure; manifest: Manifest | null | undefined }) {
  const hashMatches = manifest ? manifest.registry_hash === REGISTRY.registry_hash : null;
  const baseline = overrideLines(measure.baseline_overrides);
  const reform = overrideLines(measure.reform_overrides);
  return (
    <div className="space-y-4 text-sm text-gray-700">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <dt className="text-xs text-gray-500">Model</dt>
          <dd className="mt-0.5 font-mono text-xs break-all">{manifest?.pin ?? REGISTRY.pin}</dd>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <dt className="text-xs text-gray-500">Dataset revision</dt>
          <dd className="mt-0.5 font-mono text-xs break-all">{manifest?.dataset_revision ?? 'Pending'}</dd>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <dt className="text-xs text-gray-500">Results generated</dt>
          <dd className="mt-0.5 text-xs">
            {manifest?.generated_at_utc ? formatTimestamp(manifest.generated_at_utc) : 'Pending'}
          </dd>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <dt className="text-xs text-gray-500">Measure registry</dt>
          <dd className="mt-0.5 text-xs">
            <span className="font-mono">{REGISTRY.registry_hash}</span>
            {hashMatches === false && (
              <span className="block text-gray-600 mt-1">
                The results were generated from registry {manifest?.registry_hash}; rerun the
                pipeline to match.
              </span>
            )}
          </dd>
        </div>
      </dl>
      <div>
        <p className="font-semibold text-gray-900">How the measure is modeled</p>
        <p className="mt-1">
          Every figure is the difference between two simulations of the same households in the same
          year: one under current law and one{' '}
          {measure.kind_params?.conditional === true ? 'under the scenario' : 'with the measure in effect'}
          . Parameter changes:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs leading-5 text-gray-800">
          {[
            ...(baseline.length ? ['# Both simulations (current law assumptions)', ...baseline, ''] : []),
            measure.kind_params?.conditional === true ? '# The scenario' : '# The measure passes',
            ...reform,
          ].join('\n')}
        </pre>
      </div>
      {manifest?.spm_resources_adjustment?.applied && measure.kind !== 'medicaid' && (
        <p>
          <span className="font-semibold text-gray-900">Poverty measures.</span> PolicyEngine adds
          partnership and S corporation income, farm rental income and the Alaska Permanent Fund
          dividend to SPM resources, which the released model omits (
          <ExternalLink href="https://github.com/PolicyEngine/policyengine-us/issues/9919">
            policyengine-us#9919
          </ExternalLink>
          ).
        </p>
      )}
    </div>
  );
}

interface Props {
  measure: Measure;
  year: number;
}

export default function ValidationMethodology({ measure, year }: Props) {
  const content = getContent(measure.slug);
  const metricsFile = useResultsCsv(STATEWIDE_FILES.metrics);
  const { data: manifest } = useManifest();
  const metricsByYear = Object.fromEntries(
    measure.years.map((y) => [y, metricsFor(metricsFile.data, measure.slug, y)]),
  ) as Record<number, Record<string, number> | null>;

  return (
    <div className="space-y-10">
      <section aria-labelledby="validation-heading" className="space-y-4">
        <h2 id="validation-heading" className="text-2xl font-bold text-gray-900">
          Validation
        </h2>
        <ValidationTable measure={measure} metricsByYear={metricsByYear} />
        <div className="space-y-3 text-sm text-gray-700">
          {content.officialEstimateProse.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {content.officialTables?.map((t) => (
          <SimpleDataTable key={t.caption} table={t} />
        ))}
      </section>

      <TopTailComparison measure={measure} year={year} manifest={manifest} metrics={metricsByYear[year] ?? null} />

      <section aria-labelledby="sample-heading" className="space-y-3">
        <h3 id="sample-heading" className="text-lg font-semibold text-gray-900">
          Sample sizes
        </h3>
        <SampleSizes measure={measure} metricsByYear={metricsByYear} />
        <p className="text-xs text-gray-500">
          The effective sample size accounts for unequal survey weights (Kish): a few heavily
          weighted households count for less than their raw number. Estimates that rest on small
          effective samples, such as poverty changes or changes concentrated among very high
          incomes, are less precise.
        </p>
      </section>

      <section aria-labelledby="kind-heading" className="space-y-3">
        <h3 id="kind-heading" className="text-lg font-semibold text-gray-900">
          Measure-specific methods
        </h3>
        <KindMethodology measure={measure} metrics={metricsByYear[year] ?? null} />
      </section>

      <section aria-labelledby="left-out-heading" className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 id="left-out-heading" className="text-lg font-semibold text-gray-900 mb-2">
            What the model leaves out
          </h3>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
            {content.notModeled.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Caveats</h3>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
            {content.caveats.map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>
              Estimates are static: they hold work, investment, filing behavior and where people
              live fixed.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="data-heading" className="space-y-3">
        <h3 id="data-heading" className="text-lg font-semibold text-gray-900">
          Model and data
        </h3>
        <ModelAndData measure={measure} manifest={manifest} />
        <Callout>
          PolicyEngine&apos;s microsimulation model,{' '}
          <ExternalLink href="https://github.com/PolicyEngine/policyengine-us">policyengine-us</ExternalLink>
          , runs on a calibrated sample of US households (Populace), assigned to states and
          congressional districts. All estimates compare the measure with current law in the same
          tax year and assume no change in behavior.
        </Callout>
      </section>

      <section aria-labelledby="refs-heading">
        <h3 id="refs-heading" className="text-lg font-semibold text-gray-900 mb-2">
          Sources
        </h3>
        <ul className="space-y-1 text-sm">
          {content.references.map((r) => (
            <li key={r.url}>
              <ExternalLink href={r.url}>{r.label}</ExternalLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
