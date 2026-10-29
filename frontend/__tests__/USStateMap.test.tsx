import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import USStateMap from '../components/USStateMap';
import { getContent } from '../content/measures';
import { CA_PROP_40 } from '../content/linkedTools';
import { landingStates } from '../lib/landing';

const states = landingStates();
const stateButton = (name: RegExp) => screen.getByRole('button', { name });

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

describe('USStateMap', () => {
  it('draws every state and makes only the five with measures interactive', () => {
    const { container } = render(<USStateMap states={states} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-state')).sort()).toEqual(['CA', 'CO', 'ND', 'SD', 'WA']);
    // The other states are drawn but hidden from assistive technology.
    expect(container.querySelectorAll('path[aria-hidden="true"]').length).toBeGreaterThanOrEqual(46);
    expect(screen.getByRole('button', { name: 'Colorado: Amendment 87 and Proposition NN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'California: Proposition 3 and Proposition 40' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.getByRole('group', { name: /Map of US states/ })).toBeInTheDocument();
  });

  it('names the state and its measures on hover or focus, without overviews or scores', () => {
    const { container } = render(<USStateMap states={states} />);
    const caption = container.querySelector('figcaption')!;
    expect(caption).toHaveAttribute('aria-live', 'polite');
    expect(caption).toHaveTextContent('');
    fireEvent.mouseEnter(stateButton(/^Colorado/), { clientX: 10, clientY: 10 });
    const tip = screen.getByTestId('map-tooltip');
    expect(tip).toHaveTextContent('Amendment 87: Graduated income tax');
    expect(tip).toHaveTextContent('Proposition NN: Raise the state revenue limit and keep the surplus');
    expect(tip).not.toHaveTextContent(getContent('co-amendment-87').description);
    expect(tip).not.toHaveTextContent(/Official/);
    expect(caption).toHaveTextContent('Colorado: Amendment 87 and Proposition NN');
    fireEvent.mouseLeave(stateButton(/^Colorado/));
    expect(screen.queryByTestId('map-tooltip')).toBeNull();
    fireEvent.focus(stateButton(/^California/));
    expect(screen.getByTestId('map-tooltip')).toHaveTextContent('Proposition 40: One-time tax on billionaires’ wealth');
  });

  it('opens a dialog with every measure in the state on click', () => {
    const onSelect = vi.fn();
    render(<USStateMap states={states} onSelect={onSelect} />);
    fireEvent.click(stateButton(/^Colorado/));
    expect(onSelect).toHaveBeenCalledWith('CO');
    const dialog = screen.getByRole('dialog', { name: 'Colorado' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
    expect(stateButton(/^Colorado/)).toHaveAttribute('aria-expanded', 'true');
    // Both measures, each with its designation, short title, overview and link, and no scores.
    for (const slug of ['co-amendment-87', 'co-prop-nn']) {
      expect(dialog).toHaveTextContent(getContent(slug).description);
    }
    expect(within(dialog).getByRole('link', { name: 'View analysis for Colorado Amendment 87' })).toHaveAttribute(
      'href',
      '/co-amendment-87',
    );
    expect(within(dialog).getByRole('link', { name: 'View analysis for Colorado Proposition NN' })).toHaveAttribute(
      'href',
      '/co-prop-nn',
    );
    expect(dialog).not.toHaveTextContent(/Official|PolicyEngine:/);
    // The hover tooltip stays away while the dialog is open.
    fireEvent.mouseEnter(stateButton(/^Washington/), { clientX: 10, clientY: 10 });
    expect(screen.queryByTestId('map-tooltip')).toBeNull();
  });

  it('lists California’s two measures, with the calculator link for Proposition 40', () => {
    render(<USStateMap states={states} />);
    fireEvent.keyDown(stateButton(/^California/), { key: 'Enter' });
    const dialog = screen.getByRole('dialog', { name: 'California' });
    expect(within(dialog).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual([
      'Proposition 3',
      'Proposition 40',
    ]);
    expect(dialog).toHaveTextContent(CA_PROP_40.overview);
    expect(within(dialog).getByRole('link', { name: 'Open the calculator for California Proposition 40' })).toHaveAttribute(
      'href',
      '/ca-prop-40',
    );
  });

  it('opens with Enter or Space and closes with Escape, returning focus to the state', () => {
    render(<USStateMap states={states} />);
    fireEvent.keyDown(stateButton(/^California/), { key: 'a' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const nd = stateButton(/^North Dakota/);
    fireEvent.keyDown(nd, { key: ' ' });
    expect(screen.getByRole('dialog', { name: 'North Dakota' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(nd).toHaveFocus();
    // Focus returning to the state shows no tooltip.
    expect(screen.queryByTestId('map-tooltip')).toBeNull();
  });

  it('closes with its close button or a click outside, and keeps Tab inside', () => {
    render(<USStateMap states={states} />);
    const wa = stateButton(/^Washington/);
    fireEvent.click(wa);
    const dialog = screen.getByRole('dialog', { name: 'Washington' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const link = within(dialog).getByRole('link', { name: 'View analysis for Washington Initiative 645' });
    link.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(link).toHaveFocus();
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(wa).toHaveFocus();

    fireEvent.click(wa);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // A press inside the dialog keeps it open; one outside closes it.
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('anchors the dialog beside the state on wide screens and centers a sheet on phones', () => {
    const { unmount } = render(<USStateMap states={states} />);
    fireEvent.click(stateButton(/^Colorado/));
    expect(screen.getByRole('dialog')).toHaveClass('absolute');
    unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    render(<USStateMap states={states} />);
    fireEvent.click(stateButton(/^Colorado/));
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveClass('absolute');
    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0');
    // Tapping the backdrop closes the sheet.
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
