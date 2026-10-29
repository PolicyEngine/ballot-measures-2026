'use client';

/**
 * Geographic US map for the landing page, adapted from the SNAP work
 * requirements dashboard (snap-wr-dashboard OverviewTab): states with
 * measures are teal, the rest light gray. Hovering or focusing a state
 * names it and its measures; selecting it (click, tap, Enter or Space)
 * opens a dialog with each measure's policy overview and link. Keyboard
 * users tab between the highlighted states; a live caption names the
 * active one.
 */

import { useCallback, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import geoTopo from '@/lib/data/us-states-10m.json';
import type { LandingState } from '@/lib/landing';
import { fipsToPostal } from '@/lib/states';
import StateMeasuresDialog, { type DialogPlacement } from './StateMeasuresDialog';

export type MapState = LandingState;

interface Props {
  states: MapState[];
  /** Called with the state code when a highlighted state's dialog opens. */
  onSelect?: (code: string) => void;
}

interface Tip {
  code: string;
  x: number;
  y: number;
}

interface OpenDialog {
  code: string;
  placement: DialogPlacement;
  /** The state's path, which gets focus back when the dialog closes. */
  opener: SVGPathElement | null;
}

/** At or below this width the dialog is a centered sheet. */
const PHONE_MAX_WIDTH = 639;
/** The anchored dialog's width (w-[22rem]) and its gap from the state. */
const DIALOG_WIDTH = 352;
const DIALOG_GAP = 12;

export const listDesignations = (measures: { designation: string }[]) =>
  measures.length <= 1
    ? (measures[0]?.designation ?? '')
    : `${measures
        .slice(0, -1)
        .map((m) => m.designation)
        .join(', ')} and ${measures[measures.length - 1].designation}`;

/** Beside the state, to its right when it fits within the map and otherwise to its left. */
function placeBeside(state: DOMRect, map: DOMRect): DialogPlacement {
  const right = state.right - map.left + DIALOG_GAP;
  const left = state.left - map.left - DIALOG_WIDTH - DIALOG_GAP;
  const x = right + DIALOG_WIDTH <= map.width ? right : left >= 0 ? left : Math.max(0, map.width - DIALOG_WIDTH);
  return { kind: 'anchored', x, y: Math.max(0, state.top - map.top) };
}

export default function USStateMap({ states, onSelect }: Props) {
  const figureRef = useRef<HTMLElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // Focus that returns to a state when its dialog closes shows no tooltip.
  const quietFocus = useRef(false);
  const byCode = new Map(states.map((s) => [s.code, s]));
  const active = tip && !dialog ? byCode.get(tip.code) : null;
  const openState = dialog ? byCode.get(dialog.code) : null;

  const showAt = (code: string, x: number, y: number) => setTip({ code, x, y });

  const open = (code: string, el: SVGPathElement) => {
    setTip(null);
    const map = figureRef.current?.getBoundingClientRect();
    const phone = typeof window !== 'undefined' && window.innerWidth <= PHONE_MAX_WIDTH;
    const placement: DialogPlacement =
      phone || !map ? { kind: 'sheet' } : placeBeside(el.getBoundingClientRect(), map);
    setDialog({ code, placement, opener: el });
    onSelect?.(code);
  };

  const close = useCallback(() => {
    const opener = dialog?.opener ?? null;
    setDialog(null);
    quietFocus.current = true;
    opener?.focus();
    quietFocus.current = false;
  }, [dialog]);

  return (
    <figure ref={figureRef} className="relative w-full">
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
                const isActive = dialog?.code === code || tip?.code === code;
                const fill = isActive ? 'var(--color-teal-800)' : 'var(--chart-3)';
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    role="button"
                    tabIndex={0}
                    aria-label={`${state.name}: ${listDesignations(state.measures)}`}
                    aria-haspopup="dialog"
                    aria-expanded={dialog?.code === code}
                    data-state={code}
                    onClick={(e: React.MouseEvent<SVGPathElement>) => open(code, e.currentTarget)}
                    onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        open(code, e.currentTarget);
                      }
                    }}
                    onMouseEnter={(e: React.MouseEvent<SVGPathElement>) => showAt(code, e.clientX, e.clientY)}
                    onMouseMove={(e: React.MouseEvent<SVGPathElement>) => showAt(code, e.clientX, e.clientY)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e: React.FocusEvent<SVGPathElement>) => {
                      if (quietFocus.current) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      showAt(code, r.left + r.width / 2, r.top + r.height / 2);
                    }}
                    onBlur={() => setTip(null)}
                    style={{
                      default: {
                        fill,
                        stroke: 'var(--background)',
                        strokeWidth: isActive ? 1.5 : 0.75,
                        outline: 'none',
                        cursor: 'pointer',
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

      {/* Hover stays light: the state and its measures' names. */}
      {active && tip && (
        <div
          role="tooltip"
          data-testid="map-tooltip"
          className="pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg"
          style={{ left: Math.min(tip.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 264), top: tip.y + 12 }}
        >
          <p className="font-semibold text-gray-900">{active.name}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
            {active.measures.map((m) => (
              <li key={m.slug}>
                {m.designation}: {m.shortTitle}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500">Select for details</p>
        </div>
      )}

      {openState && dialog && <StateMeasuresDialog state={openState} placement={dialog.placement} onClose={close} />}

      <figcaption className="sr-only" aria-live="polite">
        {active ? `${active.name}: ${listDesignations(active.measures)}` : ''}
      </figcaption>
    </figure>
  );
}
