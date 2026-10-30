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
  niceDomain,
  tickDecimals,
} from '../chartUtils';
import { CompareTable, toneOf, toneText } from '../ui';
import { DASH, kindDetailRows, money, show, signedMoney } from './KindSummary';

function MissingSection({ file }: { file: string }) {
  return (
    <p className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600">
      Results not yet available: <code>{file}</code> has no rows for this measure and year.
    </p>
  );
}

// ── Budget ──────────────────────────────────────────────────────────────

/** "$1.43B gain" or "$57.0M cost" for a signed budget change (government's side). */
export const budgetText = (v: number) =>
  Math.round(v) === 0 ? '$0' : `${money(Math.abs(v))} ${v > 0 ? 'gain' : 'cost'}`;

export function BudgetSection({ measure, data }: { measure: Measure; data: StatewideResults }) {
  const m = data.metrics;
  // The Medicaid scenario is reported in people and spending, not net income.
  const netIncomeRows = measure.kind !== 'medicaid';
  const federalBudget = metric(m, C.federalBudgetImpact);
  const total = metric(m, C.netIncomeChangeTotal);
  const average = metric(m, C.avgHouseholdNetIncomeChange);
  const rows = [
    { label: 'State budget', value: show(metric(m, C.stateBudgetImpact), budgetText) },
    // Federal effects are not modeled for most measures; show the line only when it moves (SD).
    ...(federalBudget !== null && Math.round(federalBudget) !== 0
      ? [{ label: 'Federal budget', value: budgetText(federalBudget) }]
      : []),
    ...(netIncomeRows
      ? [
          {
            label: 'Household net income',
            value:
              total === null
                ? DASH
                : `${signedMoney(total)} total${average === null ? '' : `; ${formatUSDWithSign(average)} per household`}`,
          },
        ]
      : []),
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
          firstColumn="Per year"
          columns={['Change']}
          rows={rows.map((r) => ({ label: r.label, values: [r.value] }))}
        />
        {details.length > 0 && (
          <CompareTable
            caption="Details"
            firstColumn="Measure"
            columns={['Value']}
            rows={details.map((r) => ({ label: r.label, values: [r.value] }))}
          />
        )}
      </div>
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
            tickFormatter={
              isRelative ? (v: number) => formatPercent(v, tickDecimals(axis.ticks), { sign: true }) : fmt
            }
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
  // Changes within 0.1% of net income either way (ballot_calc/metrics/core.py):
  // small gains and losses alike, so not "No change"
  { key: 'no_change', label: 'Change under 0.1%', color: WINNERS_COLORS.noChange },
  { key: 'lose_less_5pct', label: 'Lose less than 5%', color: WINNERS_COLORS.loseLess5 },
  { key: 'lose_more_5pct', label: 'Lose more than 5%', color: WINNERS_COLORS.loseMore5 },
] as const;

export function WinnersSection({ data }: { data: StatewideResults }) {
  const wl = data.winnersLosers;
  const toRow = (label: string, shares: Record<string, number>) => ({
    label,
    ...Object.fromEntries(WL_CATEGORIES.map((c) => [c.key, shares[c.key] * 100])),
  });
  // The pipeline's "All" row averages the ten deciles' shares
  // (scripts/DATA_SCHEMA.md), which isn't the statewide share of people, so
  // it is labelled as the average it is
  const stacked = wl
    ? [
        toRow('Avg', wl.all as unknown as Record<string, number>),
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
            <p className="text-sm text-gray-700 mb-1">Winners</p>
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
            <p className="text-sm text-gray-700 mb-1">Losers</p>
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
          caption="Share of people in each decile by their household's percent change in net income; the top bar (Avg) averages the ten deciles. “Change under 0.1%” counts gains and losses smaller than 0.1% of net income; the cards above count every change of more than $1."
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

function BandsTable({ data }: { data: StatewideResults }) {
  const bands = data.incomeBrackets ?? [];
  return (
    <div className="overflow-x-auto scroll-cue">
      <table className="w-full text-sm">
        <caption className="sr-only">Impact by income band, {data.year}</caption>
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
  );
}

/** The income-band table on the budgetary impact section (NJ's "impact by income bracket"). */
export function IncomeBandsTable({ data }: { data: StatewideResults }) {
  const bands = data.incomeBrackets;
  if (!bands) return <MissingSection file="income_brackets.csv" />;
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-800 mb-4">Impact by income band</h3>
      <BandsTable data={data} />
    </div>
  );
}

// ── Poverty ─────────────────────────────────────────────────────────────

export function PovertySection({ data }: { data: StatewideResults }) {
  const m = data.metrics;
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
                tickFormatter={(v: number) => formatPercent(v, tickDecimals(axis.ticks), { sign: true })}
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
      {tiny && (
        <p className="text-xs text-gray-500">Each poverty rate changes by less than 0.1% of its current-law level.</p>
      )}
    </div>
  );
}
