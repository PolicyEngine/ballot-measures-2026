import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import PolicyOverview, { firstSentence } from '../components/PolicyOverview';
import { MEASURE_SLUGS, getContent } from '../content/measures';
import { getMeasure } from '../lib/registry';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

beforeEach(() => {
  mockDataFiles(fixtureFiles());
});

describe('PolicyOverview', () => {
  it('compares current law with the measure', async () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-amendment-87')} />);
    expect(screen.getByRole('heading', { name: 'What Amendment 87 would do' })).toBeInTheDocument();
    // The summary, then NJ's gray "what changes" callout.
    expect(screen.getByText(/would replace the 4\.4% flat income tax with six rates/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What changes if it passes' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Income tax rates on Colorado taxable income/ });
    expect(table).toHaveTextContent('Current law');
    expect(table).toHaveTextContent('If it passes');
    expect(table).toHaveTextContent('8.4%');
    expect(screen.getByRole('heading', { name: 'Who is affected' })).toBeInTheDocument();
    expect(screen.getByText(getContent('co-amendment-87').whoIsAffectedSummary)).toBeInTheDocument();
    // FUTA's three headline stats: the estimate, the official one and a third, with no basis labels.
    expect(await screen.findByText('+$1.81B')).toBeInTheDocument();
    expect(screen.getByText('+$1.97B')).toBeInTheDocument();
    const stats = screen.getAllByTestId('stat-card');
    expect(stats).toHaveLength(3);
    expect(stats[0]).toHaveTextContent('PolicyEngine estimate');
    expect(stats[2]).toHaveTextContent('Tax units paying more / less');
    // Changed values in the comparison stand out (NJ's bold teal).
    expect(within(table).getAllByText('8.4%').some((c) => c.className.includes('text-primary-600'))).toBe(true);
  });

  it('leaves context, ballot text and references to the Methods tab', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-amendment-87')} />);
    expect(screen.queryByRole('heading', { name: 'Proposition 136' })).toBeNull();
    expect(screen.queryByText('Ballot title as it appears on the ballot')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'References' })).toBeNull();
    // Comparison notes are on Methods too.
    for (const c of getContent('co-amendment-87').comparisons) {
      if (c.note) expect(screen.queryByText(c.note)).toBeNull();
    }
  });

  it('opens South Dakota with a short scenario note and the comparison', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('sd-amendment-i')} />);
    expect(screen.getByRole('heading', { name: 'A conditional scenario, not a forecast' })).toBeInTheDocument();
    expect(screen.getByText(/follow the Attorney General's reading, and Methods sets out both\./)).toBeInTheDocument();
    // The two readings themselves are on the Methods tab.
    expect(screen.queryByText(/would NOT automatically end Medicaid expansion/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'What changes if it passes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current law and the scenario' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /covered through expansion/ })).toHaveTextContent(
      'Scenario: expansion ends',
    );
  });

  it('gives the key facts in one line each', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-amendment-87')} />);
    const { voteRequirement, effectiveDate } = getContent('co-amendment-87');
    const fact = (label: string) => screen.getByText(label).closest('div')!;
    expect(fact('Vote needed')).toHaveTextContent(firstSentence(voteRequirement.text));
    expect(fact('Takes effect')).toHaveTextContent(firstSentence(effectiveDate));
    expect(fact('Years modeled')).toHaveTextContent('Tax year 2027');
  });

  it.each(MEASURE_SLUGS)('cites an official source for the vote %s needs', (slug) => {
    const { voteRequirement, measureType } = getContent(slug);
    expect(voteRequirement.text).not.toMatch(/PENDING/);
    expect(voteRequirement.sources.length).toBeGreaterThan(0);
    for (const source of voteRequirement.sources) expect(source.url).toMatch(/^https:\/\//);
    expect(measureType).not.toMatch(/majority/);
  });

  it.each(MEASURE_SLUGS)('gives %s a one-sentence who-is-affected summary', (slug) => {
    const { whoIsAffectedSummary } = getContent(slug);
    expect(whoIsAffectedSummary.length).toBeGreaterThan(0);
    expect(firstSentence(whoIsAffectedSummary)).toBe(whoIsAffectedSummary);
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

  it.each(['ca-prop-3', 'wa-i-645', 'nd-measure-2', 'sd-amendment-i'])(
    'does not mention districts for %s, which has no district breakdown',
    (slug) => {
      const { container } = renderWithQuery(<PolicyOverview measure={getMeasure(slug)} />);
      expect(container.textContent).not.toMatch(/district/i);
    },
  );
});
