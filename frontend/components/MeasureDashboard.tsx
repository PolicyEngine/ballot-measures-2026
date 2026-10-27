'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getContent } from '@/content/measures';
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
import { rovingKeyDown } from './ui';

/** The NJ and FUTA dashboards' tab names. */
export const TAB_LABELS: Record<TabId, string> = {
  overview: 'Policy overview',
  household: 'Household impact',
  statewide: 'Statewide impact',
  districts: 'Congressional districts',
  validation: 'Validation and methods',
};

/**
 * The header band's one-sentence subtitle, in the NJ dashboard's voice:
 * "See how … would affect North Dakota households and the state budget if
 * it passes on November 3, 2026".
 */
export function headerSubtitle(measure: Measure, phrase: string): string {
  const start = `See how ${phrase} would affect ${measure.state_name} households and the state budget`;
  return measure.kind_params?.conditional === true
    ? `${start} under a scenario in which the federal share falls below 90% and expansion ends`
    : `${start} if it passes on ${formatLongDate(ELECTION_DATE)}`;
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
  const content = getContent(slug);
  const tabs = measureTabs(slug);
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

  // Each tab that depends on the tax year shows the year pills under its heading.
  const years = { year, onYearChange: selectYear };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">{measureName(measure)}</h1>
          <p className="text-lg opacity-90">{headerSubtitle(measure, content.headerPhrase)}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="mb-4">
          <Link href="/" className="text-sm text-primary-600 hover:underline">
            <span aria-hidden="true">← </span>All 2026 ballot measures
          </Link>
        </p>
        <div
          className="flex flex-wrap gap-1 mb-4"
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
          className="bg-white rounded-lg shadow-md p-6"
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
