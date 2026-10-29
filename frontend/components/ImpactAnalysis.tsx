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
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import {
  HouseholdApiError,
  type HouseholdRequest,
  type HouseholdResponse,
} from '@/lib/householdApi';
import {
  KIND_SERIES,
  atIncomeRows,
  buildChartRows,
  changeAt,
  filingStatusLabel,
  netIncomeChange,
  type AtIncomeRow,
  type HouseholdChartRow,
} from '@/lib/householdForm';
import type { Measure } from '@/lib/registry';
import { formatCount, formatIncomeTick, formatUSD, formatUSDWithSign } from '@/lib/format';
import {
  CHART_MARGIN,
  ChartFigure,
  PillToggle,
  SweepChartDescription,
  TICK_STYLE,
  niceDomain,
  niceStep,
  type DescribedSeries,
} from './chartUtils';
import CoverageResults from './CoverageResults';
import { MetricCard, ResultsTable, toneOf, type Tone } from './ui';

interface Props {
  measure: Measure;
  request: HouseholdRequest | null;
  /** When supplied, renders this stored result instead of calling the API. */
  precomputed?: HouseholdResponse | null;
  /** Label of the example household the stored result belongs to. */
  exampleLabel?: string | null;
}

/** Loading panel; cold starts take 1-2 minutes. */
export function CalculatingNotice() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <div className="text-center max-w-md">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary-500 border-r-transparent" />
        <p className="mt-4 font-semibold text-gray-800">Calculating…</p>
        <p className="mt-1 text-sm text-gray-600">
          Usually a few seconds; a calculator that has just started can take 1-2 minutes.
        </p>
      </div>
    </div>
  );
}

function ErrorPanel({ error }: { error: unknown }) {
  const apiError = error instanceof HouseholdApiError ? error : null;
  const title =
    apiError?.kind === 'validation'
      ? 'The calculator could not use these inputs'
      : apiError?.kind === 'timeout'
        ? 'The calculator took too long to respond'
        : 'Household calculator unavailable';
  const message = error instanceof Error ? error.message : 'Unknown error';
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5" role="alert">
      <h3 className="text-gray-900 font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-700">{message}</p>
      {apiError?.kind !== 'validation' && (
        <p className="text-sm text-gray-600 mt-2">The example households above load without the calculator.</p>
      )}
    </div>
  );
}

/** Labels for the two policies. */
export function policyLabels(measure: Measure): { baseline: string; reform: string } {
  return measure.kind_params?.conditional === true
    ? { baseline: 'Current law', reform: 'Scenario: expansion ends' }
    : { baseline: 'Current law', reform: 'If it passes' };
}

const POLICY_COLORS = {
  baseline: 'var(--chart-baseline)',
  reform: 'var(--chart-1)',
  change: 'var(--chart-3)',
};

type ChartView = 'change' | 'levels' | 'kind';

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--chart-tooltip-border)',
  borderRadius: 4,
  padding: '8px 12px',
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  color: 'var(--text-body)',
  minWidth: 200,
};

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 2,
        marginRight: 6,
        backgroundColor: color,
      }}
    />
  );
}

