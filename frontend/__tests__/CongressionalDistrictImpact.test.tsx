import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CongressionalDistrictImpact from '../components/CongressionalDistrictImpact';
import {
  MIN_LABEL_AREA,
  MIN_SHADE,
  buildGeometries,
  districtFill,
  isStateFeature,
  shadePosition,
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

  it('shades on a square-root scale with a visible floor for small changes', () => {
    expect(shadePosition(100, 100)).toBe(1);
    expect(shadePosition(25, 100)).toBe(0.5);
    expect(shadePosition(-25, 100)).toBe(0.5);
    // A change of 1% of the largest is still shaded, not left at the $0 color.
    expect(shadePosition(1, 100)).toBe(MIN_SHADE);
    expect(districtFill(1, 100)).not.toBe(districtFill(0, 100));
    expect(districtFill(-1, 100)).not.toBe(districtFill(0, 100));
    // A change that rounds to $0 is $0.
    expect(shadePosition(0.4, 100)).toBe(0);
  });
});

/** Serve the fixtures, with Colorado's boundary file answered by `boundaries`. */
function mockWithBoundaries(boundaries: (url: string) => Promise<Response>) {
  const serve = mockDataFiles(fixtureFiles());
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    return url.endsWith('/co_districts.json') ? boundaries(url) : serve(input);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const ok = (body: object) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) } as Response);

describe('CongressionalDistrictImpact', () => {
  it('maps and lists every district for the measure and year', async () => {
    const fetchMock = mockWithBoundaries(() => ok(GEOJSON));
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
    // Only Colorado's own boundary file is fetched, not a national one.
    const boundaryUrls = fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('geojson'));
    expect(boundaryUrls).toEqual([expect.stringMatching(/\/data\/geojson\/co_districts\.json$/)]);
    expect(screen.queryByTestId('district-map-skeleton')).toBeNull();
    // Named for its file, apart from the title block's metrics download.
    expect(screen.getByRole('button', { name: 'Download district CSV' })).toBeInTheDocument();

    fireEvent.click(within(table).getByRole('button', { name: 'CO-02' }));
    expect(screen.getByRole('heading', { name: 'Colorado district 2' })).toBeInTheDocument();
  });

  it('marks districts without a result and keys them in the legend', async () => {
    // A ninth boundary that has no row in congressional_districts.csv.
    const geojson = { ...GEOJSON, features: [...GEOJSON.features, feature('CO', '08', 9, square(-103, 37, 2))] };
    mockWithBoundaries(() => ok(geojson));
    const { container } = renderWithQuery(
      <CongressionalDistrictImpact measure={getMeasure('co-amendment-87')} year={2027} />,
    );
    await screen.findByRole('img', { name: /Colorado's 4 congressional districts/ });
    const noData = container.querySelectorAll('[data-no-data]');
    expect(noData).toHaveLength(1);
    expect(noData[0].closest('[data-district]')).toHaveAttribute('data-district', '9');
    expect(noData[0]).toHaveAttribute('stroke-dasharray', '4 3');
    expect(screen.getByTestId('no-data-key')).toHaveTextContent('No data');
  });

  it('shows a skeleton while the boundaries load', async () => {
    mockWithBoundaries(() => new Promise<Response>(() => {}));
    renderWithQuery(<CongressionalDistrictImpact measure={getMeasure('co-amendment-87')} year={2027} />);
    expect(await screen.findByTestId('district-map-skeleton')).toBeInTheDocument();
    // The table does not wait for the map.
    expect(screen.getByRole('table', { name: 'All Colorado districts' })).toBeInTheDocument();
  });

  it('offers Retry when the boundaries fail to load', async () => {
    let status = 500;
    mockWithBoundaries(() =>
      status === 200
        ? ok(GEOJSON)
        : Promise.resolve({ ok: false, status, json: () => Promise.reject(new Error('not json')) } as Response),
    );
    renderWithQuery(<CongressionalDistrictImpact measure={getMeasure('co-amendment-87')} year={2027} />);
    // Two automatic retries first, then the error.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Couldn't load the Colorado district boundaries (HTTP 500)");
    status = 200;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('img', { name: /Colorado's 3 congressional districts/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  }, 15_000);

  it('offers Retry when the district results fail to load', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    renderWithQuery(<CongressionalDistrictImpact measure={getMeasure('co-amendment-87')} year={2027} />);
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Couldn't load district results.");
    mockWithBoundaries(() => ok(GEOJSON));
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table', { name: 'All Colorado districts' })).toBeInTheDocument();
  }, 15_000);

  it('says results are not yet available without district rows', async () => {
    mockDataFiles({});
    renderWithQuery(<CongressionalDistrictImpact measure={getMeasure('co-prop-nn')} year={2028} />);
    expect(await screen.findByText('District results not yet available')).toBeInTheDocument();
  });
});
