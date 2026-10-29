import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CaProp40Page, { metadata } from '../app/(shell)/ca-prop-40/page';
import { generateStaticParams } from '../app/(shell)/[measure]/page';
import { CA_PROP_40, LINKED_TOOLS } from '../content/linkedTools';
import { landingStates } from '../lib/landing';

describe('California Proposition 40 page', () => {
  it('has the measure pages’ title block, one intro line and the embedded calculator', () => {
    render(<CaProp40Page />);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: '2026 ballot measures' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByText('California')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('California Proposition 40');
    expect(screen.getByText('One-time tax on billionaires’ wealth · November 3, 2026')).toBeInTheDocument();
    expect(screen.getByText(CA_PROP_40.intro)).toBeInTheDocument();
    const frame = screen.getByTitle(CA_PROP_40.embedTitle);
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'https://california-wealth-tax.vercel.app/us/california-wealth-tax');
    expect(frame).toHaveClass('h-[calc(100vh-200px)]', 'min-h-[900px]', 'w-full');
    const open = screen.getByRole('link', { name: /Open the calculator in a new tab/ });
    expect(open).toHaveAttribute('href', 'https://www.policyengine.org/us/california-wealth-tax');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    // No tabs on this page.
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('describes the measure as the calculator does', () => {
    expect(metadata.title).toBe('California Proposition 40: one-time tax on billionaires’ wealth');
    expect(metadata.alternates?.canonical).toBe('https://policyengine.org/us/ballot-measures-2026/ca-prop-40');
    // README of PolicyEngine/california-wealth-tax: 5% of net worth, residents on January 1,
    // 2026, worth $1 billion or more, valued December 31, 2026, ramping from $1.0B to $1.1B.
    for (const fact of ['one-time tax of 5%', 'January 1, 2026', '$1 billion or more', 'December 31, 2026', 'between $1.0 billion and $1.1 billion']) {
      expect(CA_PROP_40.overview).toContain(fact);
    }
    const banned = /\b(massive|burden|crushing|devastating|windfall|giveaway|slash(es)?|skyrocket|unfair|soak)\b/i;
    expect(`${CA_PROP_40.overview} ${CA_PROP_40.intro}`).not.toMatch(banned);
  });

  it('joins California on the landing map without becoming a dashboard measure', () => {
    const ca = landingStates().find((s) => s.code === 'CA')!;
    expect(ca.measures.map((m) => [m.designation, m.linkLabel])).toEqual([
      ['Proposition 3', 'View analysis'],
      ['Proposition 40', 'Open the calculator'],
    ]);
    // The static folder serves it; [measure] (dynamicParams = false) never generates it.
    const slugs = generateStaticParams().map((p) => p.measure);
    for (const tool of LINKED_TOOLS) expect(slugs).not.toContain(tool.slug);
  });
});