export function HouseholdTooltip({
  active,
  payload,
  view,
  labels,
  kindLabel,
}: {
  active?: boolean;
  payload?: { payload?: HouseholdChartRow }[];
  view: ChartView;
  labels: { baseline: string; reform: string };
  kindLabel: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const line = (color: string, label: string, value: string) => (
    <p style={{ margin: '2px 0 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>
        <Swatch color={color} />
        {label}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </p>
  );
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-heading)' }}>
        Employment income: {formatUSD(row.income)}
      </p>
      {view === 'change' && line(POLICY_COLORS.change, 'Change in net income', formatUSDWithSign(row.change))}
      {view === 'levels' && (
        <>
          {line(POLICY_COLORS.baseline, labels.baseline, formatUSD(row.baseline))}
          {line(POLICY_COLORS.reform, labels.reform, formatUSD(row.reform))}
        </>
      )}
      {view === 'kind' && (
        <>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>{kindLabel}</p>
          {line(POLICY_COLORS.baseline, labels.baseline, formatUSD(row.kindBaseline))}
          {line(POLICY_COLORS.reform, labels.reform, formatUSD(row.kindReform))}
        </>
      )}
    </div>
  );
}

function formatRowValue(row: AtIncomeRow, value: number): string {
  return row.unit === 'count' ? formatCount(value) : formatUSD(value);
}

function formatRowChange(row: AtIncomeRow): string {
  const change = row.reform - row.baseline;
  return row.unit === 'count'
    ? `${change > 0 ? '+' : ''}${formatCount(change)}`
    : formatUSDWithSign(change);
}

/** Tone of a change from the household's side (a tax increase is a loss). */
const householdTone = (row: AtIncomeRow): Tone => {
  const change = row.reform - row.baseline;
  return toneOf(row.higherIsBetter ? change : -change);
};

/** Cards, comparison table and chart for one calculator response. */
export function HouseholdResults({
  measure,
  result,
  exampleLabel,
}: {
  measure: Measure;
  result: HouseholdResponse;
  exampleLabel?: string | null;
}) {
  const [view, setView] = useState<ChartView>('change');
  const labels = policyLabels(measure);
  const kind = KIND_SERIES[measure.kind];
  const rows = buildChartRows(result, measure.kind);
  const tableRows = atIncomeRows(result, measure);
  const change = netIncomeChange(result);
  const xMax = rows.length ? rows[rows.length - 1].income : result.income ?? 0;
  const xStep = niceStep(xMax, 4);
  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep);
  const yAxis = niceDomain(
    rows.flatMap((r) =>
      view === 'change' ? [r.change] : view === 'levels' ? [r.baseline, r.reform] : [r.kindBaseline, r.kindReform],
    ),
  );
  const entered = result.income ?? (result.income_index !== null ? result.income_range[result.income_index] : null);
  const filing = filingStatusLabel(result.filing_status);
  const stateTaxChange = changeAt(result, 'state_tax');

  const chartTitle =
    view === 'change'
      ? 'Change in net income by employment income'
      : view === 'levels'
        ? 'Net income by employment income'
        : `${kind.label} by employment income`;
  const kindAt = (policy: 'baseline' | 'reform') =>
    kind.keys.reduce((total, key) => total + (result.at_income[policy][key] ?? 0), 0);
  const described: { series: DescribedSeries[]; atIncome: { label: string; value: string }[] } =
    view === 'change'
      ? {
          series: [
            { label: 'Change in net income', values: rows.map((r) => r.change), format: formatUSDWithSign },
          ],
          atIncome: [{ label: 'change in net income', value: formatUSDWithSign(change) }],
        }
      : view === 'levels'
        ? {
            series: [
              { label: labels.baseline, values: rows.map((r) => r.baseline), format: formatUSD },
              { label: labels.reform, values: rows.map((r) => r.reform), format: formatUSD },
            ],
            atIncome: [
              { label: labels.baseline, value: formatUSD(result.at_income.baseline.net_income) },
              { label: labels.reform, value: formatUSD(result.at_income.reform.net_income) },
            ],
          }
        : {
            series: [
              { label: labels.baseline, values: rows.map((r) => r.kindBaseline), format: formatUSD },
              { label: labels.reform, values: rows.map((r) => r.kindReform), format: formatUSD },
            ],
            atIncome: [
              { label: labels.baseline, value: formatUSD(kindAt('baseline')) },
              { label: labels.reform, value: formatUSD(kindAt('reform')) },
            ],
          };

  const kindCard = (() => {
    switch (measure.kind) {
      case 'income_tax':
        return (
          <MetricCard
            label={`Change in ${measure.state_name} income tax`}
            value={`${formatUSDWithSign(stateTaxChange)}/year`}
            tone={toneOf(-stateTaxChange)}
          />
        );
      case 'tabor_refund': {
        const refund = changeAt(result, 'refund');
        return (
          <MetricCard
            label="Change in sales tax refund"
            value={`${formatUSDWithSign(refund)}/year`}
            tone={toneOf(refund)}
          />
        );
      }
      case 'school_meals': {
        const meals = changeAt(result, 'meal_value');
        return (
          <MetricCard
            label="Change in value of school meals"
            value={`${formatUSDWithSign(meals)}/year`}
            tone={toneOf(meals)}
          />
        );
      }
      case 'medicaid': {
        const health = changeAt(result, 'medicaid') + changeAt(result, 'ptc');
        return (
          <MetricCard
            label="Change in Medicaid and premium tax credit"
            value={`${formatUSDWithSign(health)}/year`}
            tone={toneOf(health)}
          />
        );
      }
    }
  })();

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-bold text-gray-800">
          {exampleLabel ? exampleLabel : 'Your household’s results'}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {[
            measure.state_name,
            filing,
            entered !== null ? `employment income ${formatUSD(entered)}` : null,
            `tax year ${result.year}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          label="Change in household net income"
          value={`${formatUSDWithSign(change)}/year`}
          tone={toneOf(change)}
          detail={
            measure.kind_params?.conditional === true
              ? 'In the scenario, compared with current law'
              : 'If it passes, compared with current law'
          }
        />
        {kindCard}
      </div>

      <ResultsTable
        caption="At your employment income"
        reformLabel={measure.kind_params?.conditional === true ? 'Scenario' : 'If it passes'}
        rows={tableRows.map((row) => ({
          label: row.label,
          baseline: formatRowValue(row, row.baseline),
          reform: formatRowValue(row, row.reform),
          change: formatRowChange(row),
          tone: householdTone(row),
        }))}
      />

      <ChartFigure
        title={chartTitle}
        description={
          <SweepChartDescription
            title={chartTitle}
            incomes={rows.map((r) => r.income)}
            series={described.series}
            entered={entered}
            atIncome={described.atIncome}
          />
        }
        actions={
          <PillToggle
            label="Chart"
            value={view}
            onChange={setView}
            options={[
              { value: 'change', label: 'Change' },
              { value: 'levels', label: 'Net income' },
              { value: 'kind', label: kind.label },
            ]}
          />
        }
        legend={
          view === 'change'
            ? [
                { label: 'Change in net income', color: POLICY_COLORS.change, shape: 'line' as const },
                { label: 'Your income', color: 'var(--chart-axis)', shape: 'dashed' as const },
              ]
            : [
                { label: labels.baseline, color: POLICY_COLORS.baseline, shape: 'line' as const },
                { label: labels.reform, color: POLICY_COLORS.reform, shape: 'line' as const },
                { label: 'Your income', color: 'var(--chart-axis)', shape: 'dashed' as const },
              ]
        }
        caption="Varies your employment income only; any spouse income stays fixed."
      >
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
              tickFormatter={(v: number) => (view === 'change' ? formatUSDWithSign(v) : formatIncomeTick(v))}
              tick={TICK_STYLE}
              stroke="var(--chart-axis)"
              width={76}
            />
            <Tooltip
              content={<HouseholdTooltip view={view} labels={labels} kindLabel={kind.label} />}
            />
            {view === 'change' && <ReferenceLine y={0} stroke="var(--chart-axis)" />}
            {entered !== null && (
              <ReferenceLine x={entered} stroke="var(--chart-axis)" strokeDasharray="4 4" />
            )}
            {view === 'change' ? (
              <Line
                type="linear"
                dataKey="change"
                name="Change in net income"
                stroke={POLICY_COLORS.change}
                strokeWidth={3}
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              [
                <Line
                  key="baseline"
                  type="linear"
                  dataKey={view === 'levels' ? 'baseline' : 'kindBaseline'}
                  name={labels.baseline}
                  stroke={POLICY_COLORS.baseline}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />,
                <Line
                  key="reform"
                  type="linear"
                  dataKey={view === 'levels' ? 'reform' : 'kindReform'}
                  name={labels.reform}
                  stroke={POLICY_COLORS.reform}
                  strokeWidth={3}
                  strokeDasharray="6 3"
                  dot={false}
                  isAnimationActive={false}
                />,
              ]
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartFigure>
    </div>
  );
}

export default function ImpactAnalysis({ measure, request, precomputed, exampleLabel }: Props) {
  const live = useHouseholdImpact(request, !precomputed);
  const data = precomputed ?? live.data;

  if (!precomputed && live.isFetching && !live.data) return <CalculatingNotice />;
  if (!precomputed && live.error) return <ErrorPanel error={live.error} />;
  if (!data) return null;

  // The Medicaid scenario is reported as coverage and premiums, not net income.
  if (measure.kind === 'medicaid') {
    return <CoverageResults measure={measure} result={data} exampleLabel={precomputed ? exampleLabel : null} />;
  }
  return (
    <HouseholdResults measure={measure} result={data} exampleLabel={precomputed ? exampleLabel : null} />
  );
}
