'use client';

import { getContent, type Comparison, type SimpleTable } from '@/content/measures';
import { formatLongDate } from '@/lib/format';
import { ELECTION_DATE, useMetrics, type Measure } from '@/lib/measures';
import { headlineFor } from '@/lib/metrics';
import { yearsLabel } from './MeasureCard';
import { ExternalLink } from './ui';

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-lg font-semibold text-gray-900 mb-3">
      {children}
    </h3>
  );
}

export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  const [current, passes] = comparison.columns ?? ['Current law', 'If it passes'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-sm font-semibold text-gray-800 mb-2">
          {comparison.caption}
        </caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="text-left py-2 pr-3 font-medium text-gray-600">
              <span className="sr-only">Group</span>
            </th>
            <th scope="col" className="text-left py-2 px-3 font-medium text-gray-600">
              {current}
            </th>
            <th scope="col" className="text-left py-2 px-3 font-medium text-gray-600">
              {passes}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {comparison.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="text-left py-2 pr-3 font-normal text-gray-800">
                {row.label}
              </th>
              <td className="py-2 px-3 text-gray-700">{row.currentLaw}</td>
              <td className="py-2 px-3 text-gray-900 font-medium">{row.ifPasses}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {comparison.note && <p className="text-xs text-gray-500 mt-2">{comparison.note}</p>}
    </div>
  );
}

export function SimpleDataTable({ table }: { table: SimpleTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-sm font-semibold text-gray-800 mb-2">{table.caption}</caption>
        <thead>
          <tr className="border-b border-gray-200">
            {table.columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`py-2 px-3 font-medium text-gray-600 ${i === 0 ? 'text-left pl-0' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {table.rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="text-left py-2 pr-3 font-normal text-gray-800">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="text-right py-2 px-3 tabular-nums text-gray-800">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {table.note && <p className="text-xs text-gray-500 mt-2">{table.note}</p>}
    </div>
  );
}

function AtAGlance({ measure }: { measure: Measure }) {
  const { data: metrics, isLoading } = useMetrics(measure.slug, measure.headline_year);
  const headline = headlineFor(measure, metrics);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">PolicyEngine estimate</p>
        <p className="text-2xl font-bold tabular-nums text-gray-900 mt-1">
          {headline.model ?? (
            <span className="text-base font-medium text-gray-500">
              {isLoading ? 'Loading…' : 'Results not yet available'}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-1">{headline.label}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">{headline.officialLabel}</p>
        <p className="text-2xl font-bold tabular-nums text-gray-700 mt-1">
          {headline.official ?? <span className="text-base font-medium text-gray-500">None published</span>}
        </p>
        {headline.officialSource && <p className="text-xs text-gray-500 mt-1">{headline.officialSource}</p>}
      </div>
    </div>
  );
}

interface Props {
  measure: Measure;
}

/** Overview tab: what the measure does, current law vs. if it passes, who is affected. */
export default function PolicyOverview({ measure }: Props) {
  const content = getContent(measure.slug);
  const facts: [string, string][] = [
    ['Election', formatLongDate(ELECTION_DATE)],
    ['How it reached the ballot', content.measureType],
    ['When it would take effect', content.effectiveDate],
    ['Years modeled', yearsLabel(measure.years)],
  ];

  return (
    <div className="space-y-10">
      {content.scenario && (
        <section
          aria-labelledby="scenario-heading"
          className="rounded-lg border border-gray-300 border-l-4 border-l-primary-500 bg-gray-50 p-5"
        >
          <h2 id="scenario-heading" className="text-lg font-bold text-gray-900 mb-2">
            {content.scenario.title}
          </h2>
          <div className="space-y-2 text-sm text-gray-700">
            {content.scenario.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="what-heading">
        <h2 id="what-heading" className="text-2xl font-bold text-gray-900 mb-3">
          What {measure.designation} does
        </h2>
        <div className="space-y-3 text-gray-700">
          {content.summary.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-gray-700">
          {content.whatItDoes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="glance-heading">
        <h2 id="glance-heading" className="sr-only">
          Estimates at a glance
        </h2>
        <AtAGlance measure={measure} />
      </section>

      <section aria-labelledby="compare-heading" className="space-y-6">
        <h3 id="compare-heading" className="text-lg font-semibold text-gray-900">
          {content.scenario ? 'Current law and the scenario' : 'Current law and if it passes'}
        </h3>
        {content.comparisons.map((c) => (
          <ComparisonTable key={c.caption} comparison={c} />
        ))}
      </section>

      <section aria-labelledby="who-heading">
        <h3 id="who-heading" className="text-lg font-semibold text-gray-900 mb-3">
          Who is affected
        </h3>
        <div className="space-y-3 text-gray-700">
          {content.whoIsAffected.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      <section aria-labelledby="facts-heading">
        <SectionHeading id="facts-heading">Key facts</SectionHeading>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 p-3">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {content.context.map((section) => (
        <section key={section.title}>
          <SectionHeading>{section.title}</SectionHeading>
          <div className="space-y-3 text-gray-700">
            {section.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="ballot-heading">
        <details className="rounded-lg border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-gray-900" id="ballot-heading">
            {content.ballotText.label} as it appears on the ballot
          </summary>
          <div className="mt-3 space-y-3 text-sm text-gray-700">
            {content.ballotText.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {content.ballotText.table && <SimpleDataTable table={content.ballotText.table} />}
            <p className="text-xs text-gray-500">
              Source:{' '}
              <ExternalLink href={content.ballotText.source.url}>
                {content.ballotText.source.label}
              </ExternalLink>
            </p>
          </div>
        </details>
      </section>

      <section aria-labelledby="sources-heading">
        <SectionHeading id="sources-heading">Sources</SectionHeading>
        <ul className="space-y-1 text-sm">
          {content.references.map((r) => (
            <li key={r.url}>
              <ExternalLink href={r.url}>{r.label}</ExternalLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
