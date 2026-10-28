import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import USStateMap, { type MapState } from '../components/USStateMap';
import { measuresByState } from '../lib/registry';

const states: MapState[] = measuresByState().map((g) => ({
  code: g.state,
  name: g.stateName,
  measures: g.measures.map((m) => ({
    designation: m.designation,
    shortTitle: m.short_title,
    label: 'Headline',
    headline: '$1M',
    official: '$2M',
  })),
}));

describe('USStateMap', () => {
  it('draws every state and makes only the five with measures interactive', () => {
    const { container } = render(<USStateMap states={states} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-state')).sort()).toEqual(['CA', 'CO', 'ND', 'SD', 'WA']);
    // The other states are drawn but hidden from assistive technology.
    expect(container.querySelectorAll('path[aria-hidden="true"]').length).toBeGreaterThanOrEqual(46);
    expect(screen.getByRole('button', { name: 'Colorado: Amendment 87 and Proposition NN' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Map of US states/ })).toBeInTheDocument();
  });

  it('selects a state by click or keyboard', () => {
    const onSelect = vi.fn();
    render(<USStateMap states={states} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^Washington/ }));
    fireEvent.keyDown(screen.getByRole('button', { name: /^North Dakota/ }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: /^South Dakota/ }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: /^California/ }), { key: 'a' });
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['WA', 'ND', 'SD']);
  });

  it('shows the measures, headline and official figures on hover or focus, and names the state in a live caption', () => {
    const { container } = render(<USStateMap states={states} />);
    const caption = container.querySelector('figcaption')!;
    expect(caption).toHaveAttribute('aria-live', 'polite');
    expect(caption).toHaveTextContent('');
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Colorado/ }), { clientX: 10, clientY: 10 });
    const tip = screen.getByTestId('map-tooltip');
    expect(tip).toHaveTextContent('Amendment 87');
    expect(tip).toHaveTextContent('Proposition NN');
    expect(tip).toHaveTextContent('Headline: $1M · Official: $2M');
    expect(caption).toHaveTextContent('Colorado: Amendment 87 and Proposition NN');
    fireEvent.mouseLeave(screen.getByRole('button', { name: /^Colorado/ }));
    expect(screen.queryByTestId('map-tooltip')).toBeNull();
    fireEvent.focus(screen.getByRole('button', { name: /^California/ }));
    expect(screen.getByTestId('map-tooltip')).toHaveTextContent('California');
  });
});
