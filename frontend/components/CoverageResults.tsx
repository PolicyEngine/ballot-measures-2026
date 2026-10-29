'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getContent } from '@/content/measures';
import { coverageChanges, coverageOutcome, coverageSegments } from '@/lib/coverage';
import { filingStatusLabel } from '@/lib/householdForm';
import type { HouseholdResponse, NumericPointKey, PolicySweep } from '@/lib/householdApi';
import type { Measure } from '@/lib/registry';
import { formatCount, formatIncomeTick, formatUSD, formatUSDWithSign } from '@/lib/format';
import {
  CHART_MARGIN,
  ChartFigure,
  PillToggle,
  SweepChartDescription,
  TICK_STYLE,
  countDomain,
  niceDomain,
  niceStep,
} from './chartUtils';
import CoverageBands, { coverageLegend } from './CoverageBands';
import { MetricCard, ResultsTable, toneOf } from './ui';

type CoverageView = 'coverage' | 'enrolled' | 'ptc' | 'premium';
type LineView = Exclude<CoverageView, 'coverage'>;

const VIEWS: { value: CoverageView; label: string; title: string }[] = [
  { value: 'coverage', label: 'Coverage', title: 'Health coverage by employment income' },
  { value: 'enrolled', label: 'Medicaid enrollment', title: 'People enrolled in Medicaid by employment income' },
  { value: 'ptc', label: 'Premium tax credit', title: 'Premium tax credit by employment income' },
  { value: 'premium', label: 'Premium you pay', title: 'Marketplace premium after the credit by employment income' },
];

const LINE_KEYS: Record<LineView, NumericPointKey> = {
  enrolled: 'medicaid_enrolled',
  ptc: 'ptc',
  premium: 'marketplace_premium',
};

const COLORS = { baseline: 'var(--chart-baseline)', reform: 'var(--chart-1)' };

const SCENARIO = 'Scenario: expansion ends';

interface Row {
  income: number;
  baseline: number;
  reform: number;
}

const series = (s: PolicySweep, key: NumericPointKey, length: number): number[] => {
  const values = s[key];
  return Array.isArray(values) && values.length === length ? values : new Array(length).fill(0);
};

