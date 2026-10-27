'use client';

/**
 * Policy overview tab, laid out like the NJ CTC dashboard's: what the
 * measure would do and a gray "what changes" callout, the FUTA dashboard's
 * three headline stats, the current-law comparison, who is affected, key
 * facts, and a three-column references grid.
 */

import { getContent, type Comparison, type Reference, type SimpleTable } from '@/content/measures';
import { headlineBasisNote, measureBasis } from '@/lib/figureBasis';
import { formatCompactCount, formatCount, formatLongDate, formatUSD } from '@/lib/format';
import { ELECTION_DATE, REGISTRY, useMetrics, type Measure } from '@/lib/measures';
import {
  INCOME_TAX_METRICS as IT,
  MEDICAID_METRICS as MC,
  TABOR_REFUND_METRICS as TR,
  headlineFor,
  type Metrics,
} from '@/lib/metrics';
import { metric } from '@/lib/results';
import { BasisBadge, MethodologyLink } from './FigureBasis';
import { yearsLabel } from './MeasureCard';
import { newlyFreeStudents } from './statewide/KindSummary';
import { ExternalLink, StatCard } from './ui';

/** "Sources: Blue Book, page 4; Blue Book, page 33" under a statement. */
export function SourceLinks({ sources, className = '' }: { sources?: Reference[]; className?: string }) {
  if (!sources?.length) return null;
  return (
    <p className={`text-xs text-gray-500 ${className}`}>
      {sources.length === 1 ? 'Source: ' : 'Sources: '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && '; '}
          <ExternalLink href={s.url}>{s.label}</ExternalLink>
        </span>
      ))}
    </p>
  );
}

function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-lg font-semibold text-gray-900 mb-3">
      {children}
    </h3>
  );
}

/** Current law beside the measure, NJ table style: changed values in bold teal. */
export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  const [current, passes] = comparison.columns ?? ['Current law', 'If it passes'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-sm font-semibold text-gray-800 mb-2">{comparison.caption}</caption>
        <thead>
          <tr className="border-b border-gray-200">
            <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-900">
              <span className="sr-only">Group</span>
            </th>
            <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-900">
              {current}
            </th>
            <th scope="col" className="text-left py-3 px-4 font-semibold text-gray-900">
              {passes}
            </th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.label} className="border-b border-gray-100">
              <th scope="row" className="text-left py-3 px-4 font-normal text-gray-700">
                {row.label}
              </th>
              <td className="py-3 px-4 text-gray-700">{row.currentLaw}</td>
              <td
                className={`py-3 px-4 ${
                  row.ifPasses !== row.currentLaw ? 'font-semibold text-primary-600' : 'text-gray-700'
                }`}
              >
                {row.ifPasses}
              </td>
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

interface ThirdStat {
  label: string;
  value: string | null;
  detail: string;
}

/** A third headline figure that fits the measure, from the headline year's metrics. */
export function thirdStat(measure: Measure, metrics: Metrics): ThirdStat {
  switch (measure.kind) {
    case 'income_tax': {
      const more = metric(metrics, IT.taxUnitsPayingMore);
      const less = metric(metrics, IT.taxUnitsPayingLess);
      return {
        label: 'Tax units paying more / less',
        value: more === null || less === null ? null : `${formatCompactCount(more)} / ${formatCompactCount(less)}`,
        detail: 'Filers and their dependents whose state income tax rises or falls',
      };
    }
    case 'tabor_refund': {
      const recipients = metric(metrics, TR.refundRecipientsBaseline);
      const average = metric(metrics, TR.avgRefundBaseline);
      return {
        label: 'Refund recipients under current law',
        value: recipients === null ? null : formatCompactCount(recipients),
        detail: average === null ? 'People receiving the six-tier refund' : `${formatUSD(average)} on average`,
      };
    }
    case 'school_meals': {
      const students = newlyFreeStudents(metrics).scaled;
      return {
        label: 'Students newly qualifying for free meals',
        value: students === null ? null : formatCount(students),
        detail: 'Students who would pay full or reduced price under current law',
      };
    }
    case 'medicaid': {
      const gap = metric(metrics, MC.losingBelow100fpl);
      return {
        label: 'In the coverage gap',
        value: gap === null ? null : formatCount(gap),
        detail: 'People losing Medicaid with income below the poverty line, with no subsidized marketplace option',
      };
    }
  }
}

/** FUTA's three headline stats: the PolicyEngine estimate, the official one, and one more. */
function HeadlineStats({ measure }: { measure: Measure }) {
  const { data: metrics, isLoading } = useMetrics(measure.slug, measure.headline_year);
  const headline = headlineFor(measure, metrics);
  const basis = measureBasis(measure);
  const basisNote = headline.model ? headlineBasisNote(measure, metrics) : null;
  const third = thirdStat(measure, metrics);
  const pending = (
    <span className="text-base font-medium text-gray-500">{isLoading ? 'Loading…' : 'Results not yet available'}</span>
  );
  return (
    <section aria-labelledby="glance-heading">
      <h3 id="glance-heading" className="sr-only">
        Estimates at a glance
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          highlight
          size="lg"
          label={headline.label}
          badge={<BasisBadge basis={basis} />}
          value={headline.model ?? pending}
          detail="PolicyEngine estimate"
          footnote={
            basisNote ? (
              <>
                {basisNote} <MethodologyLink />
              </>
            ) : undefined
          }
        />
        <StatCard
          size="lg"
          label={headline.officialLabel}
          value={headline.official ?? <span className="text-base font-medium text-gray-500">None published</span>}
          detail={headline.officialSource ?? undefined}
        />
        <StatCard
          size="lg"
          label={third.label}
          badge={basis === 'model' ? undefined : <BasisBadge basis={basis} />}
          value={third.value ?? pending}
          detail={third.detail}
        />
      </div>
    </section>
  );
}

