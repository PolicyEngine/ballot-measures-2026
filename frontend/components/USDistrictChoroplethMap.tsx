'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { poleOfInaccessibility, ringArea, type Point } from '@/lib/polylabel';
import { districtsGeojsonUrl } from '@/lib/config';
import { formatShare, formatUSDWithSign } from '@/lib/format';

export interface DistrictMapDatum {
  /** "CO-01" */
  district: string;
  /** "1".."52" */
  district_number: string;
  average_household_income_change: number;
  relative_household_income_change: number;
}

interface Props {
  /** State FIPS code, e.g. 8 for Colorado. */
  stateFips: number;
  /** Two-letter code, e.g. "CO". */
  stateCode: string;
  stateName: string;
  data: DistrictMapDatum[];
  selectedDistrict: string | null;
  onSelect: (districtNumber: string) => void;
}

// The NJ and SC dashboards' diverging gray-teal scale: light gray at $0,
// teal up to the largest gain; losses shade toward dark gray.
const TEAL_RAMP = [
  'var(--diverging-gray-teal-3)',
  'var(--diverging-gray-teal-4)',
  'var(--diverging-gray-teal-5)',
];
const GRAY_RAMP = [
  'var(--diverging-gray-teal-3)',
  'var(--diverging-gray-teal-2)',
  'var(--diverging-gray-teal-1)',
];

const VB_W = 800;
const VB_H = 560;
const VB_PAD = 16;

/** Labels are drawn only on districts whose main area spans at least this
 *  many square view-box units (about 22 x 22). Every Colorado and
 *  Washington district clears it; in California it hides the numbers on
 *  about 30 small urban districts, which the hover card and table still show. */
export const MIN_LABEL_AREA = 500;

type Ring = [number, number][];
export interface GeoFeature {
  type: 'Feature';
  properties: {
    STATEFP?: string;
    STATEAB?: string;
    CD119FP?: string;
    DISTRICT_ID?: string;
    NAMELSAD?: string;
  };
  geometry:
    | { type: 'Polygon'; coordinates: Ring[] }
    | { type: 'MultiPolygon'; coordinates: Ring[][] };
}
interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}
export interface DistrictGeometry {
  districtNumber: string;
  path: string;
  cx: number;
  cy: number;
  /** Projected area of the largest ring, in square view-box units. */
  labelArea: number;
}

/** Keep only the state's features, whatever the file's key scheme. */
export function isStateFeature(
  props: GeoFeature['properties'],
  stateFips: number,
  stateCode: string,
): boolean {
  const fips = String(stateFips).padStart(2, '0');
  return (
    props.STATEFP === fips ||
    props.STATEAB === stateCode ||
    (props.DISTRICT_ID ?? '').startsWith(`${stateCode}-`)
  );
}

/** Color at position t (0..1) along a ramp of CSS colors, blended with
 *  color-mix so the stops can stay CSS variables. */
function rampColor(ramp: string[], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const segments = ramp.length - 1;
  const segPos = clamped * segments;
  const segIndex = Math.min(Math.floor(segPos), segments - 1);
  const segT = segPos - segIndex;
  if (segT === 0) return ramp[segIndex];
  if (segT === 1) return ramp[segIndex + 1];
  const end = (segT * 100).toFixed(2);
  const start = (100 - segT * 100).toFixed(2);
  return `color-mix(in srgb, ${ramp[segIndex]} ${start}%, ${ramp[segIndex + 1]} ${end}%)`;
}

/**
 * Lowest shade for any nonzero change, so small changes (Colorado's
 * districts 3 and 5 under Amendment 87) never look like $0 or missing data.
 */
export const MIN_SHADE = 0.3;

/** Position (0..1) along a ramp: a square-root scale with a visible floor for nonzero values. */
export function shadePosition(value: number, maxAbs: number): number {
  if (maxAbs <= 0 || Math.round(value) === 0) return 0;
  return Math.max(MIN_SHADE, Math.sqrt(Math.min(1, Math.abs(value) / maxAbs)));
}

/** Fill for a dollar change, scaled by the largest absolute change. */
export function districtFill(value: number, maxAbs: number): string {
  if (maxAbs <= 0) return TEAL_RAMP[0];
  const t = shadePosition(value, maxAbs);
  return value >= 0 ? rampColor(TEAL_RAMP, t) : rampColor(GRAY_RAMP, t);
}

/** Pattern for districts without a result: gray hatching. */
const NO_DATA_PATTERN = 'district-no-data';

