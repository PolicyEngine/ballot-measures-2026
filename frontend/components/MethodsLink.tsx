'use client';

import { buildHashString, parseHashParams } from '@/lib/embedding';
import { FIGURE_BASIS_ID } from '@/lib/figureBasis';

/**
 * Opens the Methods tab (keeping the year and household in the hash) and
 * scrolls to its "How these figures are produced" table.
 */
export function MethodsLink({ children = 'See methodology' }: { children?: React.ReactNode }) {
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const params = parseHashParams(window.location.hash);
    // A hashchange the dashboard listens for switches the tab.
    window.location.hash = buildHashString({ ...params, tab: 'validation', measure: undefined });
    window.setTimeout(() => {
      document.getElementById(FIGURE_BASIS_ID)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 60);
  };
  return (
    <a href="#tab=validation" onClick={open} className="text-primary-700 underline underline-offset-2 hover:text-primary-800">
      {children}
      <span aria-hidden="true"> →</span>
    </a>
  );
}