function CoverageTooltip({
  active,
  payload,
  view,
}: {
  active?: boolean;
  payload?: { payload?: Row }[];
  view: LineView;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const fmt = view === 'enrolled' ? formatCount : formatUSD;
  const line = (color: string, text: string, value: number) => (
    <p style={{ margin: '2px 0 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>
        <span
          aria-hidden="true"
          style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 6, backgroundColor: color }}
        />
        {text}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </p>
  );
  return (
    <div
      style={{
        background: 'var(--chart-tooltip-bg)',
        border: '1px solid var(--chart-tooltip-border)',
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--text-body)',
        minWidth: 200,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-heading)' }}>
        Employment income: {formatUSD(row.income)}
      </p>
      {line(COLORS.baseline, 'Current law', row.baseline)}
      {line(COLORS.reform, SCENARIO, row.reform)}
    </div>
  );
}

/** Household results for the Medicaid scenario: coverage and premiums, not net income. */
export default function CoverageResults({
  measure,
  result,
  exampleLabel,
}: {
  measure: Measure;
  result: HouseholdResponse;
  exampleLabel?: string | null;
}) {
  const [view, setView] = useState<CoverageView>('coverage');
  const outcome = coverageOutcome(result);
  const entered =
    result.income ?? (result.income_index !== null ? result.income_range[result.income_index] : null);
  const filing = filingStatusLabel(result.filing_status);
  const current = VIEWS.find((v) => v.value === view)!;
  const lineView: LineView = view === 'coverage' ? 'enrolled' : view;
  const length = result.income_range.length;
  const base = series(result.sweep.baseline, LINE_KEYS[lineView], length);
  const reform = series(result.sweep.reform, LINE_KEYS[lineView], length);
  const rows: Row[] = result.income_range.map((income, i) => ({ income, baseline: base[i], reform: reform[i] }));
  const xMax = rows.length ? rows[rows.length - 1].income : (entered ?? 0);
  const xStep = niceStep(xMax, 4);
  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep);
  const yValues = rows.flatMap((r) => [r.baseline, r.reform]);
  const yAxis = lineView === 'enrolled' ? countDomain(yValues) : niceDomain(yValues);

  const changes = coverageChanges(outcome);
  const scenarioDetail =
    outcome.reform === 'marketplace'
      ? `Premium after the credit: ${formatUSD(outcome.premiumReform)}/year`
      : outcome.reform === 'no_subsidy'
        ? (outcome.reformReason ?? 'No premium tax credit at this income')
        : undefined;
  const cashBaseline = result.at_income.baseline.cash_net_income;
  const cashReform = result.at_income.reform.cash_net_income;

  const tableRows: { label: string; baseline: string; reform: string; change: string; tone: ReturnType<typeof toneOf> }[] = [
    {
      label: 'Health coverage',
      baseline: outcome.baselineLabel,
      reform: outcome.reformLabel,
      change: changes ? 'Changes' : 'No change',
      tone: 'neutral',
    },
    {
      label: 'People enrolled in Medicaid',
      baseline: formatCount(outcome.enrolledBaseline),
      reform: formatCount(outcome.enrolledReform),
      change: `${outcome.enrolledReform - outcome.enrolledBaseline > 0 ? '+' : ''}${formatCount(
        outcome.enrolledReform - outcome.enrolledBaseline,
      )}`,
      tone: 'neutral',
    },
    {
      label: 'Premium tax credit',
      baseline: formatUSD(outcome.ptcBaseline),
      reform: formatUSD(outcome.ptcReform),
      change: formatUSDWithSign(outcome.ptcReform - outcome.ptcBaseline),
      tone: 'neutral',
    },
    {
      label: 'Marketplace premium you pay after the credit',
      baseline: formatUSD(outcome.premiumBaseline),
      reform: formatUSD(outcome.premiumReform),
      change: formatUSDWithSign(outcome.premiumChange),
      tone: toneOf(-outcome.premiumChange),
    },
    ...(typeof cashBaseline === 'number' && typeof cashReform === 'number'
      ? [
          {
            label: 'Cash income (net income without the value of health coverage)',
            baseline: formatUSD(cashBaseline),
            reform: formatUSD(cashReform),
            change: formatUSDWithSign(outcome.cashChange),
            tone: toneOf(outcome.cashChange),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold text-gray-800">
          {exampleLabel ? exampleLabel : 'Your household’s results'}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {[measure.state_name, filing, entered !== null ? `employment income ${formatUSD(entered)}` : null, `${result.year}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Coverage under current law"
          value={outcome.baselineLabel}
          detail={
            outcome.enrolledBaseline > 0
              ? `${formatCount(outcome.enrolledBaseline)} ${outcome.enrolledBaseline === 1 ? 'person' : 'people'} enrolled in Medicaid`
              : (outcome.baselineReason ?? undefined)
          }
        />
        <MetricCard
          label="Coverage in the scenario"
          value={changes ? outcome.reformLabel : 'No change'}
          detail={changes ? scenarioDetail : undefined}
        />
        <MetricCard
          label="Change in cash income"
          value={`${formatUSDWithSign(outcome.cashChange)}/year`}
          tone={toneOf(outcome.cashChange)}
          detail={
            outcome.premiumChange !== 0
              ? `Includes ${formatUSD(Math.abs(outcome.premiumChange))} ${
                  outcome.premiumChange > 0 ? 'more' : 'less'
                } in marketplace premiums; the value of health coverage is not counted`
              : 'The value of health coverage is not counted'
          }
        />
      </div>

      <div className="space-y-2">
        <ResultsTable caption="At your employment income" reformLabel="Scenario" rows={tableRows} />
        <p className="text-xs text-gray-500">Coverage is shown for you, or for your spouse if you are 65 or older.</p>
      </div>

      <ChartFigure
        title={current.title}
        description={
          view === 'coverage' ? undefined : (
            <SweepChartDescription
              title={current.title}
              incomes={result.income_range}
              series={[
                { label: 'Current law', values: base, format: lineView === 'enrolled' ? formatCount : formatUSD },
                { label: SCENARIO, values: reform, format: lineView === 'enrolled' ? formatCount : formatUSD },
              ]}
              entered={entered}
              atIncome={[
                {
                  label: 'Current law',
                  value: (lineView === 'enrolled' ? formatCount : formatUSD)(
                    result.at_income.baseline[LINE_KEYS[lineView]] ?? 0,
                  ),
                },
                {
                  label: SCENARIO,
                  value: (lineView === 'enrolled' ? formatCount : formatUSD)(
                    result.at_income.reform[LINE_KEYS[lineView]] ?? 0,
                  ),
                },
              ]}
            />
          )
        }
        actions={
          <PillToggle
            label="Chart"
            value={view}
            onChange={setView}
            options={VIEWS.map((v) => ({ value: v.value, label: v.label }))}
          />
        }
        legend={
          view === 'coverage'
            ? [
                ...coverageLegend([
                  coverageSegments(result.income_range, result.sweep.baseline),
                  coverageSegments(result.income_range, result.sweep.reform),
                ]).map((item) => ({ ...item, shape: 'square' as const })),
                { label: 'Your income', color: 'var(--gray-800)', shape: 'dashed' as const },
              ]
            : [
                { label: 'Current law', color: COLORS.baseline, shape: 'line' as const },
                { label: SCENARIO, color: COLORS.reform, shape: 'line' as const },
                { label: 'Your income', color: 'var(--chart-axis)', shape: 'dashed' as const },
              ]
        }
        caption="Varies your employment income only; any spouse income stays fixed."
      >
        {view === 'coverage' ? (
          <CoverageBands
            result={result}
            entered={entered}
            rowLabels={{ baseline: 'Current law', reform: SCENARIO }}
            cutoffs={getContent(measure.slug).coverageCutoffs}
          />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows} margin={{ ...CHART_MARGIN, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="income"
                type="number"
                domain={[0, xMax]}
                ticks={xTicks}
                tickFormatter={formatIncomeTick}
                tick={TICK_STYLE}
                stroke="var(--chart-axis)"
              />
              <YAxis
                domain={yAxis.domain}
                ticks={yAxis.ticks}
                allowDecimals={view !== 'enrolled'}
                tickFormatter={(v: number) => (view === 'enrolled' ? formatCount(v) : formatIncomeTick(v))}
                tick={TICK_STYLE}
                stroke="var(--chart-axis)"
                width={64}
              />
              <Tooltip content={<CoverageTooltip view={lineView} />} />
              {entered !== null && <ReferenceLine x={entered} stroke="var(--chart-axis)" strokeDasharray="4 4" />}
              <Line
                type={view === 'enrolled' ? 'stepAfter' : 'linear'}
                dataKey="baseline"
                name="Current law"
                stroke={COLORS.baseline}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type={view === 'enrolled' ? 'stepAfter' : 'linear'}
                dataKey="reform"
                name={SCENARIO}
                stroke={COLORS.reform}
                strokeWidth={3}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartFigure>
    </div>
  );
}
