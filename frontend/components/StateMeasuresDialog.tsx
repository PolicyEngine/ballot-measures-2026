'use client';

import { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import type { LandingState } from '@/lib/landing';

/** Beside the state on wider screens (offsets within the map); a centered sheet on phones. */
export type DialogPlacement = { kind: 'anchored'; x: number; y: number } | { kind: 'sheet' };

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  state: LandingState;
  placement: DialogPlacement;
  onClose: () => void;
}

/**
 * A state's measures: designation, short title, policy overview and a link
 * for each, so a state with several (Colorado, California) can be compared
 * before choosing one. Focus moves into the dialog and stays there until it
 * closes (close button, Escape or a click outside).
 */
export default function StateMeasuresDialog({ state, placement, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    panelRef.current?.focus();
  }, [state.code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [onClose]);

  // Keep Tab and Shift+Tab inside the dialog.
  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={trapFocus}
      data-testid="state-dialog"
      className={`rounded-xl border border-gray-200 bg-white p-5 shadow-xl focus:outline-none ${
        placement.kind === 'sheet'
          ? 'w-full max-w-md max-h-[85vh] overflow-y-auto'
          : 'absolute z-40 w-[22rem] max-w-[calc(100%-1rem)]'
      }`}
      style={placement.kind === 'anchored' ? { left: placement.x, top: placement.y } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-lg font-bold text-gray-900">
          {state.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ul className="mt-3 divide-y divide-gray-100">
        {state.measures.map((m) => (
          <li key={m.slug} className="py-3 first:pt-0 last:pb-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.designation}</p>
            <p className="mt-0.5 font-semibold text-gray-900">{m.shortTitle}</p>
            <p className="mt-1 text-sm text-gray-600">{m.overview}</p>
            <Link
              href={`/${m.slug}`}
              className="mt-2 inline-block text-sm font-semibold text-primary-700 hover:underline"
            >
              {m.linkLabel}
              <span className="sr-only">
                {' '}
                for {state.name} {m.designation}
              </span>{' '}
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  if (placement.kind === 'anchored') return panel;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">{panel}</div>;
}
