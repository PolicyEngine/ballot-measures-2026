import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import AggregateImpact from '../components/AggregateImpact';
import HouseholdTab, { type HouseholdTabState } from '../components/HouseholdTab';
import LandingPage from '../components/LandingPage';
import MeasureDashboard from '../components/MeasureDashboard';
import ValidationMethodology from '../components/ValidationMethodology';
import {
  FORECAST_INPUT_NOTE,
  enrollmentScalingNote,
  figureBasisRows,
  headlineBasisNote,
  householdBasisNote,
  mealsModelNote,
  measureBasis,
  studentsModelNote,
} from '../lib/figureBasis';
import { formatCompactUSD, formatCount } from '../lib/format';
import { defaultForm } from '../lib/householdForm';
import parseCSV from '../lib/parseCSV';
import { getMeasure } from '../lib/registry';
import { metricsFor } from '../lib/results';
import { fixtureFiles, fixtureJson, fixtureText, mockDataFiles, renderWithQuery } from './testUtils';
import { useState } from 'react';

const rows = parseCSV(fixtureText('metrics.csv'));
const metricsOf = (slug: string, year: number) => metricsFor(rows, slug, year)!;
const nd = metricsOf('nd-measure-2', 2028);
const sd = metricsOf('sd-amendment-i', 2028);

beforeEach(() => {
  mockDataFiles(fixtureFiles());
});

describe('figure bases', () => {
  it('labels each kind of measure', () => {
    expect(measureBasis(getMeasure('nd-measure-2'))).toBe('calibrated');
    expect(measureBasis(getMeasure('sd-amendment-i'))).toBe('calibrated');
    expect(measureBasis(getMeasure('co-prop-nn'))).toBe('forecast');
    for (const slug of ['co-amendment-87', 'ca-prop-3', 'wa-i-645']) {
      expect(measureBasis(getMeasure(slug))).toBe('model');
    }
  });

  it('reads every footnote number from the data', () => {
    // North Dakota: the unadjusted meal value, the model's student count and the scale.
    expect(mealsModelNote(nd)).toBe(
      `Model before calibration: ${formatCompactUSD(nd.meal_value_change_model, { sig3: true })} a year (assumes every K-12 child eats both meals daily). Adjusted to public enrollment and actual meal participation.`,
    );
    expect(mealsModelNote(nd)).toContain('$112M a year');
    expect(studentsModelNote(nd)).toBe(
      `Model before calibration: ${formatCount(nd.children_newly_free_model)} students. Scaled to public school enrollment (×${nd.enrollment_scale.toFixed(2)}).`,
    );
    // South Dakota: the _model twin, the administrative count and the factor.
    expect(headlineBasisNote(getMeasure('sd-amendment-i'), sd)).toBe(
      `Model before calibration: ${formatCount(sd.people_losing_medicaid_model)} people. ${enrollmentScalingNote(sd)}`,
    );
    expect(enrollmentScalingNote(sd)).toBe(
      'Scaled to the Department of Social Services’ 29,055 expansion enrollees (×0.52).',
    );
    // Changing the data changes the note.
    expect(mealsModelNote({ ...nd, meal_value_change_model: 2.5e8 })).toContain('$250M a year');
    expect(enrollmentScalingNote({ ...sd, admin_expansion_enrollees: 30_000, enrollment_calibration_factor: 0.6 })).toContain(
      '30,000 expansion enrollees (×0.60)',
    );
    // Missing data gives no note rather than a made-up number.
    expect(mealsModelNote({})).toBeNull();
    expect(headlineBasisNote(getMeasure('sd-amendment-i'), {})).toBeNull();
    expect(headlineBasisNote(getMeasure('co-prop-nn'), {})).toBe(FORECAST_INPUT_NOTE);
    expect(headlineBasisNote(getMeasure('co-amendment-87'), metricsOf('co-amendment-87', 2027))).toBeNull();
  });

  it('builds the methodology rows from the data', () => {
    const ndRows = figureBasisRows(getMeasure('nd-measure-2'), nd, true);
    expect(ndRows.find((r) => r.figure.startsWith('State cost'))?.source).toContain(
      `×${nd.enrollment_scale.toFixed(3)} to public school enrollment`,
    );
    expect(ndRows.find((r) => r.figure === 'Poverty')?.bases).toEqual(['calibrated', 'adjusted']);
    const sdRows = figureBasisRows(getMeasure('sd-amendment-i'), sd, true);
    expect(sdRows[0].bases).toEqual(['calibrated']);
    expect(sdRows[0].source).toBe(
      `×${sd.enrollment_calibration_factor.toFixed(3)} to the Department of Social Services’ 29,055 expansion enrollees (model count ${formatCount(sd.baseline_expansion_enrollees)})`,
    );
    expect(sdRows.some((r) => r.figure === 'Poverty')).toBe(false);
    expect(figureBasisRows(getMeasure('co-prop-nn'), metricsOf('co-prop-nn', 2027), true)[0].bases).toEqual([
      'forecast',
    ]);
    expect(figureBasisRows(getMeasure('wa-i-645'), metricsOf('wa-i-645', 2028), false).map((r) => r.figure)).not.toContain(
      'Poverty',
    );
  });
});

