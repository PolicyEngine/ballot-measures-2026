import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AggregateImpact, { PrecisionNote } from '../components/AggregateImpact';
import { PovertySection } from '../components/statewide/sections';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

describe('AggregateImpact', () => {
  it('shows income tax cards and switches sections', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('co-amendment-87')} year={2027} />);
    expect(await screen.findByText('Change in state income tax revenue')).toBeInTheDocument();
    // The card and the budget table both show the state revenue change.
    expect(screen.getAllByText('+$1.81B').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Households gaining / losing')).toBeInTheDocument();
    expect(screen.getByText('71.5% / 3.2%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'By income decile' }));
    expect(screen.getByText('Change in net income by income decile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Gains and losses' }));
    expect(screen.getByText('Gains and losses by income decile')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'By income band' }));
    expect(screen.getByRole('table', { name: /Impact by income band, 2027/ })).toHaveTextContent('$1M+');
    fireEvent.click(screen.getByRole('tab', { name: 'Poverty' }));
    expect(screen.getByText('Poverty rates')).toBeInTheDocument();
  });

  it('notes that the federal deduction uses withholding when federal revenue does not move', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('wa-i-645')} year={2029} />);
    expect(screen.getByText(/tax year 2029/)).toBeInTheDocument();
    expect(await screen.findByText(/uses state income tax withholding in the model/)).toBeInTheDocument();
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
    // The state card carries the methodology tab's federal-share sensitivity.
    expect(
      screen.getByText(/Each 10-point drop in the federal share would shift about \$33\.2M a year to the state/),
    ).toBeInTheDocument();
    expect(screen.getByText('Gaining a premium tax credit')).toBeInTheDocument();
    expect(screen.getByText('Change in state Medicaid spending')).toBeInTheDocument();
    expect(screen.getByText('Change in federal Medicaid spending')).toBeInTheDocument();
    expect(screen.getByText('Change in premium tax credits')).toBeInTheDocument();
    expect(screen.getByText(/shown in people and government spending rather than household net income/)).toBeInTheDocument();
    expect(screen.getByText(/Scaled to the Department of Social Services’ 29,055 expansion enrollees \(×0\.52\)/)).toBeInTheDocument();
    // No net-income sections.
    expect(screen.queryByRole('tablist', { name: 'Statewide sections' })).toBeNull();
    expect(screen.queryByText('Average change in household net income')).toBeNull();
    expect(screen.getByText(/The scenario in which expansion ends/)).toBeInTheDocument();
  });

  it('explains why California and Washington have no district breakdown', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    const note = await screen.findByTestId('no-districts-note');
    expect(note).toHaveTextContent('does not break Proposition 3 down by congressional district');
    expect(note).toHaveTextContent('district figures would be unreliable');
  });

  it('adds no district note for Colorado or at-large states', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('co-prop-nn')} year={2027} />);
    await screen.findByText('Sales tax refunds not paid');
    expect(screen.queryByTestId('no-districts-note')).toBeNull();
  });

  it('shows the school meal cost range', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<AggregateImpact measure={getMeasure('nd-measure-2')} year={2028} />);
    expect(await screen.findByText('State cost per year')).toBeInTheDocument();
    // The card and the budget details both show the participation-adjusted range.
    expect(screen.getAllByText('$59.5M to $67M').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$119M to $134M')).toBeInTheDocument();
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

  it('flags estimates that rest on a small effective sample', () => {
    renderWithQuery(
      <PrecisionNote metrics={{ affected_sample_households: 447, effective_affected_sample_households: 13.3 }} />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('447 sampled households');
    expect(screen.getByRole('note')).toHaveTextContent('about 13 independent households');
  });

  it('adds no note for a large effective sample', () => {
    const { container } = renderWithQuery(
      <PrecisionNote metrics={{ affected_sample_households: 9000, effective_affected_sample_households: 202 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('says results are not yet available when metrics.csv is missing', async () => {
    mockDataFiles({});
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    expect(await screen.findByText('Statewide results not yet available')).toBeInTheDocument();
  });

  it('ignores results in the old single-measure format', async () => {
    mockDataFiles({ 'metrics.csv': 'year,metric,value\n2031,households,1\n' });
    renderWithQuery(<AggregateImpact measure={getMeasure('ca-prop-3')} year={2031} />);
    expect(await screen.findByText('Statewide results not yet available')).toBeInTheDocument();
  });
});
