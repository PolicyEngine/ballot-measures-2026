'use client';

import { Fragment, useState } from 'react';
import type { MeasureContent } from '@/content/measures';
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

export type CoverageCutoffs = NonNullable<MeasureContent['coverageCutoffs']>;

/** "up to $6,500", "$7,000 to $23,000". */
function rangeText(s: CoverageSegment, firstIncome: number): string {
  if (s.first === s.last) return formatUSD(s.first);
  if (s.first === firstIncome) return `up to ${formatUSD(s.last)}`;
  return `${formatUSD(s.first)} to ${formatUSD(s.last)}`;
}

/**
 * The cutoff a band ends or starts at, with its reason: "Medicaid ends
 * above $23,000 — the expansion limit, 138% of the poverty line". Income
 * levels come from the household's sweep; the reasons from the content.
 */
export function cutoffText(
  segments: CoverageSegment[],
  i: number,
  cutoffs: CoverageCutoffs | undefined,
): string | null {
  const s = segments[i];
  const next = segments[i + 1];
  const prev = segments[i - 1];
  const why = (text: string | undefined) => (text ? ` — ${text}` : '');
  if (s.kind === 'medicaid' && next) return `Medicaid ends above ${formatUSD(s.last)}${why(cutoffs?.medicaidLimit)}`;
  if (s.kind === 'no_subsidy') {
    if (s.reason === 'work_requirement' && next) return `Work requirement below ${formatUSD(s.end)}${why(cutoffs?.workRequirement)}`;
    if (s.reason === 'below_poverty_line' && next) return `Coverage gap below ${formatUSD(s.end)}${why(cutoffs?.belowPovertyLine)}`;
    if (s.reason === 'above_subsidy_limit' && prev)
      return `No premium tax credit above ${formatUSD(prev.last)}${why(cutoffs?.aboveSubsidyLimit)}`;
  }
  if (s.kind === 'marketplace') {
    if (next?.reason === 'above_subsidy_limit')
      return `Premium tax credit ends above ${formatUSD(s.last)}${why(cutoffs?.aboveSubsidyLimit)}`;
    if (prev) return `Premium tax credit from ${formatUSD(s.first)}`;
  }
  return null;
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
 * colored by coverage, across the calculator's earnings sweep. Hovering,
 * focusing or tapping a band shows its income range and the cutoff where
 * coverage changes; tick marks sit at the band edges.
 */
export default function CoverageBands({
  result,
  entered,
  rowLabels,
  cutoffs,
}: {
  result: HouseholdResponse;
  entered: number | null;
  rowLabels: { baseline: string; reform: string };
  cutoffs?: CoverageCutoffs;
}) {
  const [active, setActive] = useState<{ row: number; index: number } | null>(null);
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
  const isActive = (row: number, index: number) => active?.row === row && active.index === index;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-3 items-center">
        {rows.map((row, r) => (
          <Fragment key={row.name}>
            <span className="text-xs font-medium text-gray-700">{row.name}</span>
            <div className="relative pb-2" role="group" aria-label={`${row.name}: ${describeSegments(row.segments, xMin)}`}>
              <div className="relative h-10 rounded overflow-hidden bg-gray-100">
                {row.segments.map((s, i) => {
                  const cutoff = cutoffText(row.segments, i, cutoffs);
                  const description = `${s.label}, ${rangeText(s, xMin)}${cutoff ? `. ${cutoff}` : ''}`;
                  return (
                    <button
                      key={`${s.first}-${s.kind}`}
                      type="button"
                      aria-label={description}
                      aria-describedby={isActive(r, i) ? `band-tip-${r}` : undefined}
                      onMouseEnter={() => setActive({ row: r, index: i })}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive({ row: r, index: i })}
                      onBlur={() => setActive(null)}
                      onClick={() => setActive(isActive(r, i) ? null : { row: r, index: i })}
                      className="absolute inset-y-0 flex items-center justify-center overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-900"
                      style={{
                        left: `${pct(s.first)}%`,
                        width: `${Math.max(pct(s.end) - pct(s.first), 0.5)}%`,
                        backgroundColor: COVERAGE_COLORS[s.kind],
                        borderLeft: i === 0 ? undefined : '2px solid var(--background)',
                      }}
                    >
                      <span
                        className="truncate px-1 text-[11px] font-medium"
                        style={{ color: DARK_COVERAGE.has(s.kind) ? 'var(--background)' : 'var(--gray-800)' }}
                      >
                        {s.shortLabel}
                      </span>
                    </button>
                  );
                })}
                {marker !== null && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0"
                    style={{ left: `${marker}%`, borderLeft: '2px dashed var(--gray-800)' }}
                  />
                )}
              </div>
              {/* Tick marks at the band edges. */}
              {row.segments.slice(0, -1).map((s) => (
                <span
                  key={`tick-${s.end}`}
                  aria-hidden="true"
                  className="absolute bottom-0 h-2 w-px bg-gray-500"
                  style={{ left: `${pct(s.end)}%` }}
                />
              ))}
              {active?.row === r &&
                (() => {
                  const s = row.segments[active.index];
                  if (!s) return null;
                  const cutoff = cutoffText(row.segments, active.index, cutoffs);
                  const center = (pct(s.first) + pct(s.end)) / 2;
                  return (
                    <div
                      id={`band-tip-${r}`}
                      role="tooltip"
                      data-testid="band-tooltip"
                      className="pointer-events-none absolute bottom-full z-20 mb-1 w-64 max-w-[80vw] rounded px-3 py-2 text-xs shadow-sm"
                      style={{
                        left: `${center}%`,
                        transform: center < 25 ? 'none' : center > 75 ? 'translateX(-100%)' : 'translateX(-50%)',
                        background: 'var(--chart-tooltip-bg)',
                        border: '1px solid var(--chart-tooltip-border)',
                        color: 'var(--text-body)',
                      }}
                    >
                      <p className="font-semibold text-gray-900">{s.label}</p>
                      <p className="tabular-nums text-gray-700">{rangeText(s, xMin)}</p>
                      {cutoff && <p className="mt-1 text-gray-600">{cutoff}</p>}
                    </div>
                  );
                })()}
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

      {/* The same bands as text, for screen readers. */}
      <dl className="sr-only">
        {rows.map((row) => (
          <div key={row.name}>
            <dt>{row.name}</dt>
            <dd>
              {row.segments.map((s, i) => (
                <Fragment key={`${s.first}-${s.kind}`}>
                  {i > 0 && '; '}
                  {s.label}: {rangeText(s, xMin)}
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