describe('landing cards', () => {
  const badgeOf = (card: HTMLElement) => card.querySelector('[data-basis]')?.textContent;

  it('label calibrated, forecast-input and model headlines', async () => {
    renderWithQuery(<LandingPage />);
    const card = (name: RegExp) => screen.getByRole('link', { name });
    const ndCard = card(/North Dakota Constitutional Measure No\. 2/);
    const sdCard = card(/South Dakota Constitutional Amendment I/);
    const nnCard = card(/Colorado Proposition NN/);
    expect(badgeOf(ndCard)).toBe('Calibrated');
    expect(badgeOf(sdCard)).toBe('Calibrated');
    expect(badgeOf(nnCard)).toBe('Forecast input');
    for (const name of [/Colorado Amendment 87/, /California Proposition 3/, /Washington Initiative 645/]) {
      expect(badgeOf(card(name))).toBe('Model estimate');
    }
    // Footnotes give the model's value before calibration, from the data.
    await waitFor(() => expect(within(ndCard).getByTestId('headline-basis-note')).toHaveTextContent(mealsModelNote(nd)!));
    expect(within(sdCard).getByTestId('headline-basis-note')).toHaveTextContent(
      `Model before calibration: ${formatCount(sd.people_losing_medicaid_model)} people.`,
    );
    expect(within(nnCard).getByTestId('headline-basis-note')).toHaveTextContent(FORECAST_INPUT_NOTE);
    expect(within(card(/Washington Initiative 645/)).queryByTestId('headline-basis-note')).toBeNull();
  });
});

