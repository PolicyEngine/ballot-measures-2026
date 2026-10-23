'use client';

import { useState } from 'react';

/** Tile-grid positions [column, row] for the 50 states and DC (statebins layout). */
export const STATE_TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [10, 0],
  VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2],
  MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3],
  PA: [7, 3], NJ: [8, 3], CT: [9, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4],
  VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5],
  DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7],
};

const TILE = 44;
const GAP = 4;
const COLS = 11;
const ROWS = 8;
const WIDTH = COLS * (TILE + GAP) - GAP;
const HEIGHT = ROWS * (TILE + GAP) - GAP;

export interface HighlightedState {
  /** Two-letter code, e.g. "CO". */
  code: string;
  name: string;
  /** e.g. "Amendment 87 and Proposition NN" */
  measures: string[];
}

interface Props {
  highlighted: HighlightedState[];
  /** Called with the state code when a highlighted tile is chosen. */
  onSelect?: (code: string) => void;
  /** Code of the state to outline, if any. */
  selected?: string | null;
}

const listMeasures = (measures: string[]) =>
  measures.length <= 1
    ? (measures[0] ?? '')
    : `${measures.slice(0, -1).join(', ')} and ${measures[measures.length - 1]}`;

/** US tile map with the states that have modeled measures highlighted. */
export default function StateTileMap({ highlighted, onSelect, selected = null }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const byCode = new Map(highlighted.map((s) => [s.code, s]));
  const active = hover ? byCode.get(hover) : null;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="group"
        aria-label="Map of US states; states with measures in this dashboard are highlighted"
      >
        {Object.entries(STATE_TILES).map(([code, [col, row]]) => {
          const state = byCode.get(code);
          const x = col * (TILE + GAP);
          const y = row * (TILE + GAP);
          if (!state) {
            return (
              <g key={code} aria-hidden="true">
                <rect
                  x={x}
                  y={y}
                  width={TILE}
                  height={TILE}
                  rx={4}
                  style={{ fill: 'var(--gray-100)', stroke: 'var(--gray-200)' }}
                />
                <text
                  x={x + TILE / 2}
                  y={y + TILE / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  style={{ fill: 'var(--gray-400)', fontFamily: 'var(--font-sans)' }}
                >
                  {code}
                </text>
              </g>
            );
          }
          const label = `${state.name}: ${listMeasures(state.measures)}`;
          const isSelected = selected === code || hover === code;
          return (
            <g
              key={code}
              role="button"
              tabIndex={0}
              aria-label={label}
              data-state={code}
              style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
              onClick={() => onSelect?.(code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(code);
                }
              }}
              onMouseEnter={() => setHover(code)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(code)}
              onBlur={() => setHover(null)}
            >
              <title>{label}</title>
              <rect
                x={x}
                y={y}
                width={TILE}
                height={TILE}
                rx={4}
                style={{
                  fill: isSelected ? 'var(--color-teal-800)' : 'var(--chart-3)',
                  stroke: isSelected ? 'var(--color-teal-900)' : 'var(--chart-3)',
                  strokeWidth: isSelected ? 3 : 1,
                  transition: 'fill 0.15s',
                }}
              />
              <text
                x={x + TILE / 2}
                y={y + TILE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontWeight={700}
                style={{ fill: 'var(--background)', fontFamily: 'var(--font-sans)', pointerEvents: 'none' }}
              >
                {code}
              </text>
              {state.measures.length > 1 && (
                <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
                  <circle
                    cx={x + TILE - 8}
                    cy={y + 8}
                    r={7}
                    style={{ fill: 'var(--background)', stroke: 'var(--chart-3)', strokeWidth: 1 }}
                  />
                  <text
                    x={x + TILE - 8}
                    y={y + 8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={700}
                    style={{ fill: 'var(--chart-3)', fontFamily: 'var(--font-sans)' }}
                  >
                    {state.measures.length}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 min-h-[1.25rem] text-center text-xs text-gray-600" aria-live="polite">
        {active
          ? `${active.name}: ${listMeasures(active.measures)}`
          : `${highlighted.length} states with measures in this dashboard`}
      </figcaption>
    </figure>
  );
}
