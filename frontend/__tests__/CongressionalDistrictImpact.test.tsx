import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CongressionalDistrictImpact from '../components/CongressionalDistrictImpact';
import {
  MIN_LABEL_AREA,
  buildGeometries,
  districtFill,
  isStateFeature,
  type GeoFeature,
} from '../components/USDistrictChoroplethMap';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];

const feature = (state: string, fips: string, district: number, ring: [number, number][]): GeoFeature => ({
  type: 'Feature',
  properties: { STATEFP: fips, CD119FP: String(district).padStart(2, '0'), DISTRICT_ID: `${state}-${String(district).padStart(2, '0')}` },
  geometry: { type: 'Polygon', coordinates: [ring] },
});

// Two large Colorado districts, one tiny one, and a Wyoming district to filter out.
const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    feature('CO', '08', 1, square(-105, 39, 0.01)),
    feature('CO', '08', 2, square(-109, 37, 2)),
    feature('CO', '08', 3, square(-107, 37, 2)),
    feature('WY', '56', 0, square(-110, 41, 3)),
  ],
};

describe('district geometry', () => {
  it('keeps only the state’s features and labels districts big enough to read', () => {
    const geometries = buildGeometries(GEOJSON.features as GeoFeature[], 8, 'CO');
    expect(geometries.map((g) => g.districtNumber)).toEqual(['1', '2', '3']);
    const labelled = geometries.filter((g) => g.labelArea >= MIN_LABEL_AREA).map((g) => g.districtNumber);
    expect(labelled).toEqual(['2', '3']);
  });

  it('matches features by FIPS, abbreviation or district id', () => {
    expect(isStateFeature({ STATEFP: '06' }, 6, 'CA')).toBe(true);
    expect(isStateFeature({ STATEAB: 'WA' }, 53, 'WA')).toBe(true);
    expect(isStateFeature({ DISTRICT_ID: 'CO-04' }, 8, 'CO')).toBe(true);
    expect(isStateFeature({ STATEFP: '08' }, 53, 'WA')).toBe(false);
  });

  it('colors gains teal and losses gray on the diverging scale', () => {
    expect(districtFill(100, 100)).toBe('var(--diverging-gray-teal-5)');
    expect(districtFill(-100, 100)).toBe('var(--diverging-gray-teal-1)');
    expect(districtFill(0, 100)).toBe('var(--diverging-gray-teal-3)');
    expect(districtFill(5, 0)).toBe('var(--diverging-gray-teal-3)');
  });
});

describe('CongressionalDistrictImpact', () => {
  it('maps and lists every district for the measure and year', async () => {
    mockDataFiles({ ...fixtureFiles(), 'congressional_districts.geojson': GEOJSON });
    const { container } = renderWithQuery(
      <CongressionalDistrictImpact measure={getMeasure('co-amendment-87')} year={2027} />,
    );
    const table = await screen.findByRole('table', { name: 'All Colorado districts' });
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    // No representatives column: Congress turns over in January.
    expect(table).not.toHaveTextContent(/Representative/);
    await screen.findByRole('img', { name: /Colorado's 3 congressional districts/ });
    expect(container.querySelectorAll('[data-district]')).toHaveLength(3);
    expect(Array.from(container.querySelectorAll('[data-label]')).map((n) => n.textContent)).toEqual([
      '2',
      '3',
    ]);

    fireEvent.click(within(table).getByRole('button', { name: 'CO-02' }));
    expect(screen.getByRole('heading', { name: 'Colorado district 2' })).toBeInTheDocument();
  });

  it('says results are not yet available without district rows', async () => {
    mockDataFiles({});
    renderWithQuery(<CongressionalDistrictImpact measure={getMeasure('wa-i-645')} year={2028} />);
    expect(await screen.findByText('District results not yet available')).toBeInTheDocument();
  });
});
