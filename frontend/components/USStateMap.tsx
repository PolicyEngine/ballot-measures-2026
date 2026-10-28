'use client';

/**
 * Geographic US map for the landing page, adapted from the SNAP work
 * requirements dashboard (snap-wr-dashboard OverviewTab): states with
 * measures are teal, the rest light gray. Hovering or focusing a state
 * shows its measures with PolicyEngine's headline and the official
 * estimate; selecting it opens the measure (or, for a state with several,
 * its cards). Keyboard users tab between the highlighted states; a live
 * caption names the active one.
 */

import { useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import geoTopo from '@/lib/data/us-states-10m.json';
import { fipsToPostal } from '@/lib/states';
import { officialLine } from './MeasureCard';

export interface MapMeasure {
  /** "Amendment 87" */
  designation: string;
  shortTitle: string;
  /** "Change in state revenue, 2027" */
  label: string;
  /** PolicyEngine's headline figure, formatted; null until results load. */
  headline: string | null;
  /** The official estimate, formatted; null when none is published. */
  official: string | null;
  /** What the official figure measures, e.g. "Official estimate" or "Enrolled through expansion". */
  officialLabel: string;
}

export interface MapState {
  /** Two-letter code, e.g. "CO". */
  code: string;
  name: string;
  measures: MapMeasure[];
}

interface Props {
  states: MapState[];
  /** Called with the state code when a highlighted state is chosen. */
  onSelect?: (code: string) => void;
  /** Code of the state to outline, if any. */
  selected?: string | null;
}

interface Tip {
  code: string;
  x: number;
  y: number;
}

export const listDesignations = (measures: { designation: string }[]) =>
  measures.length <= 1
    ? (measures[0]?.designation ?? '')
    : `${measures
        .slice(0, -1)
        .map((m) => m.designation)
        .join(', ')} and ${measures[measures.length - 1].designation}`;

export default function USStateMap({ states, onSelect, selected = null }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const byCode = new Map(states.map((s) => [s.code, s]));
  const active = tip ? byCode.get(tip.code) : null;

  const showAt = (code: string, x: number, y: number) => setTip({ code, x, y });
  const showAtElement = (code: string, el: Element) => {
    const r = el.getBoundingClientRect();
    showAt(code, r.left + r.width / 2, r.top + r.height / 2);
  };

  return (
    <figure className="relative w-full">
      <div role="group" aria-label="Map of US states; states with measures in this dashboard are highlighted">
        {/* 800 x 500 fits the Albers USA map (with Alaska and Hawaii) without empty bands above and below. */}
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1000 }}
          width={800}
          height={500}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={geoTopo as object}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const code = fipsToPostal(geo.id as string);
                const state = code ? byCode.get(code) : undefined;
                if (!state || !code) {
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      aria-hidden="true"
                      tabIndex={-1}
                      style={{
                        default: { fill: 'var(--gray-200)', stroke: 'var(--background)', strokeWidth: 0.75, outline: 'none' },
                        hover: { fill: 'var(--gray-200)', stroke: 'var(--background)', strokeWidth: 0.75, outline: 'none' },
                        pressed: { fill: 'var(--gray-200)', outline: 'none' },
                      }}
                    />
                  );
                }
                const isActive = selected === code || tip?.code === code;
                const fill = isActive ? 'var(--color-teal-800)' : 'var(--chart-3)';
                const label = `${state.name}: ${listDesignations(state.measures)}`;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    data-state={code}
                    onClick={() => onSelect?.(code)}
                    onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(code);
                      }
                    }}
                    onMouseEnter={(e: React.MouseEvent<SVGPathElement>) => showAt(code, e.clientX, e.clientY)}
                    onMouseMove={(e: React.MouseEvent<SVGPathElement>) => showAt(code, e.clientX, e.clientY)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e: React.FocusEvent<SVGPathElement>) => showAtElement(code, e.currentTarget)}
                    onBlur={() => setTip(null)}
                    style={{
                      default: {
                        fill,
                        stroke: 'var(--background)',
                        strokeWidth: isActive ? 1.5 : 0.75,
                        outline: 'none',
                        cursor: onSelect ? 'pointer' : 'default',
                        transition: 'fill 0.15s',
                      },
                      hover: { fill: 'var(--color-teal-800)', stroke: 'var(--background)', strokeWidth: 1.5, outline: 'none', cursor: 'pointer' },
                      pressed: { fill: 'var(--color-teal-900)', outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>

      {active && tip && (
        <div
          role="tooltip"
          data-testid="map-tooltip"
          className="pointer-events-none fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg"
          style={{ left: Math.min(tip.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 296), top: tip.y + 12 }}
        >
          <p className="font-semibold text-gray-900">{active.name}</p>
          <ul className="mt-1 space-y-2">
            {active.measures.map((m) => (
              <li key={m.designation} className="text-sm">
                <p className="font-medium text-gray-800">
                  {m.designation}: {m.shortTitle}
                </p>
                <p className="text-gray-600 tabular-nums">
                  {m.label}: {m.headline ?? 'loading'}
                  {m.official ? ` · ${officialLine(m.official, m.officialLabel)}` : ''}
                </p>
              </li>
            ))}
          </ul>
          {active.measures.length > 1 && <p className="mt-1 text-xs text-gray-500">Select to see both measures</p>}
        </div>
      )}

      <figcaption className="sr-only" aria-live="polite">
        {active ? `${active.name}: ${listDesignations(active.measures)}` : ''}
      </figcaption>
    </figure>
  );
}

