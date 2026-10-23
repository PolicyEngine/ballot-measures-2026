import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ValidationMethodology from '../components/ValidationMethodology';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

describe('ValidationMethodology', () => {
  it('compares each official estimate with the model in its tax year', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('wa-i-645')} year={2028} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    await within(table).findByText('-$3.42B');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('-$3.11B');
    expect(rows[0]).toHaveTextContent(/110% of the official figure/);
    expect(rows[1]).toHaveTextContent('-$4.43B');
    expect(rows[1]).toHaveTextContent('-$3.95B');
    expect(rows[2]).toHaveTextContent('30,000');
  });

  it('places a model range against an official range', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('nd-measure-2')} year={2028} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    expect(await within(table).findByText('within the official range')).toBeInTheDocument();
    expect(table).toHaveTextContent('$124.3M to $134.3M');
    expect(screen.getByText(/Participation adjustment/)).toBeInTheDocument();
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

  it('shows South Dakota’s model and calibrated values', async () => {
    mockDataFiles(fixtureFiles());
    renderWithQuery(<ValidationMethodology measure={getMeasure('sd-amendment-i')} year={2028} />);
    const calibration = await screen.findByRole('table', { name: 'Model and calibrated values' });
    const losing = within(calibration).getByText('People losing Medicaid').closest('tr')!;
    expect(losing).toHaveTextContent('54,000');
    expect(losing).toHaveTextContent('28,017');
    expect(screen.getByText(/calibration factor of 0\.519/)).toBeInTheDocument();
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
    expect(dss).toHaveTextContent('Model before calibration; the dashboard scales');
    const pamphlet = within(validation).getByRole('link', { name: /ballot question pamphlet/ }).closest('tr')!;
    expect(pamphlet).toHaveTextContent('Model before calibration to the Department');
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
    expect(
      await screen.findByText(/PolicyEngine adds partnership and S corporation income, farm rental income/),
    ).toHaveTextContent(/Alaska Permanent Fund dividend to SPM resources, which the released model omits \(policyengine-us#9919\)\./);
    expect(screen.getByRole('link', { name: 'policyengine-us#9919' })).toHaveAttribute(
      'href',
      'https://github.com/PolicyEngine/policyengine-us/issues/9919',
    );
  });

  it('marks the model figure pending when results are missing', async () => {
    mockDataFiles({});
    renderWithQuery(<ValidationMethodology measure={getMeasure('ca-prop-3')} year={2031} />);
    const table = screen.getByRole('table', { name: 'PolicyEngine and official estimates' });
    expect(await within(table).findByText('Pending')).toBeInTheDocument();
    expect(table).toHaveTextContent('$5B to $15B');
  });
});
