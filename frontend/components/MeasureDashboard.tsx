'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getContent } from '@/content/measures';
import { getMeasure, isMeasureSlug, measureName, resolveYear } from '@/lib/registry';
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
import { Segmented } from './ui';

export const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  household: 'Household',
  statewide: 'Statewide',
  districts: 'Districts',
  methodology: 'Methodology & validation',
};

/** Tabs a measure shows: Districts only for states with more than one district. */
export function measureTabs(slug: string): TabId[] {
  const measure = getMeasure(slug);
  return TAB_IDS.filter((t) => t !== 'districts' || measure.has_districts);
}

/** Keeps the year selector in view below the site header while scrolling. */
function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-[58px] z-30 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-6 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-b border-gray-100 rounded-t-lg">
      {children}
    </div>
  );
}

interface Props {
  slug: string;
}

export default function MeasureDashboard({ slug }: Props) {
  const router = useRouter();
  const measure = getMeasure(slug);
  const content = getContent(slug);
  const tabs = measureTabs(slug);
  const conditional = measure.kind_params?.conditional === true;
  const [tab, setTab] = useState<TabId>('overview');
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
      if (params.tab) setTab(tabs.includes(params.tab) ? params.tab : 'overview');
      if (params.year !== undefined) setYear(resolveYear(measure, params.year));
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
    syncHash({ tab: next === 'overview' ? undefined : next });
  };

  const selectYear = (next: number) => {
    setYear(next);
    syncHash({ year: next === measure.headline_year ? undefined : next });
  };

  const showYearPicker = measure.years.length > 1 && tab !== 'overview';

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <nav aria-label="Breadcrumb" className="text-sm font-medium opacity-90 mb-2">
            <Link href="/" className="underline underline-offset-2 hover:opacity-100">
              2026 ballot measures
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{measure.state_name}</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-bold mb-1">{measureName(measure)}</h1>
          <p className="text-xl font-medium mb-2">{measure.short_title}</p>
          <p className="text-base opacity-90 max-w-3xl">{content.description}</p>
          {conditional && (
            <p className="mt-3 inline-block rounded-md bg-white/15 px-3 py-1 text-sm font-medium">
              Conditional scenario: no effect unless the federal share of expansion costs falls below 90%
            </p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap gap-1 mb-4" role="tablist" aria-label="Measure sections">
          {tabs.map((t) => (
            <button
              key={t}
              id={`tab-${t}`}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls={`tabpanel-${t}`}
              onClick={() => selectTab(t)}
              className={`px-4 sm:px-5 py-3 rounded-t-lg font-semibold transition-colors ${
                tab === t
                  ? 'bg-white text-primary-600 border-t-4 border-primary-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="bg-white rounded-lg shadow-md p-4 sm:p-6"
        >
          {showYearPicker && (
            <StickyBar>
              <Segmented
                id="year-picker-label"
                label="Tax year"
                value={year}
                onChange={selectYear}
                options={measure.years.map((y) => ({ value: y, label: String(y) }))}
              />
            </StickyBar>
          )}
          {tab === 'overview' ? (
            <PolicyOverview measure={measure} />
          ) : tab === 'household' ? (
            <HouseholdTab measure={measure} year={year} state={household} setState={setHousehold} />
          ) : tab === 'statewide' ? (
            <AggregateImpact measure={measure} year={year} />
          ) : tab === 'districts' ? (
            <CongressionalDistrictImpact measure={measure} year={year} />
          ) : (
            <ValidationMethodology measure={measure} year={year} />
          )}
        </div>
      </div>
    </main>
  );
}
