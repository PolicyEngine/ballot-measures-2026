import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AggregateImpact from '../components/AggregateImpact';
import { PovertySection } from '../components/statewide/sections';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

describe('AggregateImpact', () => {
  it('shows income tax cards and switches sections', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('co-amendment-87')} year={2027} />);
    expect(await screen.findByText('Change in state income tax revenue')).toBeInTheDocument();
    expect(screen.getByText('+$1.81B')).toBeInTheDocument();
    expect(screen.getByText('Households gaining / losing')).toBeInTheDocument();
    expect(screen.getByText('71.5% / 3.2%')).toBeInTheDocument();

    // The NJ dashboard's header, sections and grouping.
    expect(screen.getByRole('heading', { name: 'Colorado impact analysis' })).toBeInTheDocument();
    expect(screen.getByText('Tax year 2027. If Amendment 87 passes, compared with current law.')).toBeInTheDocument();
    const sections = screen.getByRole('tablist', { name: 'Statewide sections' });
    expect(within(sections).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Budgetary impact',
      'Distributional impact',
      'Winners & losers',
      'Poverty impact',
    ]);
    // Budgetary impact holds one budget table, in words, and the income-band table.
    const budget = screen.getByRole('table', { name: 'Change if the measure passes, 2027' });
    expect(within(budget).getAllByRole('row').map((r) => r.textContent)).toEqual([
      'Per yearChange',
      'State budget$1.81B gain',
      'Household net income-$1.81B total; -$754 per household',
    ]);
    expect(screen.getByRole('heading', { name: 'Impact by income band' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Impact by income band, 2027/ })).toHaveTextContent('$1M+');

    fireEvent.click(screen.getByRole('tab', { name: 'Distributional impact' }));
    expect(screen.getByText('Change in net income by income decile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Winners & losers' }));
    expect(screen.getByText('Winners')).toBeInTheDocument();
    expect(screen.getByText('Losers')).toBeInTheDocument();
    expect(screen.getByText('Gains and losses by income decile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Poverty impact' }));
    expect(screen.getByText('Poverty rates')).toBeInTheDocument();
  });

  it('offers year pills for measures scored in several years', async () => {
    mockDataFiles(fixtureFiles());
    let chosen = 0;
    renderWithQuery(
      <AggregateImpact measure={getMeasure('wa-i-645')} year={2028} onYearChange={(y) => (chosen = y)} />,
    );
    await screen.findByText('Change in state income tax revenue');
    fireEvent.click(screen.getByRole('radio', { name: '2029' }));
    expect(chosen).toBe(2029);
    // The download is in the page's title block, not repeated here.
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });

  it('leaves out the federal budget line when it does not move', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('wa-i-645')} year={2029} />);
    expect(screen.getByText(/Tax year 2029\./)).toBeInTheDocument();
    const budget = await screen.findByRole('table', { name: 'Change if the measure passes, 2029' });
    expect(budget).toHaveTextContent('State budget$3.95B cost');
    expect(budget).not.toHaveTextContent('Federal budget');
    // The withholding note is on the Methods tab.
    expect(screen.queryByText(/uses state income tax withholding in the model/)).toBeNull();
  });

  it('shows people and spending, not net income, for the Medicaid scenario', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('sd-amendment-i')} year={2028} />);
    expect(await screen.findByText('People losing Medicaid')).toBeInTheDocument();
    // Calibrated (unsuffixed) counts, not the _model values.
    expect(screen.getByText('28,017')).toBeInTheDocument();
    expect(screen.queryByText('54,000')).toBeNull();
    expect(screen.getByText('In the coverage gap')).toBeInTheDocument();
    expect(
      screen.getByText('Income at or above the poverty line (may qualify for marketplace subsidies)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Gaining a premium tax credit')).toBeInTheDocument();
    expect(screen.getByText(/shown in people and government spending rather than household net income/)).toBeInTheDocument();
    // How the counts are calibrated is on the Methods tab.
    expect(screen.queryByText(/Scaled to the Department of Social Services/)).toBeNull();
    // Coverage and budgetary sections only: no net-income sections.
    const sections = screen.getByRole('tablist', { name: 'Statewide sections' });
    expect(within(sections).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Coverage impact',
      'Budgetary impact',
    ]);
    expect(screen.queryByText('Average change in household net income')).toBeNull();
    expect(screen.getByText(/The scenario in which expansion ends, compared with current law\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Budgetary impact' }));
    // Two cards, one per government, each amount stated once.
    expect(screen.getByText('State savings')).toBeInTheDocument();
    expect(screen.getByText('$33.2M a year')).toBeInTheDocument();
    expect(screen.getByText("Lower state Medicaid spending at today's 10% state share")).toBeInTheDocument();
    expect(screen.getByText('Federal Medicaid')).toBeInTheDocument();
    expect(screen.getByText('-$299M')).toBeInTheDocument();
    expect(screen.getByText('Premium tax credits +$15.6M; federal budget $86.1M gain')).toBeInTheDocument();
    // No net-income budget table.
    expect(screen.queryByRole('table', { name: /Change in the scenario, 2028/ })).toBeNull();
    expect(screen.queryByText('Household net income')).toBeNull();
  });

  it('explains why California and Washington have no district breakdown', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    const note = await screen.findByTestId('no-districts-note');
    expect(note).toHaveTextContent(
      'No district breakdown for Proposition 3: too few sample households carry the change.',
    );
  });

  it('adds no district note for Colorado or at-large states', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('co-prop-nn')} year={2027} />);
    await screen.findByText('Sales tax refunds not paid');
    expect(screen.queryByTestId('no-districts-note')).toBeNull();
  });

  it('shows one central school meal cost, with the range left to the Methods tab', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('nd-measure-2')} year={2028} />);
    expect(await screen.findByText('State cost per year')).toBeInTheDocument();
    // The fixtures have no state_cost_central, so the card falls back to the state budget line.
    expect(screen.getByText('$63M')).toBeInTheDocument();
    expect(screen.getByText('$126M per two-year budget')).toBeInTheDocument();
    expect(screen.getByText('Value of meals to families per year')).toBeInTheDocument();
    expect(screen.getByText('$59M')).toBeInTheDocument();
    expect(screen.queryByText(/\$59\.5M to \$67M/)).toBeNull();
    expect(screen.queryByRole('table', { name: 'Details' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Change if the measure passes, 2028' })).toHaveTextContent(
      'State budget$63M cost',
    );
  });

  it('shows poverty movement in both directions and notes tiny changes', () => {
    const metrics = {
      poverty_baseline_rate: 9.6,
      poverty_reform_rate: 9.6003,
      poverty_rate_change: 0.0003,
      poverty_percent_change: 0.003,
      people_lifted_out_of_poverty: 0,
      people_pushed_into_poverty: 1707,
      children_lifted_out_of_poverty: 0,
    };
    renderWithQuery(
      <PovertySection
        data={{ measure: 'ca-prop-3', year: 2031, metrics, deciles: null, winnersLosers: null, incomeBrackets: null }}
      />,
    );
    const table = screen.getByRole('table', { name: 'People moving across the poverty line' });
    expect(table).toHaveTextContent('Moved into poverty');
    expect(table).toHaveTextContent('1,707');
    // Without a children-moved-into-poverty count, children are not shown one way only.
    expect(table).not.toHaveTextContent('Children');
    expect(screen.getByText(/changes by less than 0\.1% of its current-law level/)).toBeInTheDocument();
  });

  it('shows children moving in both directions once both counts exist', () => {
    const metrics = {
      people_lifted_out_of_poverty: 414,
      people_pushed_into_poverty: 0,
      children_lifted_out_of_poverty: 95,
      children_pushed_into_poverty: 0,
    };
    renderWithQuery(
      <PovertySection
        data={{ measure: 'wa-i-645', year: 2028, metrics, deciles: null, winnersLosers: null, incomeBrackets: null }}
      />,
    );
    const table = screen.getByRole('table', { name: 'People moving across the poverty line' });
    expect(table).toHaveTextContent('Children moved out of poverty');
    expect(table).toHaveTextContent('Children moved into poverty');
    expect(table).toHaveTextContent('95');
  });

  it('says results are not yet available when metrics.csv is missing', async () => {
    mockDataFiles({});
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    expect(await screen.findByText('Statewide results not yet available')).toBeInTheDocument();
  });

  it('offers Retry when the results fail to load, and loads them on retry', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    // Two automatic retries first, then the error.
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Couldn't load results.");
    mockDataFiles(fixtureFiles());
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Change in state income tax revenue')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  }, 15_000);

  it('ignores results in the old single-measure format', async () => {
    mockDataFiles({ 'metrics.csv': 'year,metric,value\n2031,households,1\n' });
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    expect(await screen.findByText('Statewide results not yet available')).toBeInTheDocument();
  });
});
