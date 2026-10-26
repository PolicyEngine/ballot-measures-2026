import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import PolicyOverview from '../components/PolicyOverview';
import { MEASURE_SLUGS, getContent } from '../content/measures';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

beforeEach(() => {
  mockDataFiles(fixtureFiles());
});

describe('PolicyOverview', () => {
  it('compares current law with the measure', async () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-amendment-87')} />);
    expect(screen.getByRole('heading', { name: 'What Amendment 87 does' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Income tax rates on Colorado taxable income/ });
    expect(table).toHaveTextContent('Current law');
    expect(table).toHaveTextContent('If it passes');
    expect(table).toHaveTextContent('8.4%');
    expect(screen.getByRole('heading', { name: 'Who is affected' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proposition 136' })).toBeInTheDocument();
    // The headline estimate loads beside the official one.
    expect(await screen.findByText('+$1.81B')).toBeInTheDocument();
    expect(screen.getByText('+$1.97B')).toBeInTheDocument();
  });

  it('shows the ballot title as printed, with its source', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-amendment-87')} />);
    fireEvent.click(screen.getByText('Ballot title as it appears on the ballot'));
    expect(screen.getByText(/SHALL STATE TAXES BE INCREASED \$2\.7 BILLION ANNUALLY/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2026 Blue Book, page 10' })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=10'),
    );
  });

  it('opens South Dakota with the conditional scenario and both readings', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('sd-amendment-i')} />);
    expect(screen.getByRole('heading', { name: 'A conditional scenario, not a forecast' })).toBeInTheDocument();
    expect(screen.getByText(/would NOT automatically end Medicaid expansion/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current law and the scenario' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /covered through expansion/ })).toHaveTextContent(
      'Scenario: expansion ends',
    );
  });

  it('cites the vote each measure needs', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-amendment-87')} />);
    const vote = screen.getByText('Vote needed to pass').closest('div')!;
    expect(vote).toHaveTextContent(/at least 55% of the votes cast unless it is limited to a repeal/);
    expect(screen.getByRole('link', { name: '2026 Blue Book, page 4 (vote requirements)' })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=4'),
    );
    expect(screen.getByRole('link', { name: '2026 Blue Book, page 33 (Amendment 87)' })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=33'),
    );
    // How it reached the ballot no longer carries the threshold.
    expect(screen.getByText('How it reached the ballot').closest('div')).not.toHaveTextContent('majority');
  });

  it.each(MEASURE_SLUGS)('cites an official source for the vote %s needs', (slug) => {
    const { voteRequirement, measureType } = getContent(slug);
    expect(voteRequirement.text).not.toMatch(/PENDING/);
    expect(voteRequirement.sources.length).toBeGreaterThan(0);
    for (const source of voteRequirement.sources) expect(source.url).toMatch(/^https:\/\//);
    expect(measureType).not.toMatch(/majority/);
  });

  it('cites the Blue Book for the measures Proposition NN interacts with', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-prop-nn')} />);
    expect(screen.getByRole('link', { name: /page 67 \(Proposition 137/ })).toHaveAttribute(
      'href',
      expect.stringContaining('#page=67'),
    );
    expect(screen.getByText(/does not score later years/)).toBeInTheDocument();
  });

  it('quotes the Washington fiscal impact statement without commentary', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('wa-i-645')} />);
    expect(
      screen.getByText(
        /“Savings are assumed for tax administration duties for approximately 30,000 taxpayers that will no longer be required\.”/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fiscal impact statement, page 4' })).toBeInTheDocument();
  });

  it('gives North Dakota’s enrollment figures from the registry with official sources', () => {
    const measure = getMeasure('nd-measure-2');
    const { whoIsAffected, whoIsAffectedSources } = getContent('nd-measure-2');
    const text = whoIsAffected.join(' ');
    const count = (key: string) => (measure.kind_params[key] as number).toLocaleString('en-US');
    expect(text).toContain(`${count('public_enrollment')} students`);
    expect(text).toContain(`${count('cep_students')} students at 39 public schools`);
    expect(text).toMatch(/Bureau of Indian Education, tribal and private schools/);
    expect(text).not.toMatch(/Food Research|FRAC/);
    expect(whoIsAffectedSources?.map((s) => s.url)).toContain(
      'https://www.nd.gov/dpi/sites/default/files/documents/ChildNutrition/SNP/2026CEPLEAwideNotificationReport2.pdf#page=2',
    );
    expect(whoIsAffectedSources?.some((s) => s.url.includes('frac.org'))).toBe(false);
  });

  it('shows both years of Proposition NN refund tiers', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-prop-nn')} />);
    expect(screen.getByRole('table', { name: /tax year 2027/ })).toHaveTextContent('$137');
    expect(screen.getByRole('table', { name: /tax year 2028/ })).toHaveTextContent('$147');
    expect(screen.getByText('Tax years 2027 and 2028')).toBeInTheDocument();
  });
});
