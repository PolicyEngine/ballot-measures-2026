'use client';

/** Shared Recharts styling and helpers (CSS-variable colors throughout). */

import { Text } from 'recharts';
import { formatUSD } from '@/lib/format';
import ChartWatermark from './ChartWatermark';

export const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 20 };

export const TICK_STYLE = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fill: 'var(--chart-axis-label)',
};

/** Five-bucket winners and losers: gains teal, losses gray. */
export const WINNERS_COLORS = {
  gainMore5: 'var(--chart-gain-more-5)',
  gainLess5: 'var(--chart-gain-less-5)',
  noChange: 'var(--chart-no-change)',
  loseLess5: 'var(--chart-lose-less-5)',
  loseMore5: 'var(--chart-lose-more-5)',
};

export const SIGN_COLORS = {
  positive: 'var(--chart-positive)',
  negative: 'var(--chart-negative)',
};

/** Round step (1/2/5 x 10^n) for roughly three ticks per side. */
export function niceStep(maxAbs: number, ticksPerSide = 3): number {
  const rough = (maxAbs || 1) / ticksPerSide;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  if (residual <= 1) return mag;
  if (residual <= 2) return 2 * mag;
  if (residual <= 5) return 5 * mag;
  return 10 * mag;
}

/**
 * Domain and ticks covering `values` on round steps. The axis collapses to
 * one side of zero (about five ticks) when every value shares a sign, and
 * is symmetric (about three ticks per side) otherwise.
 */
export function niceDomain(values: number[]): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v));
  const maxAbs = Math.max(...finite.map(Math.abs), 0);
  const hasPositive = finite.some((v) => v > 0);
  const hasNegative = finite.some((v) => v < 0);
  const step = niceStep(maxAbs, hasPositive && hasNegative ? 3 : 5);
  const top = Math.max(step, Math.ceil(maxAbs / step) * step);
  const domain: [number, number] =
    hasNegative && !hasPositive ? [-top, 0] : hasPositive && !hasNegative ? [0, top] : [-top, top];
  const count = Math.round((domain[1] - domain[0]) / step) + 1;
  const ticks = Array.from({ length: count }, (_, i) =>
    Number((domain[0] + i * step).toPrecision(12)),
  );
  return { domain, ticks };
}

/** Whole-number ticks from 0 for small counts (people enrolled in a household). */
export function countDomain(values: number[]): { domain: [number, number]; ticks: number[] } {
  const top = Math.max(1, Math.ceil(Math.max(0, ...values.filter((v) => Number.isFinite(v)))));
  const step = top <= 5 ? 1 : niceStep(top, 5);
  const end = Math.ceil(top / step) * step;
  return { domain: [0, end], ticks: Array.from({ length: end / step + 1 }, (_, i) => i * step) };
}

/** Decimals that keep round tick labels distinct: a 0.05 step needs 2, 0.5 needs 1, 5 needs 0. */
export function tickDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (!(step > 0) || step >= 1) return 0;
  return Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
}

/** Tooltip box matching app-v2 styling. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number, name: string) => string;
  labelFormatter?: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--chart-tooltip-bg)',
        border: '1px solid var(--chart-tooltip-border)',
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
      }}
    >
      {label !== undefined && label !== '' && (
        <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text-heading)' }}>
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      {payload.map((entry, i) => {
        const raw = Array.isArray(entry.value) ? entry.value[1] : entry.value;
        const value = typeof raw === 'number' ? raw : Number(raw);
        const name = String(entry.name ?? entry.dataKey ?? '');
        return (
          <p key={i} style={{ margin: 0, color: 'var(--text-body)' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                marginRight: 6,
                backgroundColor: entry.color,
              }}
            />
            {name}: {formatter ? formatter(value, name) : value}
          </p>
        );
      })}
    </div>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  /** Square swatch for bars (default), a line for line series. */
  shape?: 'square' | 'line' | 'dashed';
}

/** Small legend row of colored swatches. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block"
            style={
              item.shape === 'line'
                ? { width: 16, height: 3, borderRadius: 2, backgroundColor: item.color }
                : item.shape === 'dashed'
                  ? { width: 16, borderTop: `2px dashed ${item.color}` }
                  : { width: 12, height: 12, borderRadius: 2, backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Category tick that wraps long labels onto several lines. Recharts clones
 * it with x, y, payload, the axis width, and the tick count (hence
 * `maxWidth` for our own limit). Use anchor "middle" on an x-axis, where a
 * label never grows wider than its band, and "end" on a y-axis.
 */
