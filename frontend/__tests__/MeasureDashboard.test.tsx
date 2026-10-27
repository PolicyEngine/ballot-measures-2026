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
      'Policy overview',
      'Household impact',
      'Statewide impact',
      'Validation and methods',
    ]);
  });

  it.each(['co-amendment-87', 'co-prop-nn'])('%s has a Districts tab', (slug) => {
    renderWithQuery(<MeasureDashboard slug={slug} />);
    expect(screen.getByRole('tab', { name: 'Congressional districts' })).toBeInTheDocument();
  });

  it('shows the NJ-style header band, a link back and the overview first', () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Washington Initiative 645');
    // One subtitle sentence in the band, built from the content phrase and the election date.
    expect(
      screen.getByText(
        'See how repealing the tax on income over $1 million and barring income taxes by statute would affect Washington households and the state budget if it passes on November 3, 2026',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All 2026 ballot measures/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('tab', { name: 'Policy overview' })).toHaveAttribute('aria-selected', 'true');
    // Washington has districts, but few sample households carry the change.
    expect(tabNames()).not.toContain('Congressional districts');
  });

  it('describes South Dakota as a scenario in the header band', () => {
    renderWithQuery(<MeasureDashboard slug="sd-amendment-i" />);
    expect(
      screen.getByText(
        /would affect South Dakota households and the state budget under a scenario in which the federal share falls below 90% and expansion ends$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A conditional scenario, not a forecast' })).toBeInTheDocument();
  });

  it('moves between tabs with the arrow, Home and End keys', () => {
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    const tablist = screen.getByRole('tablist', { name: 'Measure sections' });
    const tab = (name: string) => screen.getByRole('tab', { name });
    // Only the selected tab is in the tab order.
    expect(tab('Policy overview')).toHaveAttribute('tabindex', '0');
    expect(tab('Household impact')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab('Household impact')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Household impact')).toHaveFocus();
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tab('Validation and methods')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab('Policy overview')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tab('Validation and methods')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(tab('Policy overview')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Policy overview')).toHaveFocus();
  });
});

describe('year selector and hash', () => {
  it('appears only for measures scored in several years, off the overview', () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    expect(screen.queryByRole('radiogroup', { name: 'Tax year' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide impact' }));
    const years = screen.getByRole('radiogroup', { name: 'Tax year' });
    expect(within(years).getAllByRole('radio').map((r) => r.textContent)).toEqual(['2028', '2029']);
    expect(within(years).getByRole('radio', { name: '2028' })).toHaveAttribute('aria-checked', 'true');
  });

  it('changes the year with the arrow keys', () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide impact' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide impact' }));
    expect(screen.queryByRole('radiogroup', { name: 'Tax year' })).toBeNull();
  });

  it('writes the tab and year to the hash', () => {
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Statewide impact' }));
    fireEvent.click(screen.getByRole('radio', { name: '2028' }));
    expect(window.location.hash).toBe('#year=2028&tab=statewide');
  });

  it('reads the tab and year from the hash', async () => {
    window.location.hash = '#tab=statewide&year=2029';
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Statewide impact' })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByRole('radio', { name: '2029' })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText(/Tax year 2029\./)).toBeInTheDocument();
  });

  it('shows the year pills on every tab that depends on the year', () => {
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    for (const name of ['Household impact', 'Statewide impact', 'Congressional districts', 'Validation and methods']) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(screen.getByRole('radiogroup', { name: 'Tax year' })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Policy overview' }));
    expect(screen.queryByRole('radiogroup', { name: 'Tax year' })).toBeNull();
  });

  it('falls back to the overview for a Districts hash on an at-large state', async () => {
    window.location.hash = '#tab=districts';
    renderWithQuery(<MeasureDashboard slug="nd-measure-2" />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Policy overview' })).toHaveAttribute('aria-selected', 'true'),
    );
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
      expect(screen.getByRole('tab', { name: 'Validation and methods' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });
});
