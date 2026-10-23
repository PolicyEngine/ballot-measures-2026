import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlaceholderBanner from '../components/PlaceholderBanner';
import { fixtureFiles, mockDataFiles, renderWithQuery } from './testUtils';

describe('PlaceholderBanner', () => {
  it('appears when the results manifest is marked synthetic', async () => {
    mockDataFiles(fixtureFiles(['manifest.json']));
    renderWithQuery(<PlaceholderBanner />);
    expect(await screen.findByTestId('placeholder-banner')).toHaveTextContent('Placeholder data.');
  });

  it('stays hidden for real results', async () => {
    mockDataFiles({ 'manifest.json': { pin: 'policyengine-us==2.60.4', dataset_revision: 'r', registry_hash: 'h', generated_at_utc: 't' } });
    renderWithQuery(<PlaceholderBanner />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByTestId('placeholder-banner')).toBeNull();
  });
});
