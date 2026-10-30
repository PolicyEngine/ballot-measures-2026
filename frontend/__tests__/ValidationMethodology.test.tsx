import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ValidationMethodology from '../components/ValidationMethodology';
import { getContent } from '../content/measures';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, fixtureText, mockDataFiles, renderWithQuery } from './testUtils';

describe('ValidationMethodology', () => {
  it('compares each official estimate with the model in its tax year', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('wa-i-645')} year={2028} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    await within(table).findByText('-$3.42B');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('-$3.11B');
    // Fiscal-year collections against tax-year liability: shown side by side, no ratio
    expect(rows[0]).toHaveTextContent('Not compared; see the note');
    expect(rows[0]).not.toHaveTextContent(/of the official figure/);
    expect(rows[1]).toHaveTextContent('-$4.43B');
    expect(rows[1]).toHaveTextContent('-$3.95B');
    expect(rows[2]).toHaveTextContent('30,000');
  });

  it('compares Amendment 87 with the Blue Book’s individual-taxpayer table, not its revenue total', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    await within(table).findAllByText('$1.81B');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026 Blue Book, Table 3');
    expect(rows[0]).toHaveTextContent('$635.7M');
    expect(rows[0]).toHaveTextContent(/\d+% of the official figure/);
    // The revenue total also counts C corporations: no ratio against it
    expect(rows[1]).toHaveTextContent('$1.97B');
    expect(rows[1]).toHaveTextContent('incl. C corporations');
    expect(rows[1]).toHaveTextContent('Not compared; see the note');
    expect(rows[1]).not.toHaveTextContent(/of the official figure/);
  });

  it('places a model range against an official range', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    expect(await within(table).findByText('within the official range')).toBeInTheDocument();
    expect(table).toHaveTextContent('$124.3M to $134.3M');
    expect(screen.getByText(/Participation adjustment/)).toBeInTheDocument();
    // Enrollment and the count already eating free come from the registry (kind_params).
    expect(screen.getByText(/Participation adjustment/).closest('p')).toHaveTextContent(
      /public school enrollment \(116,762 students, less the 9,196 at public schools that already serve every meal free on the Department of Public Instruction’s 2026 community eligibility list\)/,
    );
  });

  it('shows provenance from the manifest and the parameter changes', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-prop-nn')} year={2027} />);
    expect(await screen.findByText('synthetic')).toBeInTheDocument();
    expect(screen.getByText(/gov\.states\.co\.tax\.income\.credits\.sales_tax_refund\.in_effect = false/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /TABOR refund obligations/ })).toHaveTextContent('$463.7M');
    expect(screen.getByRole('table', { name: 'Survey households behind the estimates' })).toHaveTextContent('2028');
  });

  it('compares top incomes with IRS data for income tax measures', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />);
    expect(await screen.findByRole('heading', { name: 'Top incomes compared with IRS data' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Colorado filers: model \(2024 data\) and IRS/ });
    expect(table).toHaveTextContent('Income above $1 million');
    expect(table).toHaveTextContent('60%');
    expect(screen.getByText(/Scaling the change in each income band/)).toHaveTextContent('+$2.24B');
  });

  it('shows South Dakota’s model and adjusted values', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('sd-amendment-i')} year={2028} />);
    const calibration = await screen.findByRole('table', { name: 'Model and adjusted values' });
    expect(within(calibration).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Measure',
      'Model',
      'Adjusted to enrollment',
    ]);
    const losing = within(calibration).getByText('People losing Medicaid').closest('tr')!;
    expect(losing).toHaveTextContent('54,000');
    expect(losing).toHaveTextContent('28,017');
    expect(screen.getByText(/enrollment adjustment factor of 0\.519/)).toBeInTheDocument();
    expect(screen.getByText(/enrollment \(29,055 people\)/)).toBeInTheDocument();
    // Enrollment pairs the model's own count with the administrative one.
    const enrolled = within(calibration).getByText('Enrolled through expansion under current law').closest('tr')!;
    expect(enrolled).toHaveTextContent('56,000');
    expect(enrolled).toHaveTextContent('29,055');
    expect(screen.getByText(/The model counts 56,000 people enrolled through expansion/)).toBeInTheDocument();
    // The validation table compares the department's figure with the model's own count.
    const validation = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    const dss = within(validation).getByRole('link', { name: /Department of Social Services/ }).closest('tr')!;
    expect(dss).toHaveTextContent('29,055');
    expect(dss).toHaveTextContent('56,000');
    expect(dss).toHaveTextContent('Model before adjustment; the dashboard scales');
    const pamphlet = within(validation).getByRole('link', { name: /ballot question pamphlet/ }).closest('tr')!;
    expect(pamphlet).toHaveTextContent('Model before adjustment to the Department');
    // The survey weights are described in plain words; "calibrated" appears nowhere
    expect(screen.getByText(/from survey households weighted to\s+match administrative totals/)).toBeInTheDocument();
    expect(screen.getByText(/runs on a sample of US households \(Populace\), weighted to match administrative totals/)).toBeInTheDocument();
    expect(screen.queryByText(/calibrat/i)).toBeNull();
    expect(screen.getByText(/After adjustment to enrollment, Medicaid/)).toBeInTheDocument();
  });

  it('has no IRS comparison for other kinds', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('sd-amendment-i')} year={2028} />);
    await screen.findByText('synthetic');
    expect(screen.queryByRole('heading', { name: 'Top incomes compared with IRS data' })).toBeNull();
    // South Dakota shows no poverty figures, so no note on SPM resources.
    expect(screen.queryByText(/to SPM resources/)).toBeNull();
  });

  it('notes the income added to SPM resources', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('ca-prop-3')} year={2031} />);
    // Once, in the basis table's poverty row.
    const notes = await screen.findAllByText(/Poverty figures add partnership and S corporation income, farm rental income/);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent(/Alaska Permanent Fund dividend to SPM resources, which the released model omits\./);
    // Readers get the reason, not the issue tracker's number
    expect(screen.queryByText(/policyengine-us#\d+/)).toBeNull();
  });

  it('marks the model figure pending when results are missing', async () => {
    mockDataFiles({});
    renderWithQuery(<ValidationMethodology measure={getMeasure('ca-prop-3')} year={2031} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    expect(await within(table).findByText('Pending')).toBeInTheDocument();
    expect(table).toHaveTextContent('$5B to $15B');
  });
});

