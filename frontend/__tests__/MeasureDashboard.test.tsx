import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import MeasureDashboard from '../components/MeasureDashboard';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';
import { routerMock } from './routerMock';

const tabNames = () => screen.getAllByRole('tab', { hidden: false }).map((t) => t.textContent);

beforeEach(() => {
  mockDataFiles(fixtureFiles());
  routerMock.replace.mockClear();
});

describe('MeasureDashboard tabs', () => {
  it.each(['ca-prop-3', 'wa-i-645', 'nd-measure-2', 'sd-amendment-i'])('%s has no Districts tab', (slug) => {
    renderWithQuery(<MeasureDashboard slug={slug} />);
    const tablist = screen.getByRole('tablist', { name: 'Measure sections' });
    expect(within(tablist).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Statewide',
      'Household',
      'Methodology',
    ]);
  });

  it.each(['co-amendment-87', 'co-prop-nn'])('%s has a Districts tab', (slug) => {
    renderWithQuery(<MeasureDashboard slug={slug} />);
    expect(tabNames()).toEqual(['Overview', 'Statewide', 'Districts', 'Household', 'Methodology']);
  });

  it('shows the title block: breadcrumb, title, facts line and the overview first', async () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Back to all 2026 ballot measures' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByRole('link', { name: '2026 ballot measures' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByText('Washington')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Washington Initiative 645');
    // One facts line from the registry: short title, election date and tax year.
    expect(
      screen.getByText(
        'Repeal the tax on income over $1 million and bar income taxes by statute · November 3, 2026 · Tax year 2028',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    // Washington has districts, but few sample households carry the change.
    expect(tabNames()).not.toContain('Districts');
  });

  it('marks South Dakota as a scenario in the facts line', () => {
    renderWithQuery(<MeasureDashboard slug="sd-amendment-i" />);
    expect(screen.getByText(/· Tax year 2028 · Scenario$/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A conditional scenario, not a forecast' })).toBeInTheDocument();
  });

  it('moves between tabs with the arrow, Home and End keys', () => {
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    const tablist = screen.getByRole('tablist', { name: 'Measure sections' });
    const tab = (name: string) => screen.getByRole('tab', { name });
    // Only the selected tab is in the tab order.
    expect(tab('Overview')).toHaveAttribute('tabindex', '0');
    expect(tab('Statewide')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab('Statewide')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Statewide')).toHaveFocus();
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tab('Methodology')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tab('Methodology')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Overview')).toHaveFocus();
  });
});

describe('year selector and hash', () => {
  it('appears only for measures scored in several years, off the overview', () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    expect(screen.queryByRole('radiogroup', { name: 'Tax year' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    const years = screen.getByRole('radiogroup', { name: 'Tax year' });
    expect(within(years).getAllByRole('radio').map((r) => r.textContent)).toEqual(['2028', '2029']);
    expect(within(years).getByRole('radio', { name: '2028' })).toHaveAttribute('aria-checked', 'true');
  });

  it('changes the year with the arrow keys', () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    const years = screen.getByRole('radiogroup', { name: 'Tax year' });
    const radio = (name: string) => within(years).getByRole('radio', { name });
    expect(radio('2028')).toHaveAttribute('tabindex', '0');
    expect(radio('2029')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(years, { key: 'ArrowRight' });
    expect(radio('2029')).toHaveAttribute('aria-checked', 'true');
    expect(radio('2029')).toHaveFocus();
    fireEvent.keyDown(years, { key: 'ArrowUp' });
    expect(radio('2028')).toHaveAttribute('aria-checked', 'true');
  });

  it('is absent for single-year measures', () => {
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    expect(screen.queryByRole('radiogroup', { name: 'Tax year' })).toBeNull();
  });

  it('writes the tab and year to the hash', () => {
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    fireEvent.click(screen.getByRole('radio', { name: '2028' }));
    expect(window.location.hash).toBe('#year=2028&tab=statewide');
  });

  it('reads the tab and year from the hash', async () => {
    window.location.hash = '#tab=statewide&year=2029';
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Statewide' })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByRole('radio', { name: '2029' })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText(/Tax year 2029\./)).toBeInTheDocument();
    // The facts line follows the year.
    expect(screen.getByText(/· Tax year 2029$/)).toBeInTheDocument();
  });

  it('shows the year pills on every tab that depends on the year', () => {
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    for (const name of ['Statewide', 'Districts', 'Household', 'Methodology']) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(screen.getByRole('radiogroup', { name: 'Tax year' })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(screen.queryByRole('radiogroup', { name: 'Tax year' })).toBeNull();
  });

  it('falls back to the overview for a Districts hash on an at-large state, saying why', async () => {
    window.location.hash = '#tab=districts';
    renderWithQuery(<MeasureDashboard slug="nd-measure-2" />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByTestId('no-districts-note')).toHaveTextContent(
      'No district breakdown: North Dakota has one at-large congressional district.',
    );
    // The note goes away once the reader picks a tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide' }));
    expect(screen.queryByTestId('no-districts-note')).toBeNull();
  });

  it('explains a Districts hash for a measure with too few sample households', async () => {
    window.location.hash = '#tab=districts';
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    expect(await screen.findByTestId('no-districts-note')).toHaveTextContent(
      'No district breakdown for Proposition 3: too few sample households carry the change.',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves to another measure named in the hash', async () => {
    window.location.hash = '#measure=wa-i-645&tab=statewide';
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/wa-i-645#tab=statewide'));
  });

  it('follows hash changes from an embedding parent, including the methods tab’s old id', async () => {
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    act(() => {
      window.location.hash = '#tab=methodology';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Methodology' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });
});
