'use client';

import { useState } from 'react';
import USDistrictChoroplethMap from './USDistrictChoroplethMap';
import ChartWatermark from './ChartWatermark';
import DownloadResults from './DownloadResults';
import { Loading, ResultsUnavailable, toneOf, toneText } from './ui';
import { useDistrictResults, type Measure } from '@/lib/measures';
import { formatCompactUSD, formatCount, formatShare, formatUSDWithSign } from '@/lib/format';
import type { DistrictRow } from '@/lib/results';

interface Props {
  measure: Measure;
  year: number;
}

export default function CongressionalDistrictImpact({ measure, year }: Props) {
  const { data, isLoading } = useDistrictResults(measure.slug, year);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const conditional = measure.kind_params?.conditional === true;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-primary-700">
          {measure.state_name} congressional districts
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Average change in household net income{' '}
          {conditional ? 'in the scenario' : `if ${measure.designation} passes`}, compared with
          current law, tax year {year}.
        </p>
      </div>
      <DownloadResults
        slug={measure.slug}
        file="congressional_districts.csv"
        label="Download district results (CSV)"
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <Loading label="Loading district results…" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <ResultsUnavailable
          title="District results not yet available"
          detail={`congressional_districts.csv has no ${measure.state} rows for ${measure.slug} in ${year}.`}
        />
      </div>
    );
  }

  const selected = selectedDistrict
    ? (data.find((d) => d.district_number === selectedDistrict) ?? null)
    : null;
  const toggle = (n: string) => setSelectedDistrict((prev) => (prev === n ? null : n));

  return (
    <div className="space-y-6">
      {header}

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <USDistrictChoroplethMap
          stateFips={measure.state_fips}
          stateCode={measure.state}
          stateName={measure.state_name}
          data={data}
          selectedDistrict={selectedDistrict}
          onSelect={toggle}
        />
        <ChartWatermark />
      </div>

      {selected ? (
        <DistrictDetailCard
          district={selected}
          stateName={measure.state_name}
          onClose={() => setSelectedDistrict(null)}
        />
      ) : (
        <p className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-500">
          Select a district on the map or in the table for details.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-left text-lg font-semibold text-gray-900 mb-3">
            All {measure.state_name} districts
          </caption>
          <thead>
            <tr className="border-b border-gray-200">
              <th scope="col" className="text-left py-2 px-3 font-medium text-gray-600">District</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Households</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Average change</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Relative change</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Gaining</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">Losing</th>
              <th scope="col" className="text-right py-2 px-3 font-medium text-gray-600">State budget</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((d) => (
              <tr
                key={d.district_number}
                className={`cursor-pointer hover:bg-gray-50 ${
                  selectedDistrict === d.district_number ? 'bg-primary-50' : ''
                }`}
                onClick={() => toggle(d.district_number)}
                aria-selected={selectedDistrict === d.district_number}
              >
                <td className="py-2 px-3 font-medium text-gray-800">
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(d.district_number);
                    }}
                  >
                    {d.district}
                  </button>
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{formatCount(d.households)}</td>
                <td
                  className={`py-2 px-3 text-right tabular-nums font-semibold ${toneText(
                    toneOf(d.average_household_income_change),
                  )}`}
                >
                  {formatUSDWithSign(d.average_household_income_change)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {formatShare(d.relative_household_income_change, 2, { sign: true })}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{formatShare(d.winners_share)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatShare(d.losers_share)}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {formatCompactUSD(d.state_budget_impact, { sig3: true, sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Districts follow 119th Congress boundaries. Households are assigned to districts through
        their Public Use Microdata Area, so boundaries are approximate. District and statewide
        figures come from the same data, so district totals sum to the statewide total. District
        samples are small, so the dashboard does not report poverty by district.
      </p>
    </div>
  );
}

function DistrictDetailCard({
  district,
  stateName,
  onClose,
}: {
  district: DistrictRow;
  stateName: string;
  onClose: () => void;
}) {
  const avg = district.average_household_income_change;
  const noChange = Math.max(0, 1 - district.winners_share - district.losers_share);
  const stats = [
    {
      label: 'Average change',
      value: formatUSDWithSign(avg),
      detail: `${formatShare(district.relative_household_income_change, 2, { sign: true })} of net income`,
    },
    { label: 'Gaining', value: formatShare(district.winners_share), detail: 'of households' },
    { label: 'Losing', value: formatShare(district.losers_share), detail: 'of households' },
    { label: 'No change', value: formatShare(noChange), detail: 'of households' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-white font-bold text-lg"
            style={{
              backgroundColor:
                avg > 0 ? 'var(--chart-1)' : avg < 0 ? 'var(--chart-negative)' : 'var(--gray-300)',
            }}
          >
            {district.district_number}
          </span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {stateName} district {district.district_number}
            </h3>
            <p className="text-sm text-gray-600">{formatCount(district.households)} households</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1"
          aria-label="Close district details"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-lg font-bold text-gray-800 tabular-nums">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