/** CSS gradient for the legend, matching districtFill. */
function legendGradient(hasGains: boolean, hasLosses: boolean): string {
  const stops = (ramp: string[], from: number, to: number) =>
    ramp.map((c, i) => `${c} ${(from + ((to - from) * i) / (ramp.length - 1)).toFixed(1)}%`);
  const parts =
    hasLosses && hasGains
      ? [...stops([...GRAY_RAMP].reverse(), 0, 50), ...stops(TEAL_RAMP, 50, 100)]
      : hasLosses
        ? stops([...GRAY_RAMP].reverse(), 0, 100)
        : stops(TEAL_RAMP, 0, 100);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

function iterateRings(geom: GeoFeature['geometry']): Ring[] {
  if (geom.type === 'Polygon') return geom.coordinates;
  return geom.coordinates.flat();
}

function computeBBox(features: GeoFeature[]) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of features) {
    for (const ring of iterateRings(f.geometry)) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function makeProjector(bbox: ReturnType<typeof computeBBox>) {
  const meanLat = (bbox.minLat + bbox.maxLat) / 2;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  const geoW = (bbox.maxLon - bbox.minLon) * lonScale;
  const geoH = bbox.maxLat - bbox.minLat;
  const availW = VB_W - 2 * VB_PAD;
  const availH = VB_H - 2 * VB_PAD;
  const scale = Math.min(availW / geoW, availH / geoH);
  const drawnW = geoW * scale;
  const drawnH = geoH * scale;
  const offsetX = VB_PAD + (availW - drawnW) / 2;
  const offsetY = VB_PAD + (availH - drawnH) / 2;
  return (lon: number, lat: number): [number, number] => {
    const x = offsetX + (lon - bbox.minLon) * lonScale * scale;
    const y = offsetY + (bbox.maxLat - lat) * scale;
    return [x, y];
  };
}

function ringToPath(ring: Ring, project: (lon: number, lat: number) => [number, number]): string {
  const out: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const [x, y] = project(lon, lat);
    out.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  out.push('Z');
  return out.join(' ');
}

/** Label position: the pole of inaccessibility of the largest ring (by
 *  area), so labels sit well inside each district's main land mass. */
function featureToPath(
  feature: GeoFeature,
  project: (lon: number, lat: number) => [number, number],
) {
  const rings = iterateRings(feature.geometry);
  const path = rings.map((r) => ringToPath(r, project)).join(' ');
  let best: Point[] = [];
  let bestArea = -1;
  for (const ring of rings) {
    const projected = ring.map(([lon, lat]) => project(lon, lat));
    const area = Math.abs(ringArea(projected));
    if (area > bestArea) {
      best = projected;
      bestArea = area;
    }
  }
  const [cx, cy] = best.length ? poleOfInaccessibility(best) : [VB_W / 2, VB_H / 2];
  return { path, cx, cy, labelArea: Math.max(0, bestArea) };
}

/** District number ("1".."52") from DISTRICT_ID ("CO-01") or CD119FP ("01"). */
function getDistrictNumber(props: GeoFeature['properties']): string | null {
  if (props.DISTRICT_ID) {
    const part = props.DISTRICT_ID.split('-')[1];
    if (part) return String(parseInt(part, 10));
  }
  if (props.CD119FP) {
    const num = parseInt(props.CD119FP, 10);
    if (!Number.isNaN(num)) return String(num);
  }
  return null;
}

/** Project one state's district features into view-box paths. */
export function buildGeometries(
  features: GeoFeature[],
  stateFips: number,
  stateCode: string,
): DistrictGeometry[] {
  const stateFeatures = features.filter((f) => isStateFeature(f.properties, stateFips, stateCode));
  if (stateFeatures.length === 0) return [];
  const project = makeProjector(computeBBox(stateFeatures));
  const geom: DistrictGeometry[] = [];
  for (const f of stateFeatures) {
    const districtNumber = getDistrictNumber(f.properties);
    if (!districtNumber) continue;
    geom.push({ districtNumber, ...featureToPath(f, project) });
  }
  return geom.sort((a, b) => Number(a.districtNumber) - Number(b.districtNumber));
}

export default function USDistrictChoroplethMap({
  stateFips,
  stateCode,
  stateName,
  data,
  selectedDistrict,
  onSelect,
}: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; districtNumber: string } | null>(
    null,
  );
  // One state's boundaries, cached across tab switches and retried on failure.
  const boundaries = useQuery<DistrictGeometry[]>({
    queryKey: ['districtBoundaries', stateCode],
    queryFn: async () => {
      const res = await fetch(districtsGeojsonUrl(stateCode));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GeoCollection;
      const geom = buildGeometries(json.features, stateFips, stateCode);
      if (geom.length === 0) throw new Error(`no ${stateName} districts in the boundary file`);
      return geom;
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 2000),
  });
  const geometries = boundaries.data ?? null;
  const geoError = boundaries.error ? (boundaries.error as Error).message : null;

  const dataByDistrict = useMemo(() => {
    const map = new Map<string, DistrictMapDatum>();
    data.forEach((d) => map.set(String(parseInt(d.district_number, 10)), d));
    return map;
  }, [data]);

  const maxAbs = useMemo(
    () => Math.max(0, ...data.map((d) => Math.abs(d.average_household_income_change))),
    [data],
  );
  const hasLosses = data.some((d) => d.average_household_income_change < 0);
  const hasGains = data.some((d) => d.average_household_income_change > 0);
  const tooltipData = tooltip ? dataByDistrict.get(tooltip.districtNumber) : null;
  const count = geometries?.length ?? data.length;

  return (
    <div className="relative">
      {geoError && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" role="alert">
          <span>
            Couldn&apos;t load the {stateName} district boundaries ({geoError}). The table below lists every district.
          </span>
          <button
            type="button"
            onClick={() => void boundaries.refetch()}
            className="rounded-lg border border-primary-500 bg-white px-3 py-1 font-medium text-primary-700 hover:bg-primary-50"
          >
            Retry
          </button>
        </div>
      )}
      {boundaries.isLoading && (
        <div
          data-testid="district-map-skeleton"
          aria-label={`Loading the ${stateName} district map`}
          role="status"
          className="w-full animate-pulse rounded-lg bg-gray-100"
          style={{ aspectRatio: `${VB_W} / ${VB_H}`, maxHeight: 560 }}
        />
      )}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: '100%', height: 'auto', maxHeight: 560 }}
        role="img"
        aria-label={`Map of ${stateName}'s ${count} congressional districts shaded by average change in household net income`}
        className={boundaries.isLoading ? 'hidden' : undefined}
      >
        <defs>
          <pattern id={NO_DATA_PATTERN} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" style={{ fill: 'var(--background)' }} />
            <line x1="0" y1="0" x2="0" y2="8" strokeWidth="3" style={{ stroke: 'var(--gray-300)' }} />
          </pattern>
        </defs>
        {geometries &&
          geometries.map((g) => {
            const districtData = dataByDistrict.get(g.districtNumber);
            const value = districtData?.average_household_income_change ?? 0;
            const fill = districtData ? districtFill(value, maxAbs) : `url(#${NO_DATA_PATTERN})`;
            const isSelected = selectedDistrict === g.districtNumber;
            const setTip = (evt: React.MouseEvent) =>
              setTooltip({ x: evt.clientX, y: evt.clientY, districtNumber: g.districtNumber });
            return (
              <g
                key={g.districtNumber}
                data-district={g.districtNumber}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(g.districtNumber)}
                onMouseEnter={setTip}
                onMouseMove={setTip}
                onMouseLeave={() => setTooltip(null)}
              >
                <path
                  d={g.path}
                  data-no-data={districtData ? undefined : 'true'}
                  strokeWidth={isSelected ? 2.5 : districtData ? 0.75 : 1.25}
                  strokeLinejoin="round"
                  strokeDasharray={districtData ? undefined : '4 3'}
                  style={{
                    fill,
                    stroke: isSelected ? 'var(--color-teal-900)' : districtData ? 'var(--background)' : 'var(--gray-500)',
                    transition: 'opacity 0.15s',
                    opacity: tooltip && tooltip.districtNumber !== g.districtNumber ? 0.7 : 1,
                  }}
                />
              </g>
            );
          })}
        {/* Labels drawn last so neighboring districts never cover them. */}
        {geometries &&
          geometries
            .filter((g) => g.labelArea >= MIN_LABEL_AREA)
            .map((g) => (
              <text
                key={`label-${g.districtNumber}`}
                data-label={g.districtNumber}
                x={g.cx}
                y={g.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={count > 20 ? 11 : 16}
                fontWeight="700"
                strokeWidth={count > 20 ? 2.5 : 3}
                paintOrder="stroke"
                style={{
                  fill: 'var(--gray-800)',
                  stroke: 'var(--background)',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {g.districtNumber}
              </text>
            ))}
      </svg>

      {tooltip && tooltipData && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}
        >
          <p className="font-semibold text-gray-900">{tooltipData.district}</p>
          <p className="text-sm text-gray-600">
            Average change: {formatUSDWithSign(tooltipData.average_household_income_change)}
          </p>
          <p className="text-sm text-gray-600">
            ({formatShare(tooltipData.relative_household_income_change, 2, { sign: true })} of net
            income)
          </p>
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-3 flex flex-col items-center gap-1 text-xs text-gray-500">
          <div
            aria-hidden="true"
            className="h-2.5 w-56 rounded-sm"
            style={{ background: legendGradient(hasGains, hasLosses) }}
          />
          <div className="flex w-56 justify-between tabular-nums">
            <span>{formatUSDWithSign(hasLosses ? -maxAbs : 0)}</span>
            <span>{formatUSDWithSign(hasGains ? maxAbs : 0)}</span>
          </div>
          <span>Average change in household net income (119th Congress districts)</span>
          <span className="flex items-center gap-1.5" data-testid="no-data-key">
            <svg width="16" height="12" aria-hidden="true">
              <rect
                x="0.5"
                y="0.5"
                width="15"
                height="11"
                strokeDasharray="3 2"
                style={{ fill: `url(#${NO_DATA_PATTERN})`, stroke: 'var(--gray-500)' }}
              />
            </svg>
            No data
          </span>
          {geometries && geometries.some((g) => g.labelArea < MIN_LABEL_AREA) && (
            <span>Small districts are unlabeled; hover over the map or see the table.</span>
          )}
        </div>
      )}
    </div>
  );
}
