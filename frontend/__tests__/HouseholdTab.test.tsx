import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HouseholdTab, { type HouseholdTabState } from '../components/HouseholdTab';
import ImpactAnalysis, { HouseholdResults } from '../components/ImpactAnalysis';
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
    const response = fixtureResponse('co-prop-nn', 0, 2027);
    renderWithQuery(<HouseholdResults measure={getMeasure('co-prop-nn')} result={response} />);
    expect(screen.getByText('Change in household net income')).toBeInTheDocument();
    expect(screen.getByText('If it passes, compared with current law')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'At your employment income' });
    expect(within(table).getByText('Sales tax refund')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Chart' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sales tax refund' }));
    expect(screen.getByText('Sales tax refund by employment income')).toBeInTheDocument();
  });

  it('describes the earnings chart for screen readers', () => {
    const response = fixtureResponse('co-prop-nn', 0, 2027);
    renderWithQuery(<HouseholdResults measure={getMeasure('co-prop-nn')} result={response} />);
    const figure = screen.getByRole('figure', { name: 'Change in net income by employment income' });
    expect(figure).toHaveTextContent(/Line chart: Change in net income by employment income, for employment income from \$0 to/);
    expect(figure).toHaveTextContent(/At your employment income of \$40,000: change in net income -\$43\./);
    const table = within(figure).getByRole('table', { name: 'Change in net income by employment income, selected incomes' });
    // About ten sampled incomes plus the household's own.
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(8);
    expect(within(table).getByRole('rowheader', { name: '$40,000' })).toBeInTheDocument();
  });
});

describe('Medicaid scenario household results', () => {
  it('shows coverage and premiums instead of a net-income change', () => {
    // Married couple, $28k: both lose Medicaid and gain a premium tax credit.
    const response = fixtureResponse('sd-amendment-i', 2);
    renderWithQuery(
      <ImpactAnalysis measure={getMeasure('sd-amendment-i')} request={null} precomputed={response} exampleLabel="Couple" />,
    );
    expect(screen.queryByText('Change in household net income')).toBeNull();
    expect(screen.getByText('Coverage under current law')).toBeInTheDocument();
    expect(screen.getAllByText('Medicaid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Subsidized marketplace coverage').length).toBeGreaterThan(0);
    expect(screen.getByText('Coverage in the scenario')).toBeInTheDocument();
    // The cash change is the change in cash_net_income: the $840 premium the couple now pays.
    expect(screen.getByText('Change in cash income').parentElement).toHaveTextContent('-$840/year');
    const table = screen.getByRole('table', { name: 'At your employment income' });
    expect(within(table).getByText('People enrolled in Medicaid')).toBeInTheDocument();
    expect(within(table).getByText('Premium tax credit')).toBeInTheDocument();
    expect(within(table).queryByText('Household net income')).toBeNull();
    expect(within(table).getByText(/^Cash income/).closest('tr')).toHaveTextContent('$28,000$27,160-$840');
    // The shared results table's headers.
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Per year',
      'Current law',
      'Scenario',
      'Change',
    ]);
    // The chart shows coverage bands by income, then enrollment, the credit and premiums.
    expect(screen.getByText('Health coverage by employment income')).toBeInTheDocument();
    expect(
      screen.getByRole('group', {
        name: 'Current law: No subsidized coverage option (work requirement), up to $6,000; Medicaid, $7,500 to $28,500; Subsidized marketplace coverage, $30,000 to $60,000',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', {
        name: 'Scenario: expansion ends: No subsidized coverage option (income below the poverty line), up to $21,000; Subsidized marketplace coverage, $22,500 to $60,000',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Coverage gap')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Medicaid enrollment' }));
    expect(screen.getByText('People enrolled in Medicaid by employment income')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Premium you pay' }));
    expect(screen.getByText('Marketplace premium after the credit by employment income')).toBeInTheDocument();
  });

  it('explains each coverage band and its cutoff on hover and focus', () => {
    const response = fixtureResponse('sd-amendment-i', 2);
    renderWithQuery(
      <ImpactAnalysis measure={getMeasure('sd-amendment-i')} request={null} precomputed={response} exampleLabel="Couple" />,
    );
    const medicaid = screen.getByRole('button', {
      name: 'Medicaid, $7,500 to $28,500. Medicaid ends above $28,500 — the expansion limit, 138% of the poverty line',
    });
    fireEvent.mouseEnter(medicaid);
    const tip = screen.getByTestId('band-tooltip');
    expect(tip).toHaveAttribute('role', 'tooltip');
    expect(tip).toHaveTextContent('Medicaid$7,500 to $28,500Medicaid ends above $28,500 — the expansion limit, 138% of the poverty line');
    expect(medicaid).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.mouseLeave(medicaid);
    expect(screen.queryByTestId('band-tooltip')).toBeNull();

    // Keyboard focus shows the same tooltip; the cutoff reasons come from the content file.
    const gap = screen.getByRole('button', {
      name: /^No subsidized coverage option \(income below the poverty line\), up to \$21,000\. Coverage gap below \$22,500/,
    });
    fireEvent.focus(gap);
    expect(screen.getByTestId('band-tooltip')).toHaveTextContent(
      'Coverage gap below $22,500 — under 100% of the poverty line, no marketplace subsidy',
    );
    fireEvent.blur(gap);
    const work = screen.getByRole('button', { name: /^No subsidized coverage option \(work requirement\), up to \$6,000\./ });
    fireEvent.focus(work);
    expect(screen.getByTestId('band-tooltip')).toHaveTextContent(
      'Work requirement below $7,500 — Medicaid’s work requirement, 80 hours a month at the federal minimum wage',
    );
  });

  it('labels the coverage gap when no credit replaces Medicaid', () => {
    const response = fixtureResponse('sd-amendment-i', 0);
    renderWithQuery(<ImpactAnalysis measure={getMeasure('sd-amendment-i')} request={null} precomputed={response} />);
    expect(screen.getAllByText('No subsidized coverage option').length).toBeGreaterThan(0);
    // The API's no_option_reason explains why.
    expect(screen.getByText('Income below the poverty line, too low for a premium tax credit')).toBeInTheDocument();
  });

  it('describes example households by coverage outcome', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<Harness slug="sd-amendment-i" year={2028} />);
    const card = await screen.findByRole('button', { name: /Single adult, \$14k wages/ });
    expect(card).toHaveTextContent('Medicaid → No subsidized coverage option');
    expect(screen.getByRole('button', { name: /Married couple, \$28k/ })).toHaveTextContent(
      /Medicaid → Subsidized marketplace coverage.*Premium after the credit/,
    );
    expect(screen.getByText(/Health coverage under current law and in the scenario, 2028/)).toBeInTheDocument();
  });
});
