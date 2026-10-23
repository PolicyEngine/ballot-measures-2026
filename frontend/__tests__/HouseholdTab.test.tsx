import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HouseholdTab, { type HouseholdTabState } from '../components/HouseholdTab';
import { HouseholdResults } from '../components/ImpactAnalysis';
import { defaultForm } from '../lib/householdForm';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, fixtureResponse, mockDataFiles, renderWithQuery } from './testUtils';

function Harness({ slug, year }: { slug: string; year: number }) {
  const measure = getMeasure(slug);
  const [state, setState] = useState<HouseholdTabState>({ form: defaultForm(measure), submitted: null });
  return <HouseholdTab measure={measure} year={year} state={state} setState={setState} />;
}

describe('HouseholdTab', () => {
  it('loads an example household without calling the calculator', async () => {
    const fetchMock = mockDataFiles(fixtureFiles());
    renderWithQuery(<Harness slug="wa-i-645" year={2028} />);
    const card = await screen.findByRole('button', { name: /Single filer, \$1\.5M wages/ });
    expect(card).toHaveTextContent('+$49,500');
    fireEvent.click(card);
    expect(await screen.findByRole('heading', { name: 'Single filer, $1.5M wages' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'At your employment income' })).toHaveTextContent(
      'Washington income tax',
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/calculate'))).toBe(false);
    // The form now holds the example's inputs.
    expect(screen.getByLabelText('Your employment income')).toHaveValue('1,500,000');
  });

  it('shows the examples for the selected tax year', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<Harness slug="co-prop-nn" year={2028} />);
    expect(await screen.findByText(/if Proposition NN passes, 2028/)).toBeInTheDocument();
    // TY2028 tiers: a single filer at $40,000 loses the $47 refund.
    expect(screen.getByRole('button', { name: /Single filer, \$40k wages/ })).toHaveTextContent('-$47');
  });

  it('says examples are unavailable when the file is missing', async () => {
    mockDataFiles({});
    renderWithQuery(<Harness slug="nd-measure-2" year={2028} />);
    expect(await screen.findByText(/Example household results are not yet available/)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Your household' })).toBeInTheDocument();
  });

  it('posts the form to the calculator with the measure and year', async () => {
    const response = fixtureResponse('co-prop-nn', 0, 2028);
    const files = fixtureFiles();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/calculate')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(response) } as Response);
      }
      const name = Object.keys(files).find((n) => url.endsWith(`/${n}`));
      return Promise.resolve({
        ok: Boolean(name),
        status: name ? 200 : 404,
        text: () => Promise.resolve(name ? files[name] : ''),
        json: () => Promise.resolve(name ? JSON.parse(files[name]) : null),
      } as Response);
      void init;
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithQuery(<Harness slug="co-prop-nn" year={2028} />);
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    expect(await screen.findByRole('heading', { name: 'Your household’s results' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/calculate'))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      measure: 'co-prop-nn',
      year: 2028,
      income: 40_000,
    });
  });

  it('blocks invalid input before calling the calculator', async () => {
    const fetchMock = mockDataFiles({});
    renderWithQuery(<Harness slug="sd-amendment-i" year={2028} />);
    fireEvent.change(screen.getByLabelText('Your age'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate impact' }));
    expect(await screen.findByText('Your age must be between 18 and 110.')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/calculate'))).toBe(false),
    );
  });
});

describe('HouseholdResults', () => {
  it('shows the change at the entered income and kind-specific rows', () => {
    const response = fixtureResponse('sd-amendment-i', 0);
    renderWithQuery(<HouseholdResults measure={getMeasure('sd-amendment-i')} result={response} />);
    expect(screen.getByText('Change in household net income')).toBeInTheDocument();
    expect(screen.getByText('In the scenario, compared with current law')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'At your employment income' });
    expect(within(table).getByText('Medicaid (value of coverage)')).toBeInTheDocument();
    expect(within(table).getByText('Scenario: expansion ends')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Chart' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Medicaid and premium tax credit' }));
    expect(screen.getByText('Medicaid and premium tax credit by employment income')).toBeInTheDocument();
  });
});
