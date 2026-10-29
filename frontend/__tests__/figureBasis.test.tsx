import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import AggregateImpact from '../components/AggregateImpact';
import LandingPage from '../components/LandingPage';
import MeasureDashboard from '../components/MeasureDashboard';
import PolicyOverview from '../components/PolicyOverview';
import ValidationMethodology from '../components/ValidationMethodology';
import { figureBasisRows, measureBasis } from '../lib/figureBasis';
import { formatCount } from '../lib/format';
import parseCSV from '../lib/parseCSV';
import { getMeasure } from '../lib/registry';
import { metricsFor } from '../lib/results';
import { fixtureFiles, fixtureJson, fixtureText, mockDataFiles, renderWithQuery } from './testUtils';

const rows = parseCSV(fixtureText('metrics.csv'));
const metricsOf = (slug: string, year: number) => metricsFor(rows, slug, year)!;
const nd = metricsOf('nd-measure-2', 2028);
const sd = metricsOf('sd-amendment-i', 2028);

beforeEach(() => {
  mockDataFiles(fixtureFiles());
});

describe('figure bases', () => {
  it('classifies each kind of measure', () => {
    expect(measureBasis(getMeasure('nd-measure-2'))).toBe('calibrated');
    expect(measureBasis(getMeasure('sd-amendment-i'))).toBe('calibrated');
    expect(measureBasis(getMeasure('co-prop-nn'))).toBe('forecast');
    for (const slug of ['co-amendment-87', 'ca-prop-3', 'wa-i-645']) {
      expect(measureBasis(getMeasure(slug))).toBe('model');
    }
  });

  it('builds the methods table rows from the data', () => {
    const ndRows = figureBasisRows(getMeasure('nd-measure-2'), nd, true);
    expect(ndRows.find((r) => r.figure.startsWith('State cost'))?.source).toContain(
      `×${nd.enrollment_scale.toFixed(3)} to public school enrollment`,
    );
    expect(ndRows.find((r) => r.figure === 'Poverty')?.bases).toEqual(['calibrated', 'adjusted']);
    const sdRows = figureBasisRows(getMeasure('sd-amendment-i'), sd, true);
    expect(sdRows[0].source).toBe(
      `×${sd.enrollment_calibration_factor.toFixed(3)} to the Department of Social Services’ 29,055 expansion enrollees (model count ${formatCount(sd.baseline_expansion_enrollees)})`,
    );
    expect(sdRows.some((r) => r.figure === 'Poverty')).toBe(false);
    expect(figureBasisRows(getMeasure('co-prop-nn'), metricsOf('co-prop-nn', 2027), true)[0].bases).toEqual(['forecast']);
  });
});

describe('no basis labels outside the methods table', () => {
  it('shows no pills or calibration footnotes on the landing page', async () => {
    const { container } = renderWithQuery(<LandingPage />);
    await waitFor(() => expect(screen.getAllByText(/Official:/).length).toBeGreaterThan(0));
    expect(container.querySelector('[data-basis]')).toBeNull();
    expect(screen.queryByText(/Model before calibration/)).toBeNull();
    expect(screen.queryByText('Calibrated')).toBeNull();
  });

  it.each([
    ['nd-measure-2', 2028],
    ['sd-amendment-i', 2028],
    ['co-prop-nn', 2027],
  ] as const)('shows none on %s’s overview or statewide tab', async (slug, year) => {
    const overview = renderWithQuery(<PolicyOverview measure={getMeasure(slug)} />);
    await waitFor(() => expect(overview.container.querySelector('[data-testid="stat-card"]')).not.toBeNull());
    expect(overview.container.querySelector('[data-basis]')).toBeNull();
    overview.unmount();
    const statewide = renderWithQuery(<AggregateImpact measure={getMeasure(slug)} year={year} />);
    await screen.findAllByTestId('stat-card');
    expect(statewide.container.querySelector('[data-basis]')).toBeNull();
    expect(screen.queryByText(/Model before calibration/)).toBeNull();
    expect(screen.queryByTestId('card-footnote')).toBeNull();
  });
});

describe('how these figures are produced', () => {
  it('opens the methods tab with the table', async () => {
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    expect(screen.getByRole('heading', { name: 'How these figures are produced' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Basis of each figure, 2028' });
    const students = () => within(table).getByText('Students newly qualifying for free meals').closest('tr')!;
    await waitFor(() => expect(students()).toHaveTextContent(`model count ${formatCount(nd.children_newly_free_model)}`));
    expect(students()).toHaveTextContent('Calibrated');
    expect(within(table).getByText('Household calculator').closest('tr')).toHaveTextContent('Model estimate');
  });

  it('shows the model’s own poverty figures beside the published ones', async () => {
    const manifest = fixtureJson<{ diagnostics: Record<string, { poverty_model_spm_resources: Record<string, number> }> }>(
      'manifest.json',
    );
    const model = manifest.diagnostics['co-amendment-87:2027'].poverty_model_spm_resources;
    const published = metricsOf('co-amendment-87', 2027);
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />);
    const table = await screen.findByRole('table', { name: /Poverty on the model's SPM resources and as published, 2027/ });
    const rate = within(table).getByText('Poverty rate under current law').closest('tr')!;
    expect(rate).toHaveTextContent(`${model.poverty_baseline_rate.toFixed(2)}%`);
    expect(rate).toHaveTextContent(`${published.poverty_baseline_rate.toFixed(2)}%`);
  });

  it('is linked from the statewide tab', async () => {
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    fireEvent.click(await screen.findByRole('link', { name: /How these figures are produced/ }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Methodology' })).toHaveAttribute('aria-selected', 'true'),
    );
  });
});
