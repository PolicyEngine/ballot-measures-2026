import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import LandingPage from '../components/LandingPage';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';
import { routerMock } from './routerMock';

beforeEach(() => {
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
});

describe('LandingPage', () => {
  it('lists six measures grouped by state, with Colorado’s two together', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '2026 ballot measures: taxes and benefits',
    );
    expect(screen.getByText(/November 3, 2026 ballot in five states/)).toBeInTheDocument();
    const colorado = screen.getByRole('region', { name: 'Colorado' });
    expect(within(colorado).getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /View analysis|:/ }).length).toBeGreaterThanOrEqual(6);
    for (const name of ['California', 'Washington', 'North Dakota', 'South Dakota']) {
      expect(within(screen.getByRole('region', { name })).getAllByRole('link')).toHaveLength(1);
    }
  });

  it('shows PolicyEngine headline figures next to official estimates', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<LandingPage />);
    const wa = screen.getByRole('link', { name: /Washington Initiative 645/ });
    await waitFor(() => expect(wa).toHaveTextContent('-$3.42B'));
    expect(wa).toHaveTextContent('-$3.11B');
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
