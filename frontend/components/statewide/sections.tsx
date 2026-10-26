'use client';

import { useState } from 'react';
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
import {
  formatCompactUSD,
  formatCount,
  formatPercent,
  formatPercentagePoints,
  formatUSDWithSign,
} from '@/lib/format';
import { SPM_ADJUSTMENT_NOTE } from '@/lib/figureBasis';
import { useManifest } from '@/lib/measures';
import { CORE_METRICS as C, POVERTY_MEASURES, povertyMetric } from '@/lib/metrics';
import type { Measure } from '@/lib/registry';
import { metric, type StatewideResults } from '@/lib/results';
import {
  CHART_MARGIN,
  ChartFigure,
  ChartTooltip,
  PillToggle,
  SIGN_COLORS,
  SignedBarLabel,
  TICK_STYLE,
  WINNERS_COLORS,
  WrappedTick,
  niceDomain,
} from '../chartUtils';
import { BasisNote } from '../FigureBasis';
import { CompareTable, toneOf, toneText } from '../ui';
import { kindDetailRows, show, signedMoney } from './KindSummary';

function MissingSection({ file }: { file: string }) {
  return (
    <p className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600">
      Results not yet available: <code>{file}</code> has no rows for this measure and year.
    </p>
  );
}

// ── Budget ──────────────────────────────────────────────────────────────

export function BudgetSection({ measure, data }: { measure: Measure; data: StatewideResults }) {
  const m = data.metrics;
  const federalBudget = metric(m, C.federalBudgetImpact);
  const incomeTaxNote =
    measure.kind === 'income_tax' && federalBudget !== null && Math.abs(federalBudget) < 0.5;
  const rows = [
    { label: 'State revenue', value: show(metric(m, C.stateRevenueImpact), signedMoney) },
    { label: 'State spending', value: show(metric(m, C.stateSpendingImpact), signedMoney) },
    { label: 'State budget (revenue minus spending)', value: show(metric(m, C.stateBudgetImpact), signedMoney) },
    { label: 'Federal revenue', value: show(metric(m, C.federalRevenueImpact), signedMoney) },
    { label: 'Federal spending', value: show(metric(m, C.federalSpendingImpact), signedMoney) },
    {
      label: 'Federal budget (revenue minus spending)',
      value: show(federalBudget, signedMoney),
    },
    {
      label: 'Household net income, all households',
      value: show(metric(m, C.netIncomeChangeTotal), signedMoney),
    },
    {
      label: 'Household net income, average per household',
      value: show(metric(m, C.avgHouseholdNetIncomeChange), formatUSDWithSign),
    },
  ];
  const details = kindDetailRows(measure, m);

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <CompareTable
          caption={
            measure.kind_params?.conditional === true
              ? `Change in the scenario, ${data.year}`
              : `Change if the measure passes, ${data.year}`
          }
          firstColumn="Budget line"
          columns={['Change']}
          rows={rows.map((r) => ({ label: r.label, values: [r.value] }))}
        />
        <CompareTable
          caption="Details"
          firstColumn="Measure"
          columns={['Value']}
          rows={details.map((r) => ({ label: r.label, values: [r.value] }))}
        />
      </div>
      <p className="text-xs text-gray-500">
        Budget lines are signed from the government&apos;s side: a positive budget change means the
        government collects more or spends less. Household net income is signed from the
        household&apos;s side.
        {incomeTaxNote
          ? ' The federal deduction for state and local taxes uses state income tax withholding in the model, so this measure does not change federal income tax.'
          : ''}
      </p>
    </div>
  );
}

// ── Distributional ──────────────────────────────────────────────────────

