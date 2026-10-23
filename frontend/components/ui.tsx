/** Small presentational pieces shared across tabs, styled like the NJ and SC dashboards. */

export type Tone = 'positive' | 'negative' | 'neutral';

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
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  tone?: Tone;
  badge?: string;
}) {
  const t = CARD_TONES[tone];
  return (
    <div className={`rounded-lg border p-4 ${t.box}`}>
      <p className="text-sm text-gray-700 mb-1 flex flex-wrap items-center gap-2">
        {label}
        {badge && (
          <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {badge}
          </span>
        )}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${t.value}`}>{value}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
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
      >
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
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
