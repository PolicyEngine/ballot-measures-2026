import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import LandingPage from '../components/LandingPage';
import { LINKED_TOOLS } from '../content/linkedTools';
import { MEASURES } from '../lib/measures';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';
import { routerMock } from './routerMock';

beforeEach(() => {
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
  mockDataFiles(fixtureFiles());
});

describe('LandingPage', () => {
  it('is a map of the states, with no measure cards', () => {
    renderWithQuery(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026 ballot measures: taxes and benefits');
    const map = screen.getByRole('region', { name: 'Map of states with measures' });
    expect(within(map).getAllByRole('button').map((b) => b.getAttribute('data-state')).sort()).toEqual([
      'CA',
      'CO',
      'ND',
      'SD',
      'WA',
    ]);
    expect(screen.getByText('Select a highlighted state to see its measures.')).toBeInTheDocument();
    // No cards and no scores: PolicyEngine and official figures are on the measure pages.
    expect(screen.queryByText('View analysis')).toBeNull();
    expect(screen.queryByText(/Official|PolicyEngine:|Results not yet available/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /About/ })).toBeNull();
  });

  it('keeps a visually hidden list of every measure for screen readers and crawlers', () => {
    renderWithQuery(<LandingPage />);
    const list = screen.getByRole('navigation', { name: 'All measures' });
    expect(list).toHaveClass('sr-only');
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(MEASURES.length + LINKED_TOOLS.length);
    for (const m of MEASURES) {
      expect(
        within(list).getByRole('link', { name: `${m.state_name} ${m.designation}: ${m.short_title}` }),
      ).toHaveAttribute('href', `/${m.slug}`);
    }
    expect(
      within(list).getByRole('link', { name: 'California Proposition 40: One-time tax on billionaires’ wealth' }),
    ).toHaveAttribute('href', '/ca-prop-40');
  });

  it('opens a state’s dialog from the map, listing every measure to compare', () => {
    renderWithQuery(<LandingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^California/ }));
    const dialog = screen.getByRole('dialog', { name: 'California' });
    expect(within(dialog).getByRole('link', { name: 'View analysis for California Proposition 3' })).toHaveAttribute(
      'href',
      '/ca-prop-3',
    );
    expect(within(dialog).getByRole('link', { name: 'Open the calculator for California Proposition 40' })).toHaveAttribute(
      'href',
      '/ca-prop-40',
    );
    // A single-measure state opens a dialog too, rather than leaving the page.
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /^Washington/ }));
    expect(screen.getByRole('dialog', { name: 'Washington' })).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('forwards a #measure= link to the measure page', async () => {
    window.location.hash = '#measure=nd-measure-2&tab=household';
    renderWithQuery(<LandingPage />);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/nd-measure-2#tab=household'));
  });
});