/** NJ's three gray reference boxes: the measure's sources, official estimates, calculations. */
function References({ measure }: { measure: Measure }) {
  const content = getContent(measure.slug);
  const isPolicyEngine = (r: Reference) => r.url.includes('github.com/PolicyEngine');
  // One link per official source (several estimates can share a document).
  const estimates = Array.from(
    new Map(measure.official_estimates.map((e) => [e.source, { label: e.source, url: e.url }])).values(),
  );
  const estimateUrls = new Set(estimates.map((e) => e.url.split('#')[0]));
  const sources = Array.from(
    new Map(
      [content.ballotText.source, ...content.references]
        .filter((r) => !isPolicyEngine(r) && !estimateUrls.has(r.url.split('#')[0]))
        .map((r) => [r.url, r]),
    ).values(),
  );
  const engineLinks = content.references.filter(isPolicyEngine);
  const linkList = (items: Reference[]) => (
    <ul className="text-sm text-gray-700 space-y-1">
      {items.map((r) => (
        <li key={r.url}>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
            {r.label}
          </a>
        </li>
      ))}
    </ul>
  );
  const box = 'bg-gray-50 border border-gray-200 rounded-lg p-4';
  return (
    <section aria-labelledby="references-heading">
      <h3 id="references-heading" className="text-lg font-semibold text-gray-900 mb-3">
        References
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={box}>
          <h4 className="font-semibold text-gray-800 mb-2">Ballot measure text and voter guides</h4>
          {linkList(sources)}
        </div>
        <div className={box}>
          <h4 className="font-semibold text-gray-800 mb-2">Official estimates</h4>
          {estimates.length ? linkList(estimates) : <p className="text-sm text-gray-700">None published.</p>}
        </div>
        <div className={box}>
          <h4 className="font-semibold text-gray-800 mb-2">Calculations</h4>
          <p className="text-sm text-gray-700">
            Powered by{' '}
            <a
              href="https://github.com/PolicyEngine/policyengine-us"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              policyengine-us
            </a>{' '}
            (<span className="font-mono text-xs">{REGISTRY.pin}</span>), the same model for the household,
            statewide and district results.
          </p>
          {engineLinks.length > 0 && <div className="mt-2">{linkList(engineLinks)}</div>}
          <p className="text-sm text-gray-700 mt-2">
            <MethodologyLink>Validation and methods</MethodologyLink>
          </p>
        </div>
      </div>
    </section>
  );
}

interface Props {
  measure: Measure;
}

/** Overview tab: what the measure would do, headline estimates, current law vs. the measure, who is affected. */
export default function PolicyOverview({ measure }: Props) {
  const content = getContent(measure.slug);
  const conditional = measure.kind_params?.conditional === true;
  const facts: { label: string; value: string; sources?: Reference[] }[] = [
    { label: 'Election', value: formatLongDate(ELECTION_DATE) },
    { label: 'How it reached the ballot', value: content.measureType },
    {
      label: 'Vote needed to pass',
      value: content.voteRequirement.text,
      sources: content.voteRequirement.sources,
    },
    { label: 'When it would take effect', value: content.effectiveDate },
    { label: 'Years modeled', value: yearsLabel(measure.years) },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">What {measure.designation} would do</h2>
        <div className="space-y-4 text-gray-700">
          <p>{content.description}</p>
          {content.summary.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {content.scenario && (
          <section
            aria-labelledby="scenario-heading"
            className="mt-4 rounded-lg border border-gray-200 border-l-4 border-l-primary-500 bg-gray-50 p-4"
          >
            <h3 id="scenario-heading" className="font-semibold text-gray-800 mb-2">
              {content.scenario.title}
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              {content.scenario.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>
        )}
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2">
            {conditional ? 'What changes under the scenario' : 'What changes if it passes'}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
            {content.whatItDoes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <HeadlineStats measure={measure} />

      <section aria-labelledby="compare-heading" className="space-y-6">
        <SectionHeading id="compare-heading">
          {conditional ? 'Current law and the scenario' : 'Current law and if it passes'}
        </SectionHeading>
        {content.comparisons.map((c) => (
          <ComparisonTable key={c.caption} comparison={c} />
        ))}
      </section>

      <section aria-labelledby="who-heading">
        <SectionHeading id="who-heading">Who is affected</SectionHeading>
        <div className="space-y-3 text-gray-700">
          {content.whoIsAffected.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <SourceLinks sources={content.whoIsAffectedSources} className="mt-2" />
      </section>

      <section aria-labelledby="facts-heading">
        <SectionHeading id="facts-heading">Key facts</SectionHeading>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Key facts</caption>
            <tbody>
              {facts.map(({ label, value, sources }) => (
                <tr key={label} className="border-b border-gray-100 align-top">
                  <th scope="row" className="w-1/3 text-left py-3 px-4 font-semibold text-gray-900">
                    {label}
                  </th>
                  <td className="py-3 px-4 text-gray-700">
                    {value}
                    <SourceLinks sources={sources} className="mt-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {content.context.map((section) => (
        <section key={section.title}>
          <SectionHeading>{section.title}</SectionHeading>
          <div className="space-y-3 text-gray-700">
            {section.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <SourceLinks sources={section.sources} className="mt-2" />
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
              <ExternalLink href={content.ballotText.source.url}>{content.ballotText.source.label}</ExternalLink>
            </p>
          </div>
        </details>
      </section>

      <References measure={measure} />
    </div>
  );
}
