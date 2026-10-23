import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import PolicyOverview from '../components/PolicyOverview';
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

  it('shows both years of Proposition NN refund tiers', () => {
    renderWithQuery(<PolicyOverview measure={getMeasure('co-prop-nn')} />);
    expect(screen.getByRole('table', { name: /tax year 2027/ })).toHaveTextContent('$137');
    expect(screen.getByRole('table', { name: /tax year 2028/ })).toHaveTextContent('$147');
    expect(screen.getByText('Tax years 2027 and 2028')).toBeInTheDocument();
  });
});