describe('statewide labels', () => {
  it('badges North Dakota’s cards and notes the participation-adjusted charts', async () => {
    renderWithQuery(<AggregateImpact measure={getMeasure('nd-measure-2')} year={2028} />);
    const cost = (await screen.findByText('State cost per year')).closest('div')!;
    expect(within(cost).getByText('Calibrated')).toBeInTheDocument();
    expect(within(cost).getByTestId('card-footnote')).toHaveTextContent(mealsModelNote(nd)!);
    const students = screen.getByText('Students newly qualifying for free meals').closest('div')!;
    expect(within(students).getByTestId('card-footnote')).toHaveTextContent(studentsModelNote(nd)!);
    expect(screen.getByText(/use the participation-adjusted midpoint of the low and high cases/)).toBeInTheDocument();
  });

  it('badges South Dakota’s coverage and cost cards with their model values', async () => {
    renderWithQuery(<AggregateImpact measure={getMeasure('sd-amendment-i')} year={2028} />);
    const losing = (await screen.findByText('People losing Medicaid')).closest('div')!;
    expect(within(losing).getByText('Calibrated')).toBeInTheDocument();
    expect(within(losing).getByTestId('card-footnote')).toHaveTextContent(
      `Model before calibration: ${formatCount(sd.people_losing_medicaid_model)} people.`,
    );
    const state = screen.getByText('Change in state Medicaid spending').closest('div')!;
    expect(within(state).getByTestId('card-footnote')).toHaveTextContent(
      `Model before calibration: ${formatCompactUSD(sd.medicaid_state_cost_change_model, { sig3: true, sign: true })}.`,
    );
    expect(screen.getAllByText('Calibrated')).toHaveLength(8);
  });

  it('marks Proposition NN’s refund figures as using a forecast input', async () => {
    renderWithQuery(<AggregateImpact measure={getMeasure('co-prop-nn')} year={2027} />);
    const refunds = (await screen.findByText('Sales tax refunds not paid')).closest('div')!;
    expect(within(refunds).getByText('Forecast input')).toBeInTheDocument();
    expect(screen.getByText(FORECAST_INPUT_NOTE)).toBeInTheDocument();
  });

  it('marks poverty figures as adjusted on every net-income measure', async () => {
    for (const [slug, year] of [
      ['co-amendment-87', 2027],
      ['nd-measure-2', 2028],
    ] as const) {
      const { unmount } = renderWithQuery(<AggregateImpact measure={getMeasure(slug)} year={year} />);
      fireEvent.click(await screen.findByRole('tab', { name: 'Poverty' }));
      const note = await screen.findByText(/add partnership and S corporation income/);
      expect(note.closest('p')).toHaveTextContent('Adjusted');
      expect(within(note.closest('p')!).getByRole('link', { name: /See methodology/ })).toHaveAttribute(
        'href',
        '#tab=methodology',
      );
      unmount();
    }
  });
});

describe('methodology tables', () => {
  it('opens with each figure’s basis', async () => {
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    expect(screen.getByRole('heading', { name: 'Which figures are calibrated' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Basis of each figure, 2028' });
    const studentsRow = () => within(table).getByText('Students newly qualifying for free meals').closest('tr')!;
    // The factor and model count arrive with metrics.csv.
    await waitFor(() =>
      expect(studentsRow()).toHaveTextContent(`model count ${formatCount(nd.children_newly_free_model)}`),
    );
    expect(studentsRow()).toHaveTextContent('Calibrated');
    expect(studentsRow()).toHaveTextContent(`×${nd.enrollment_scale.toFixed(3)} to public school enrollment`);
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

  it('has no poverty comparison for the Medicaid scenario', async () => {
    renderWithQuery(<ValidationMethodology measure={getMeasure('sd-amendment-i')} year={2028} />);
    await screen.findByRole('table', { name: 'Basis of each figure, 2028' });
    expect(screen.queryByRole('table', { name: /Poverty on the model's SPM resources/ })).toBeNull();
  });
});

describe('household tab and links', () => {
  function Harness({ slug }: { slug: string }) {
    const measure = getMeasure(slug);
    const [state, setState] = useState<HouseholdTabState>({ form: defaultForm(measure), submitted: null });
    return <HouseholdTab measure={measure} year={measure.headline_year} state={state} setState={setState} />;
  }

  it('says household results are the model’s own calculation', () => {
    renderWithQuery(<Harness slug="nd-measure-2" />);
    expect(screen.getByText(householdBasisNote(getMeasure('nd-measure-2')))).toBeInTheDocument();
    expect(householdBasisNote(getMeasure('nd-measure-2'))).toMatch(
      /^Household results are the model’s own per-household calculation, with no calibration\. The calculator assumes each child eats school breakfast and lunch every school day\.$/,
    );
    expect(householdBasisNote(getMeasure('sd-amendment-i'))).toMatch(/model’s Medicaid eligibility and marketplace coverage rules/);
  });

  it('opens the methodology tab from a note', async () => {
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    const link = within(await screen.findByText(FORECAST_INPUT_NOTE)).queryByRole('link') ??
      within(screen.getByText(FORECAST_INPUT_NOTE).closest('p')!).getByRole('link', { name: /See methodology/ });
    fireEvent.click(link);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Methodology & validation' })).toHaveAttribute('aria-selected', 'true'),
    );
  });
});
