import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import LandingPage from '../components/LandingPage';
import { MEASURES } from '../lib/measures';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';
import { routerMock } from './routerMock';

beforeEach(() => {
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
});

describe('LandingPage', () => {
  it('lists the six measures under a map of the states', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '2026 ballot measures: taxes and benefits',
    );
    expect(screen.getByText(/November 3, 2026 ballot in five states/)).toBeInTheDocument();
    const map = screen.getByRole('region', { name: 'Map of states with measures' });
    // Five highlighted states on the map, each a button.
    expect(within(map).getAllByRole('button').map((b) => b.getAttribute('data-state')).sort()).toEqual([
      'CA',
      'CO',
      'ND',
      'SD',
      'WA',
    ]);
    // One card per measure, linking to its page.
    for (const m of MEASURES) {
      expect(
        screen.getByRole('link', { name: `${m.state_name} ${m.designation}: ${m.short_title}` }),
      ).toHaveAttribute('href', `/${m.slug}`);
    }
    expect(MEASURES).toHaveLength(6);
    // Colorado's two measures, in one line.
    expect(
      screen.getByText(
        'Colorado voters decide Amendment 87 and Proposition NN separately; each is modeled against current law.',
      ),
    ).toBeInTheDocument();
    // No about text or basis labels on the landing page.
    expect(screen.queryByRole('heading', { name: /About/ })).toBeNull();
    expect(screen.queryByText(/Model estimate|Calibrated/)).toBeNull();
  });

  it('shows PolicyEngine headline figures next to official estimates', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<LandingPage />);
    const wa = screen.getByRole('link', { name: /Washington Initiative 645/ });
    await waitFor(() => expect(wa).toHaveTextContent('-$3.42B'));
    expect(wa).toHaveTextContent('Official: -$3.11B');
    expect(wa).toHaveAttribute('href', '/wa-i-645');
    const sd = screen.getByRole('link', { name: /South Dakota Constitutional Amendment I/ });
    expect(sd).toHaveTextContent('Conditional scenario');
  });

  it('says results are not yet available when metrics.csv is missing', async () => {
    mockDataFiles({});
    renderWithQuery(<LandingPage />);
    await waitFor(() => expect(screen.getAllByText('Results not yet available')).toHaveLength(6));
  });

  it('opens a single-measure state from the map', () => {
    mockDataFiles({});
    renderWithQuery(<LandingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^Washington/ }));
    expect(routerMock.push).toHaveBeenCalledWith('/wa-i-645');
    fireEvent.click(screen.getByRole('button', { name: /^Colorado/ }));
    expect(routerMock.push).toHaveBeenCalledTimes(1);
  });

  it('forwards a #measure= link to the measure page', async () => {
    mockDataFiles({});
    window.location.hash = '#measure=nd-measure-2&tab=household';
    renderWithQuery(<LandingPage />);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/nd-measure-2#tab=household'));
  });
});
