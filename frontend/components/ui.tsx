/** Small presentational pieces shared across tabs, styled like the NJ and SC dashboards. */

import { useId } from 'react';

export type Tone = 'positive' | 'negative' | 'neutral';

/**
 * Keyboard handler for a tablist or radiogroup with a roving tabindex (only
 * the selected option is in the tab order). Left/Right move to the previous
 * or next option, wrapping; Home/End go to the first or last. Radio groups
 * also take Up/Down. The new option is selected and focused. Attach it to the
 * container whose `role="tab"` / `role="radio"` children follow `values`.
 */
export function rovingKeyDown<T>(
  event: React.KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  select: (value: T) => void,
): void {
  const n = values.length;
  if (n === 0) return;
  const radio = event.currentTarget.getAttribute('role') === 'radiogroup';
  const i = Math.max(0, values.indexOf(current));
  let next: number;
  switch (event.key) {
    case 'ArrowRight':
      next = (i + 1) % n;
      break;
    case 'ArrowLeft':
      next = (i - 1 + n) % n;
      break;
    case 'ArrowDown':
      if (!radio) return;
      next = (i + 1) % n;
      break;
    case 'ArrowUp':
      if (!radio) return;
      next = (i - 1 + n) % n;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = n - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  if (next !== i) select(values[next]);
  const options = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"], [role="radio"]');
  options[next]?.focus();
}

/**
 * FUTA-style headline stat: an uppercase label, a large value and a short
 * note. `highlight` is the teal lead card; the rest are gray. A badge (such
 * as a FigureBasis pill) sits beside the label, outside the uppercase text.
 */
export function StatCard({
  label,
  value,
  detail,
  footnote,
  badge,
  highlight = false,
  size = 'md',
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  footnote?: React.ReactNode;
  badge?: React.ReactNode;
  highlight?: boolean;
  /** lg: overview headline (text-3xl); md: tab cards (text-2xl). */
  size?: 'md' | 'lg';
}) {
  return (
    <div
      data-testid="stat-card"
      className={`rounded-lg border p-5 ${highlight ? 'bg-teal-50 border-teal-100' : 'bg-gray-50 border-gray-200'}`}
    >
      <div className="mb-1 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        {badge}
      </div>
      <p
        className={`${size === 'lg' ? 'text-3xl' : 'text-2xl'} font-bold tabular-nums ${
          highlight ? 'text-teal-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      {detail && <p className="text-sm text-gray-500 mt-1">{detail}</p>}
      {footnote && (
        <p className="text-xs leading-4 text-gray-500 mt-2 border-t border-gray-200 pt-2" data-testid="card-footnote">
          {footnote}
        </p>
      )}
    </div>
  );
}

/**
 * FUTA's year picker: rounded pills, the selected year teal. A radio group
 * with a roving tabindex, so arrow keys move between years.
 */
export function YearPills({
  years,
  value,
  onChange,
  label = 'Tax year',
}: {
  years: readonly number[];
  value: number;
  onChange: (year: number) => void;
  label?: string;
}) {
  const id = useId();
  if (years.length < 2) return null;
  return (
    <div>
      <span id={id} className="sr-only">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="flex flex-wrap items-center gap-2"
        onKeyDown={(e) => rovingKeyDown(e, years, value, onChange)}
      >
        {years.map((y) => (
          <button
            key={y}
            type="button"
            role="radio"
            aria-checked={y === value}
            tabIndex={y === value ? 0 : -1}
            onClick={() => onChange(y)}
            className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
              y === value ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tone for a dollar change: rounds to whole dollars first. */
export const toneOf = (value: number | null): Tone =>
  value === null || Math.round(value) === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative';

const CARD_TONES: Record<Tone, { box: string; value: string }> = {
  positive: { box: 'bg-green-50 border-success', value: 'text-green-600' },
  negative: { box: 'bg-red-50 border-red-300', value: 'text-red-600' },
  neutral: { box: 'bg-gray-50 border-gray-200', value: 'text-gray-900' },
};

/** Text color for a signed value in tables and cards. */
export const toneText = (tone: Tone) => CARD_TONES[tone].value;

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  badge,
  footnote,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  tone?: Tone;
  /** A short pill beside the label (text), or a node such as a BasisBadge. */
  badge?: React.ReactNode;
  /** A line under the detail, e.g. the model's value before calibration. */
  footnote?: React.ReactNode;
}) {
  const t = CARD_TONES[tone];
  return (
    <div className={`rounded-lg border p-4 ${t.box}`}>
      <p className="text-sm text-gray-700 mb-1 flex flex-wrap items-center gap-2">
        {label}
        {typeof badge === 'string' ? (
          <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {badge}
          </span>
        ) : (
          badge
        )}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${t.value}`}>{value}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
      {footnote && (
        <p className="text-[11px] leading-4 text-gray-500 mt-2 border-t border-gray-200 pt-2" data-testid="card-footnote">
          {footnote}
        </p>
      )}
    </div>
  );
}

/** Gray callout for caveats and notes (the NJ and SC dashboards' note box). */
export function Callout({
  children,
  role,
  title,
}: {
  children: React.ReactNode;
  role?: 'status' | 'alert' | 'note';
  title?: string;
}) {
  return (
    <div
      role={role}
      className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
    >
      {title && <p className="font-semibold text-gray-900 mb-1">{title}</p>}
      {children}
    </div>
  );
}

/** Compact table with a row header column. */
export function CompareTable({
  caption,
  firstColumn,
  columns,
  rows,
  align = 'right',
}: {
  caption: string;
  firstColumn: string;
  columns: readonly string[];
  rows: { label: string; values: readonly React.ReactNode[] }[];
  /** Alignment of the value columns. */
  align?: 'right' | 'left';
}) {
  const cell = align === 'right' ? 'text-right' : 'text-left';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-sm font-semibold text-gray-800 mb-2">{caption}</caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="text-left py-2 pr-3 font-medium text-gray-600">
              {firstColumn}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className={`${cell} py-2 px-3 font-medium text-gray-600`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="text-left py-2 pr-3 font-normal text-gray-800">
                {row.label}
              </th>
              {row.values.map((v, i) => (
                <td key={i} className={`${cell} py-2 px-3 tabular-nums text-gray-800`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Results not yet available" panel for a missing results file. */
export function ResultsUnavailable({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-5" role="status">
      <h3 className="text-gray-800 font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-600">
        This section fills in once the microsimulation pipeline publishes its results.
      </p>
      {detail && <p className="text-xs text-gray-500 mt-2">{detail}</p>}
    </div>
  );
}

/** Spinner for data that is loading. */
export function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary-500 border-r-transparent" />
        <p className="mt-3 text-sm text-gray-600">{label}</p>
      </div>
    </div>
  );
}

/** Segmented control (radio group), e.g. the year selector. */
export function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={id} className="text-sm font-medium text-gray-700">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1"
        onKeyDown={(e) =>
          rovingKeyDown(
            e,
            options.map((o) => o.value),
            value,
            onChange,
          )
        }
      >
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-white hover:text-primary-700'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** External link that opens in a new tab. */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-700 underline underline-offset-2 hover:text-primary-800"
    >
      {children}
    </a>
  );
}
