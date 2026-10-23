'use client';

import { Fragment } from 'react';
import {
  COVERAGE_COLORS,
  DARK_COVERAGE,
  coverageSegments,
  type CoverageKind,
  type CoverageSegment,
} from '@/lib/coverage';
import type { HouseholdResponse } from '@/lib/householdApi';
import { formatIncomeTick, formatUSD } from '@/lib/format';
import { niceStep } from './chartUtils';

/** Legend order. */
const KIND_ORDER: CoverageKind[] = ['medicaid', 'medicare', 'marketplace', 'no_subsidy', 'other'];

const LEGEND_LABELS: Record<CoverageKind, string> = {
  medicaid: 'Medicaid',
  medicare: 'Medicare',
  marketplace: 'Subsidized marketplace coverage',
  no_subsidy: 'No subsidized coverage option',
  other: 'No Medicaid or premium tax credit',
};

/** "up to $6,500", "$7,000 to $23,000". */
function rangeText(s: CoverageSegment, firstIncome: number): string {
  if (s.first === s.last) return formatUSD(s.first);
  if (s.first === firstIncome) return `up to ${formatUSD(s.last)}`;
  return `${formatUSD(s.first)} to ${formatUSD(s.last)}`;
}

export const describeSegments = (segments: CoverageSegment[], firstIncome: number): string =>
  segments.map((s) => `${s.label}, ${rangeText(s, firstIncome)}`).join('; ');

/** Legend items for the kinds that appear in either row. */
export function coverageLegend(rows: CoverageSegment[][]): { label: string; color: string }[] {
  const present = new Set(rows.flat().map((s) => s.kind));
  return KIND_ORDER.filter((k) => present.has(k)).map((k) => ({ label: LEGEND_LABELS[k], color: COVERAGE_COLORS[k] }));
}

/**
 * Coverage by employment income under each policy: one band per policy,
 * colored by coverage, across the calculator's earnings sweep.
 */
export default function CoverageBands({
  result,
  entered,
  rowLabels,
}: {
  result: HouseholdResponse;
  entered: number | null;
  rowLabels: { baseline: string; reform: string };
}) {
  const incomes = result.income_range;
  const xMin = incomes[0] ?? 0;
  const xMax = incomes[incomes.length - 1] ?? 0;
  const span = xMax - xMin || 1;
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - xMin) / span) * 100));
  const rows = [
    { name: rowLabels.baseline, segments: coverageSegments(incomes, result.sweep.baseline) },
    { name: rowLabels.reform, segments: coverageSegments(incomes, result.sweep.reform) },
  ];
  const step = niceStep(xMax, 4);
  const ticks = Array.from({ length: Math.floor(xMax / step) + 1 }, (_, i) => i * step).filter((t) => t >= xMin);
  const marker = entered !== null && entered >= xMin && entered <= xMax ? pct(entered) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
        {rows.map((row) => (
          <Fragment key={row.name}>
            <span className="text-xs font-medium text-gray-700">{row.name}</span>
            <div
              className="relative h-10 rounded overflow-hidden bg-gray-100"
              role="img"
              aria-label={`${row.name}: ${describeSegments(row.segments, xMin)}`}
            >
              {row.segments.map((s, i) => (
                <div
                  key={`${s.first}-${s.kind}`}
                  title={`${s.label}: ${rangeText(s, xMin)}`}
                  className="absolute inset-y-0 flex items-center justify-center overflow-hidden"
                  style={{
                    left: `${pct(s.first)}%`,
                    width: `${Math.max(pct(s.end) - pct(s.first), 0.5)}%`,
                    backgroundColor: COVERAGE_COLORS[s.kind],
                    borderLeft: i === 0 ? undefined : '2px solid var(--background, #fff)',
                  }}
                >
                  <span
                    className="truncate px-1 text-[11px] font-medium"
                    style={{ color: DARK_COVERAGE.has(s.kind) ? '#fff' : 'var(--gray-800)' }}
                  >
                    {s.shortLabel}
                  </span>
                </div>
              ))}
              {marker !== null && (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0"
                  style={{ left: `${marker}%`, borderLeft: '2px dashed var(--gray-800)' }}
                />
              )}
            </div>
          </Fragment>
        ))}
        <span aria-hidden="true" />
        <div className="relative h-4 text-[11px] text-gray-500" aria-hidden="true">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute top-0 tabular-nums"
              style={{
                left: `${pct(t)}%`,
                transform: i === 0 ? undefined : i === ticks.length - 1 && pct(t) > 95 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {formatIncomeTick(t)}
            </span>
          ))}
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.name}>
            <dt className="font-medium text-gray-800">{row.name}</dt>
            <dd className="text-gray-700">
              {row.segments.map((s, i) => (
                <Fragment key={`${s.first}-${s.kind}`}>
                  {i > 0 && <span className="text-gray-400"> · </span>}
                  <span>
                    {s.label}: {rangeText(s, xMin)}
                  </span>
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