export function DistributionalSection({ data }: { data: StatewideResults }) {
  const [mode, setMode] = useState<'absolute' | 'relative'>('absolute');
  const isRelative = mode === 'relative';
  const deciles = (data.deciles ?? []).map((d) => ({
    decile: String(d.decile),
    value: isRelative ? d.relative_change * 100 : d.average_change,
  }));
  const axis = niceDomain(deciles.map((d) => d.value));
  const fmt = isRelative
    ? (v: number) => formatPercent(v, 2, { sign: true })
    : (v: number) => formatUSDWithSign(v);

  if (!data.deciles) return <MissingSection file="distributional_impact.csv" />;

  return (
    <ChartFigure
      title="Change in net income by income decile"
      actions={
        <PillToggle
          label="Measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'absolute', label: 'Absolute' },
            { value: 'relative', label: 'Relative' },
          ]}
        />
      }
      caption={
        isRelative
          ? 'Percent of baseline net income. Deciles rank the state’s households by baseline net income.'
          : 'Average dollars per household. Deciles rank the state’s households by baseline net income.'
      }
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={deciles} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="decile"
            tick={TICK_STYLE}
            stroke="var(--chart-axis)"
            label={{ value: 'Income decile', position: 'insideBottom', offset: -15, style: TICK_STYLE }}
          />
          <YAxis
            domain={axis.domain}
            ticks={axis.ticks}
            tickFormatter={isRelative ? (v: number) => formatPercent(v, 1, { sign: true }) : fmt}
            tick={TICK_STYLE}
            stroke="var(--chart-axis)"
            width={isRelative ? 64 : 76}
          />
          <Tooltip
            cursor={{ fill: 'var(--gray-100)' }}
            content={<ChartTooltip formatter={(v) => fmt(v)} labelFormatter={(l) => `Decile ${l}`} />}
          />
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          <Bar
            dataKey="value"
            name={isRelative ? 'Relative change' : 'Average change'}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="value"
              content={(props) => (
                <SignedBarLabel
                  {...(props as object)}
                  format={isRelative ? (v) => formatPercent(v, 1, { sign: true }) : fmt}
                />
              )}
            />
            {deciles.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? SIGN_COLORS.positive : SIGN_COLORS.negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

// ── Winners and losers ──────────────────────────────────────────────────

const WL_CATEGORIES = [
  { key: 'gain_more_5pct', label: 'Gain more than 5%', color: WINNERS_COLORS.gainMore5 },
  { key: 'gain_less_5pct', label: 'Gain less than 5%', color: WINNERS_COLORS.gainLess5 },
  { key: 'no_change', label: 'No change', color: WINNERS_COLORS.noChange },
  { key: 'lose_less_5pct', label: 'Lose less than 5%', color: WINNERS_COLORS.loseLess5 },
  { key: 'lose_more_5pct', label: 'Lose more than 5%', color: WINNERS_COLORS.loseMore5 },
] as const;

export function WinnersSection({ data }: { data: StatewideResults }) {
  const wl = data.winnersLosers;
  const toRow = (label: string, shares: Record<string, number>) => ({
    label,
    ...Object.fromEntries(WL_CATEGORIES.map((c) => [c.key, shares[c.key] * 100])),
  });
  const stacked = wl
    ? [
        toRow('All', wl.all as unknown as Record<string, number>),
        ...[...wl.deciles]
          .sort((a, b) => b.decile - a.decile)
          .map((d) => toRow(String(d.decile), d as unknown as Record<string, number>)),
      ]
    : [];

  const m = data.metrics;
  const winRate = metric(m, C.winnersRate);
  const loseRate = metric(m, C.losersRate);
  const winCount = metric(m, C.winners);
  const loseCount = metric(m, C.losers);
  const avgGain = metric(m, C.avgGain);
  const avgLoss = metric(m, C.avgLoss);

  return (
    <div className="space-y-10">
      {winRate !== null && loseRate !== null && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            className="rounded-lg p-5 border"
            style={{ backgroundColor: 'var(--chart-winners-bg)', borderColor: SIGN_COLORS.positive }}
          >
            <p className="text-sm text-gray-700 mb-1">Gain</p>
            <p className="text-3xl font-bold" style={{ color: WINNERS_COLORS.gainMore5 }}>
              {formatPercent(winRate)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {winCount !== null ? `${formatCount(winCount)} households` : ''}
              {avgGain !== null ? ` · ${formatUSDWithSign(avgGain)} on average` : ''}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-5 border border-gray-300">
            <p className="text-sm text-gray-700 mb-1">No change</p>
            <p className="text-3xl font-bold text-gray-600">
              {formatPercent(Math.max(0, 100 - winRate - loseRate))}
            </p>
          </div>
          <div
            className="rounded-lg p-5 border"
            style={{ backgroundColor: 'var(--chart-losers-bg)', borderColor: WINNERS_COLORS.loseMore5 }}
          >
            <p className="text-sm text-gray-700 mb-1">Lose</p>
            <p className="text-3xl font-bold" style={{ color: WINNERS_COLORS.loseMore5 }}>
              {formatPercent(loseRate)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {loseCount !== null ? `${formatCount(loseCount)} households` : ''}
              {avgLoss !== null ? ` · ${formatUSDWithSign(avgLoss)} on average` : ''}
            </p>
          </div>
        </div>
      )}

      {wl ? (
        <ChartFigure
          title="Gains and losses by income decile"
          legend={WL_CATEGORIES.map((c) => ({ label: c.label, color: c.color }))}
          caption="Share of people in each decile by their household's percent change in net income."
        >
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={stacked} layout="vertical" stackOffset="expand" barSize={22} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                tick={TICK_STYLE}
                stroke="var(--chart-axis)"
              />
              <YAxis type="category" dataKey="label" tick={TICK_STYLE} stroke="var(--chart-axis)" width={36} />
              <Tooltip
                cursor={{ fill: 'var(--gray-100)' }}
                content={<ChartTooltip formatter={(v) => formatPercent(v)} />}
              />
              {WL_CATEGORIES.map((c) => (
                <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartFigure>
      ) : (
        <MissingSection file="winners_losers.csv" />
      )}
    </div>
  );
}

// ── Income bands ────────────────────────────────────────────────────────

export function IncomeBandsSection({ data }: { data: StatewideResults }) {
  const bands = data.incomeBrackets;
  if (!bands) return <MissingSection file="income_brackets.csv" />;
  const chartData = bands.map((b) => ({ label: b.bracket, value: b.average_change }));
  const axis = niceDomain(chartData.map((d) => d.value));

  return (
    <div className="space-y-10">
      <ChartFigure
        title="Average change in household net income by income"
        caption="Households grouped by baseline adjusted gross income."
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ ...CHART_MARGIN, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              interval={0}
              stroke="var(--chart-axis)"
              tick={<WrappedTick anchor="middle" maxWidth={90} />}
              height={50}
            />
            <YAxis
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={(v: number) => formatUSDWithSign(v)}
              tick={TICK_STYLE}
              stroke="var(--chart-axis)"
              width={84}
            />
            <Tooltip
              cursor={{ fill: 'var(--gray-100)' }}
              content={<ChartTooltip formatter={(v) => formatUSDWithSign(v)} />}
            />
            <ReferenceLine y={0} stroke="var(--chart-axis)" />
            <Bar dataKey="value" name="Average change" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.value >= 0 ? SIGN_COLORS.positive : SIGN_COLORS.negative} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFigure>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left text-sm font-semibold text-gray-800 mb-2">
            Impact by income band, {data.year}
          </caption>
          <thead>
            <tr className="border-b border-gray-200">
              <th scope="col" className="text-left py-2 pr-3 font-medium text-gray-600">Adjusted gross income</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Households</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Gaining</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Losing</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Average change</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Total change</th>
              <th scope="col" className="text-right py-2 pl-3 font-medium text-gray-600">State budget</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bands.map((b) => (
              <tr key={b.bracket}>
                <th scope="row" className="text-left py-2 pr-3 font-normal text-gray-800 whitespace-nowrap">
                  {b.bracket}
                </th>
                <td className="text-right py-2 px-3 tabular-nums">{formatCount(b.households)}</td>
                <td className="text-right py-2 px-3 tabular-nums">{formatCount(b.winners)}</td>
                <td className="text-right py-2 px-3 tabular-nums">{formatCount(b.losers)}</td>
                <td className={`text-right py-2 px-3 tabular-nums font-semibold ${toneText(toneOf(b.average_change))}`}>
                  {formatUSDWithSign(b.average_change)}
                </td>
                <td className="text-right py-2 px-3 tabular-nums">
                  {formatCompactUSD(b.total_change, { sig3: true, sign: true })}
                </td>
                <td className="text-right py-2 pl-3 tabular-nums">
                  {formatCompactUSD(b.state_budget_impact, { sig3: true, sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-2">
          Gaining and losing count households whose net income rises or falls by more than $1. Total
          and average changes cover every household in the band.
        </p>
      </div>
    </div>
  );
}

// ── Poverty ─────────────────────────────────────────────────────────────

export function PovertySection({ data }: { data: StatewideResults }) {
  const m = data.metrics;
  const { data: manifest } = useManifest();
  const spmAdjusted = manifest?.spm_resources_adjustment?.applied === true;
  const rows = POVERTY_MEASURES.map((p) => ({
    ...p,
    baseline: metric(m, povertyMetric(p.key, 'baseline_rate')),
    reform: metric(m, povertyMetric(p.key, 'reform_rate')),
    change: metric(m, povertyMetric(p.key, 'rate_change')),
    pct: metric(m, povertyMetric(p.key, 'percent_change')),
  }));
  const chartData = rows.filter((r) => r.pct !== null).map((r) => ({ label: r.label, value: r.pct as number }));
  const values = chartData.map((d) => d.value);
  const maxAbs = Math.max(0, ...values.map(Math.abs));
  // Keep at least a ±1% axis so changes of a few hundredths of a percent
  // are not drawn as large bars.
  const axis = niceDomain(maxAbs < 1 ? [...values, 1, -1] : values);
  const tiny = chartData.length > 0 && maxAbs < 0.1;
  const lifted = metric(m, C.peopleLiftedOutOfPoverty);
  const pushed = metric(m, C.peoplePushedIntoPoverty);
  // Children are shown only when both directions are reported.
  const childrenOut = metric(m, C.childrenLiftedOutOfPoverty);
  const childrenIn = metric(m, C.childrenPushedIntoPoverty);
  const movementRows = [
    { label: 'Moved out of poverty', values: [show(lifted, formatCount)] },
    { label: 'Moved into poverty', values: [show(pushed, formatCount)] },
    ...(childrenOut !== null && childrenIn !== null
      ? [
          { label: 'Children moved out of poverty', values: [formatCount(childrenOut)] },
          { label: 'Children moved into poverty', values: [formatCount(childrenIn)] },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      {spmAdjusted && <BasisNote basis="adjusted">{SPM_ADJUSTMENT_NOTE}</BasisNote>}
      {chartData.length > 0 ? (
        <ChartFigure
          title="Percent change in poverty rates"
          caption="Supplemental Poverty Measure; deep poverty means resources below half the poverty threshold."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={TICK_STYLE} stroke="var(--chart-axis)" />
              <YAxis
                domain={axis.domain}
                ticks={axis.ticks}
                tickFormatter={(v: number) => formatPercent(v, 1, { sign: true })}
                tick={TICK_STYLE}
                stroke="var(--chart-axis)"
                width={60}
              />
              <Tooltip
                cursor={{ fill: 'var(--gray-100)' }}
                content={<ChartTooltip formatter={(v) => formatPercent(v, 2, { sign: true })} />}
              />
              <ReferenceLine y={0} stroke="var(--chart-axis)" />
              <Bar dataKey="value" name="Percent change" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.value <= 0 ? SIGN_COLORS.positive : SIGN_COLORS.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFigure>
      ) : (
        <MissingSection file="metrics.csv" />
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <CompareTable
          caption="Poverty rates"
          firstColumn="Measure"
          columns={['Current law', 'If it passes', 'Change']}
          rows={rows.map((r) => ({
            label: r.label,
            values: [
              show(r.baseline, (v) => formatPercent(v)),
              show(r.reform, (v) => formatPercent(v)),
              show(r.change, formatPercentagePoints),
            ],
          }))}
        />
        <CompareTable
          caption="People moving across the poverty line"
          firstColumn="Group"
          columns={['People']}
          rows={movementRows}
        />
      </div>
      <p className="text-xs text-gray-500">
        {tiny ? 'Each poverty rate changes by less than 0.1% of its current-law level. ' : ''}
        Poverty estimates rest on survey households, so small changes can reflect a handful of
        sampled households; the methodology tab reports effective sample sizes.
      </p>
    </div>
  );
}