export function WrappedTick({
  x,
  y,
  payload,
  width,
  visibleTicksCount,
  maxWidth = 120,
  anchor = 'end',
  shortLabels,
}: {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  width?: number;
  visibleTicksCount?: number;
  maxWidth?: number;
  anchor?: 'end' | 'middle';
  /** Shorter labels used when the band is too narrow (phones). */
  shortLabels?: Record<string, string>;
}) {
  const band =
    anchor === 'middle' && width && visibleTicksCount ? width / visibleTicksCount - 6 : Infinity;
  const label = String(payload?.value ?? '');
  const narrow = band < 90;
  return (
    <Text
      x={x}
      y={y}
      width={Math.max(40, Math.min(maxWidth, band))}
      textAnchor={anchor}
      verticalAnchor={anchor === 'end' ? 'middle' : 'start'}
      style={narrow && shortLabels ? { ...TICK_STYLE, fontSize: 10 } : TICK_STYLE}
    >
      {(narrow && shortLabels?.[label]) || label}
    </Text>
  );
}

/**
 * Value label for a bar that can be positive or negative: above a positive
 * bar, below a negative one. Skips bars too narrow for a readable label
 * (phones), where the tooltip still shows the value.
 */
export function SignedBarLabel({
  x,
  y,
  width,
  height,
  value,
  format,
  minWidth = 28,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  format: (v: number) => string;
  minWidth?: number;
}) {
  const [bx, by, bw, bh, v] = [x, y, width, height, value].map(Number);
  if (![bx, by, bw, bh, v].every(Number.isFinite) || bw < minWidth) return null;
  const top = Math.min(by, by + bh);
  const bottom = Math.max(by, by + bh);
  const below = v < 0;
  return (
    <text
      x={bx + bw / 2}
      y={below ? bottom + 13 : top - 5}
      textAnchor="middle"
      style={{ ...TICK_STYLE, fontSize: 11, fill: 'var(--text-heading)', fontWeight: 600 }}
    >
      {format(v)}
    </text>
  );
}

/** Chart block: heading, optional controls, chart, legend, watermark, and a
 *  one-line caption. `description` is visually hidden text for screen
 *  readers (e.g. SweepChartDescription). */
export function ChartFigure({
  title,
  actions,
  legend,
  caption,
  description,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  legend?: LegendItem[];
  caption?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="space-y-3" aria-label={title}>
      {description && <div className="sr-only">{description}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {actions}
      </div>
      {children}
      {legend && <ChartLegend items={legend} />}
      <ChartWatermark />
      {caption && <figcaption className="text-xs text-gray-500">{caption}</figcaption>}
    </figure>
  );
}

/** Pill toggle used inside a chart's header (e.g. relative / absolute). */
export function PillToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            value === o.value
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface DescribedSeries {
  label: string;
  values: number[];
  format: (value: number) => string;
}

/** About `count` evenly spaced indices, always with the first, the last and `include`. */
export function sampleIndices(length: number, count = 10, include: number | null = null): number[] {
  if (length <= 0) return [];
  const step = Math.max(1, Math.ceil((length - 1) / Math.max(1, count)));
  const picked = new Set<number>([length - 1]);
  for (let i = 0; i < length; i += step) picked.add(i);
  if (include !== null && include >= 0 && include < length) picked.add(include);
  return Array.from(picked).sort((a, b) => a - b);
}

/**
 * Screen-reader text for a chart over the calculator's earnings sweep: what
 * it plots and over what range, the values at the household's income, and a
 * table of incomes sampled across the sweep.
 */
export function SweepChartDescription({
  title,
  incomes,
  series,
  entered,
  atIncome,
}: {
  title: string;
  incomes: number[];
  series: DescribedSeries[];
  /** The household's employment income, when known. */
  entered: number | null;
  /** Values at the household's income, already formatted. */
  atIncome?: { label: string; value: string }[];
}) {
  if (incomes.length === 0) return null;
  const enteredIndex = entered === null ? null : incomes.indexOf(entered);
  const rows = sampleIndices(incomes.length, 10, enteredIndex);
  return (
    <>
      <p>
        {`Line chart: ${title}, for employment income from ${formatUSD(incomes[0])} to ${formatUSD(
          incomes[incomes.length - 1],
        )}. Lines: ${series.map((s) => s.label).join('; ')}.`}
        {entered !== null && atIncome?.length
          ? ` At your employment income of ${formatUSD(entered)}: ${atIncome
              .map((a) => `${a.label} ${a.value}`)
              .join('; ')}.`
          : ''}
      </p>
      <table>
        <caption>{`${title}, selected incomes`}</caption>
        <thead>
          <tr>
            <th scope="col">Employment income</th>
            {series.map((s) => (
              <th key={s.label} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={incomes[i]}>
              <th scope="row">{formatUSD(incomes[i])}</th>
              {series.map((s) => (
                <td key={s.label}>{s.format(s.values[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