describe('Methods tab sections', () => {
  it('has six sections in order', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    await screen.findByText('synthetic');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'How these figures are produced',
      'Official estimates',
      'Measure-specific method',
      'Sources and ballot text',
      'Limitations',
      'Model and data',
    ]);
  });

  it('collects the notes from the other tabs under how the figures are produced', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    const section = screen.getByRole('heading', { name: 'How these figures are produced' }).closest('section')!;
    expect(section).toHaveTextContent('Budget lines are signed from the government’s side');
    expect(section).toHaveTextContent('participation-adjusted midpoint of the low and high cases');
    expect(section).toHaveTextContent(
      'Single adults with dependents file as head of household; married couples file jointly.',
    );
    expect(section).toHaveTextContent('Taxes are after refundable credits; net income is income after taxes plus benefits.');
    expect(section).toHaveTextContent('Federal effects are not modeled.');
    // North Dakota's sample is large enough for no precision note.
    expect(section).not.toHaveTextContent('effective sample size');
  });

  it('notes the withholding treatment of the federal deduction for income tax measures', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('wa-i-645')} year={2029} />);
    expect(screen.getByText(/uses state income tax withholding in the model/)).toBeInTheDocument();
  });

  it('flags estimates that rest on a small effective sample', async () => {
    const metrics = fixtureText('metrics.csv')
      .replace('wa-i-645,2029,affected_sample_households,211', 'wa-i-645,2029,affected_sample_households,447')
      .replace('wa-i-645,2029,effective_affected_sample_households,74', 'wa-i-645,2029,effective_affected_sample_households,13.3');
    mockDataFiles({ ...fixtureFiles(), 'metrics.csv': metrics });
    renderWithQuery(<ValidationMethodology measure={getMeasure('wa-i-645')} year={2029} />);
    const note = await screen.findByText(/rest on 447 sampled households/);
    expect(note).toHaveTextContent('about 13 independent households (the effective sample size)');
  });

  it('describes South Dakota’s household results as the Household tab shows them, and gives its reasoning once', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('sd-amendment-i')} year={2028} />);
    await screen.findByText('synthetic');
    // The Household tab reports cash income without the value of coverage (CoverageResults)
    expect(
      screen.getByText(/For Medicaid, the calculator reports cash income, net income without the value of health coverage, and shows the coverage itself separately\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/counting the value of health coverage/)).not.toBeInTheDocument();
    // Why the scenario is in people rather than net income: one copy, in the measure-specific method.
    expect(screen.getAllByText(/rather than (household )?net income|People rather than net income/)).toHaveLength(1);
    // Both readings of the amendment, in full.
    expect(screen.getByRole('heading', { name: 'A conditional scenario, not a forecast' })).toBeInTheDocument();
    expect(screen.getByText(/would NOT automatically end Medicaid expansion/)).toBeInTheDocument();
  });

  it('states the static caveat once', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />);
    await screen.findByText('synthetic');
    expect(screen.getAllByText(/Estimates are static/)).toHaveLength(1);
    expect(screen.queryByText(/assume no change in behavior/)).toBeNull();
  });

  it('describes district boundaries only for measures with a district breakdown', async () => {
    mockDataFiles(fixtureFiles());
    const { unmount } = renderWithQuery(
      <ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />,
    );
    expect(screen.getByText(/Districts follow 119th Congress boundaries/)).toBeInTheDocument();
    unmount();
    renderWithQuery(<ValidationMethodology measure={getMeasure('ca-prop-3')} year={2031} />);
    expect(screen.queryByText(/Districts follow 119th Congress boundaries/)).toBeNull();
  });

  it('shows the ballot title as printed, with its source', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />);
    fireEvent.click(screen.getByText('Ballot title as it appears on the ballot'));
    expect(screen.getByText(/SHALL STATE TAXES BE INCREASED \$2\.7 BILLION ANNUALLY/)).toBeInTheDocument();
    const details = screen.getByText('Ballot title as it appears on the ballot').closest('details')!;
    expect(within(details).getByRole('link', { name: '2026 Blue Book, page 10' })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=10'),
    );
  });

  it('cites the vote each measure needs, in full', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-amendment-87')} year={2027} />);
    const vote = screen.getByText('Vote needed to pass').closest('div')!;
    expect(vote).toHaveTextContent(/at least 55% of the votes cast unless it is limited to a repeal/);
    expect(within(vote).getByRole('link', { name: '2026 Blue Book, page 4 (vote requirements)' })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=4'),
    );
    expect(within(vote).getByRole('link', { name: '2026 Blue Book, page 33 (Amendment 87)' })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=33'),
    );
    // How it reached the ballot does not carry the threshold.
    expect(screen.getByText('How it reached the ballot').closest('div')).not.toHaveTextContent('majority');
    // Context sections moved here from the overview.
    expect(screen.getByRole('heading', { name: 'Proposition 136' })).toBeInTheDocument();
  });

  it('cites the Blue Book for the measures Proposition NN interacts with', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('co-prop-nn')} year={2027} />);
    expect(screen.getByRole('link', { name: /page 67 \(Proposition 137/ })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=67'),
    );
    expect(screen.getByText(/does not score later years/)).toBeInTheDocument();
  });

  it('quotes the Washington fiscal impact statement once, without commentary', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('wa-i-645')} year={2028} />);
    const quote = screen.getByText(
      /“Savings are assumed for tax administration duties for approximately 30,000 taxpayers that will no longer be required\.”/,
    );
    // In the official estimates table, beside its page-4 source.
    const row = quote.closest('tr')!;
    expect(within(row).getByRole('link', { name: /Office of Financial Management/ })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=4'),
    );
  });

  it('lists references in NJ’s three boxes', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    const refs = screen.getByRole('heading', { name: 'References' }).closest('section')!;
    for (const name of ['Ballot measure text and voter guides', 'Official estimates', 'Calculations']) {
      expect(within(refs).getByRole('heading', { name })).toBeInTheDocument();
    }
    // Official estimate sources come from the registry, one link per source.
    const estimates = within(refs).getByRole('heading', { name: 'Official estimates' }).parentElement!;
    for (const e of getMeasure('nd-measure-2').official_estimates) {
      expect(within(estimates).getByRole('link', { name: e.source })).toHaveAttribute('href', e.url);
    }
    expect(await within(refs).findByText(/policyengine-us==/)).toBeInTheDocument();
    // North Dakota has no district breakdown, so the calculations box does not mention districts.
    expect(within(refs).getByRole('heading', { name: 'Calculations' }).parentElement).not.toHaveTextContent(/district/i);
  });

  it('gives the full who-is-affected text with its sources', () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    for (const p of getContent('nd-measure-2').whoIsAffected) expect(screen.getByText(p)).toBeInTheDocument();
  });
});
