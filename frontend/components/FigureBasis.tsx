'use client';

/**
 * Labels for what a figure is based on (lib/figureBasis.ts): a neutral pill
 * ("Model estimate", "Calibrated", "Forecast input", "Adjusted"), a one-line
 * note under a figure, and a link to the methodology tab's table of bases.
 */

import { buildHashString, parseHashParams } from '@/lib/embedding';
import { BASIS_LABELS, FIGURE_BASIS_ID, type FigureBasis } from '@/lib/figureBasis';

/** Neutral gray-outline pill; "Model estimate" is the quietest. */
export function BasisBadge({ basis }: { basis: FigureBasis }) {
  return (
    <span
      data-basis={basis}
      className={`inline-flex items-center whitespace-nowrap rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium leading-4 ${
        basis === 'model' ? 'border-gray-200 text-gray-500' : 'border-gray-400 text-gray-700'
      }`}
    >
      {BASIS_LABELS[basis]}
    </span>
  );
}

/**
 * "See methodology →": opens the methodology tab (keeping the year and
 * household in the hash) and scrolls to its table of figure bases.
 */
export function MethodologyLink({ children = 'See methodology' }: { children?: React.ReactNode }) {
  const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const params = parseHashParams(window.location.hash);
    // A hashchange the dashboard listens for switches the tab.
    window.location.hash = buildHashString({ ...params, tab: 'methodology', measure: undefined });
    window.setTimeout(() => {
      document.getElementById(FIGURE_BASIS_ID)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 60);
  };
  return (
    <a
      href="#tab=methodology"
      onClick={open}
      className="whitespace-nowrap text-primary-700 underline underline-offset-2 hover:text-primary-800"
    >
      {children}
      <span aria-hidden="true"> →</span>
    </a>
  );
}

/** One line under a figure or chart: the badge, the note and, optionally, the methodology link. */
export function BasisNote({
  basis,
  children,
  link = true,
  className = '',
}: {
  basis?: FigureBasis;
  children: React.ReactNode;
  link?: boolean;
  className?: string;
}) {
  return (
    <p className={`text-xs leading-5 text-gray-500 ${className}`} data-testid="basis-note">
      {basis && (
        <>
          <BasisBadge basis={basis} />{' '}
        </>
      )}
      {children}
      {link && (
        <>
          {' '}
          <MethodologyLink />
        </>
      )}
    </p>
  );
}
