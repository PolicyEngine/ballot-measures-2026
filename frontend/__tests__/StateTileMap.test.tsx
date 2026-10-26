import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StateTileMap, { STATE_TILES } from '../components/StateTileMap';
import { measuresByState } from '../lib/registry';

const highlighted = measuresByState().map((g) => ({
  code: g.state,
  name: g.stateName,
  measures: g.measures.map((m) => m.designation),
}));

describe('StateTileMap', () => {
  it('lays out 50 states and DC on distinct tiles', () => {
    expect(Object.keys(STATE_TILES)).toHaveLength(51);
    const positions = new Set(Object.values(STATE_TILES).map(([c, r]) => `${c},${r}`));
    expect(positions.size).toBe(51);
  });

  it('highlights only the five states with measures', () => {
    const { container } = render(<StateTileMap highlighted={highlighted} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-state')).sort()).toEqual(['CA', 'CO', 'ND', 'SD', 'WA']);
    // Every other state is drawn but not interactive.
    expect(container.querySelectorAll('g[aria-hidden="true"]').length).toBeGreaterThanOrEqual(46);
    expect(screen.getByRole('button', { name: 'Colorado: Amendment 87 and Proposition NN' })).toBeInTheDocument();
  });

  it('marks Colorado with its count of measures', () => {
    render(<StateTileMap highlighted={highlighted} />);
    const co = screen.getByRole('button', { name: /^Colorado/ });
    expect(co.textContent).toContain('2');
  });

  it('selects a state by click or keyboard', () => {
    const onSelect = vi.fn();
    render(<StateTileMap highlighted={highlighted} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^Washington/ }));
    fireEvent.keyDown(screen.getByRole('button', { name: /^North Dakota/ }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: /^South Dakota/ }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: /^California/ }), { key: 'a' });
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['WA', 'ND', 'SD']);
  });

  it('describes the hovered state in the caption', () => {
    const { container } = render(<StateTileMap highlighted={highlighted} />);
    const caption = container.querySelector('figcaption')!;
    expect(caption).toHaveTextContent('5 states with measures in this dashboard');
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^California/ }));
    expect(caption).toHaveTextContent('California: Proposition 3');
  });
});
