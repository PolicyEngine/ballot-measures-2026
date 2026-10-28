'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatLongDate } from '@/lib/format';
import { ELECTION_DATE } from '@/lib/measures';
import { getMeasure, isMeasureSlug, measureName, resolveYear, type Measure } from '@/lib/registry';
import {
  TAB_IDS,
  buildHashString,
  notifyReady,
  parseHashParams,
  updateHash,
  type HashParams,
  type TabId,
} from '@/lib/embedding';
import { defaultForm, formFromHash } from '@/lib/householdForm';
import AggregateImpact from './AggregateImpact';
import CongressionalDistrictImpact from './CongressionalDistrictImpact';
import HouseholdTab, { type HouseholdTabState } from './HouseholdTab';
import PolicyOverview from './PolicyOverview';
import ValidationMethodology from './ValidationMethodology';
import DownloadResults from './DownloadResults';
import { noDistrictsText } from './AggregateImpact';
import { rovingKeyDown } from './ui';

/** Short tab names (the state legislative tracker's style). */
export const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  household: 'Household',
  statewide: 'Statewide',
  districts: 'Districts',
  validation: 'Methods',
};

/** The title block's facts line: "Graduated income tax · November 3, 2026 · Tax year 2027". */
export function factsLine(measure: Measure, year: number): string {
  const parts = [measure.short_title, formatLongDate(ELECTION_DATE), `Tax year ${year}`];
  if (measure.kind_params?.conditional === true) parts.push('Scenario');
  return parts.join(' · ');
}

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const ArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l7 7m-7-7l7-7" />
  </svg>
);

/** "← 2026 ballot measures › Colorado", after the state legislative tracker's breadcrumb. */
function Breadcrumb({ stateName }: { stateName: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href="/"
            aria-label="Back to all 2026 ballot measures"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-primary-600 hover:border-primary-200 hover:bg-primary-50"
          >
            <ArrowLeft />
          </Link>
        </li>
        <li>
          <Link href="/" className="font-medium text-primary-600 hover:underline">
            2026 ballot measures
          </Link>
        </li>
        <li aria-hidden="true" className="text-gray-400">
          <ChevronRight />
        </li>
        <li aria-current="page" className="text-gray-600">
          {stateName}
        </li>
      </ol>
    </nav>
  );
}

/** Tabs a measure shows: Districts only where the registry shows districts (Colorado). */
export function measureTabs(slug: string): TabId[] {
  const measure = getMeasure(slug);
  return TAB_IDS.filter((t) => t !== 'districts' || measure.show_districts);
}

interface Props {
  slug: string;
}

export default function MeasureDashboard({ slug }: Props) {
  const router = useRouter();
  const measure = getMeasure(slug);
  const tabs = measureTabs(slug);
  const [tab, setTab] = useState<TabId>('overview');
  // A districts link on a measure without districts opens the overview with a note saying why.
  const [noDistricts, setNoDistricts] = useState(false);
  const [year, setYear] = useState<number>(measure.headline_year);
  // Lifted here so the household inputs and results survive tab switches.
  const [household, setHousehold] = useState<HouseholdTabState>(() => ({
    form: defaultForm(measure),
    submitted: null,
  }));

  // Read #tab=…&year=…&income=… after mount (the static HTML renders the defaults).
  useEffect(() => {
    const apply = () => {
      const params = parseHashParams(window.location.hash);
      // A hash naming another measure moves to its page.
      if (params.measure && params.measure !== slug && isMeasureSlug(params.measure)) {
        const rest = buildHashString({ ...params, measure: undefined });
        router.replace(`/${params.measure}${rest ? `#${rest}` : ''}`);
        return;
      }
      if (params.tab) {
        setTab(tabs.includes(params.tab) ? params.tab : 'overview');
        setNoDistricts(params.tab === 'districts' && !tabs.includes('districts'));
      }
      // A hash without a year returns to the headline year.
      setYear(params.year !== undefined ? resolveYear(measure, params.year) : measure.headline_year);
      if (
        params.income !== undefined ||
        params.age !== undefined ||
        params.married !== undefined ||
        params.dependents
      ) {
        setHousehold((s) => ({ ...s, form: formFromHash(params, s.form) }));
      }
    };
    apply();
    notifyReady();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
    // The measure, its tabs and the router are fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const syncHash = useCallback((next: Partial<HashParams>) => {
    const current = parseHashParams(window.location.hash);
    updateHash({ ...current, ...next, measure: undefined });
  }, []);

  const selectTab = (next: TabId) => {
    setTab(next);
    setNoDistricts(false);
    syncHash({ tab: next === 'overview' ? undefined : next });
  };

  const selectYear = (next: number) => {
    setYear(next);
    syncHash({ year: next === measure.headline_year ? undefined : next });
  };

  // Each tab that depends on the tax year shows the year pills under its heading.
  const years = { year, onYearChange: selectYear };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <Breadcrumb stateName={measure.state_name} />
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{measureName(measure)}</h1>
              <p className="mt-1 text-sm text-gray-600">{factsLine(measure, year)}</p>
            </div>
            <DownloadResults slug={measure.slug} file="metrics.csv" label="Download CSV" />
          </div>
        </div>
        <div className="border-t border-gray-200 bg-gray-50">
          <div
            className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Measure sections"
            onKeyDown={(e) => rovingKeyDown(e, tabs, tab, selectTab)}
          >
            {tabs.map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`tabpanel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => selectTab(t)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                  tab === t
                    ? 'border-primary-600 font-semibold text-primary-600'
                    : 'border-transparent font-medium text-gray-600 hover:text-gray-900'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {noDistricts && (
          <p className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700" role="status" data-testid="no-districts-note">
            {noDistrictsText(measure)}
          </p>
        )}
        <div
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          {tab === 'overview' ? (
            <PolicyOverview measure={measure} />
          ) : tab === 'household' ? (
            <HouseholdTab measure={measure} {...years} state={household} setState={setHousehold} />
          ) : tab === 'statewide' ? (
            <AggregateImpact measure={measure} {...years} />
          ) : tab === 'districts' ? (
            <CongressionalDistrictImpact measure={measure} {...years} />
          ) : (
            <ValidationMethodology measure={measure} {...years} />
          )}
        </div>
      </div>
    </main>
  );
}
