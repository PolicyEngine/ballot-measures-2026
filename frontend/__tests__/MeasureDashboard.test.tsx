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
      'Household',
      'Statewide',
      'Methodology & validation',
    ]);
  });

  it.each(['co-amendment-87', 'co-prop-nn'])('%s has a Districts tab', (slug) => {
    renderWithQuery(<MeasureDashboard slug={slug} />);
    expect(screen.getByRole('tab', { name: 'Districts' })).toBeInTheDocument();
  });

  it('shows the measure name, title and overview first', () => {
    renderWithQuery(<MeasureDashboard slug="wa-i-645" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Washington Initiative 645');
    expect(
      screen.getByText('Repeal the tax on income over $1 million and bar income taxes by statute'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    // Washington has districts, but few sample households carry the change.
    expect(tabNames()).not.toContain('Districts');
  });

  it('marks South Dakota as a conditional scenario', () => {
    renderWithQuery(<MeasureDashboard slug="sd-amendment-i" />);
    expect(screen.getByText(/Conditional scenario: no effect unless/)).toBeInTheDocument();
  });

  it('moves between tabs with the arrow, Home and End keys', () => {
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    const tablist = screen.getByRole('tablist', { name: 'Measure sections' });
    const tab = (name: string) => screen.getByRole('tab', { name });
    // Only the selected tab is in the tab order.
    expect(tab('Overview')).toHaveAttribute('tabindex', '0');
    expect(tab('Household')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab('Household')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Household')).toHaveFocus();
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(tab('Methodology & validation')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(tab('Methodology & validation')).toHaveAttribute('aria-selected', 'true');
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
    expect(await screen.findByText(/tax year 2029/)).toBeInTheDocument();
  });

  it('falls back to the overview for a Districts hash on an at-large state', async () => {
    window.location.hash = '#tab=districts';
    renderWithQuery(<MeasureDashboard slug="nd-measure-2" />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true'),
    );
  });

  it('moves to another measure named in the hash', async () => {
    window.location.hash = '#measure=wa-i-645&tab=statewide';
    renderWithQuery(<MeasureDashboard slug="co-prop-nn" />);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/wa-i-645#tab=statewide'));
  });

  it('follows hash changes from an embedding parent', async () => {
    renderWithQuery(<MeasureDashboard slug="ca-prop-3" />);
    act(() => {
      window.location.hash = '#tab=methodology';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Methodology & validation' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
  });
});
