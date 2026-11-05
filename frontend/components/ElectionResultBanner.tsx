import type { ElectionResult } from '@/content/measures';
import { formatLongDate } from '@/lib/format';

/** The landing popup's tag for each outcome. */
export const OUTCOME_TAGS: Record<ElectionResult['outcome'], string> = {
  approved: 'Approved',
  rejected: 'Rejected',
};

/** What the result means for a measure page's figures, unless the content gives its own note. */
export const MEASURE_NOTES: Record<ElectionResult['outcome'], string> = {
  approved:
    'The estimates below show its effects compared with the law before the vote, which this page calls current law.',
  rejected: 'The estimates below show what it would have done.',
};

/** The same for a page that embeds a separate calculator. */
export const CALCULATOR_NOTES: Record<ElectionResult['outcome'], string> = {
  approved: 'The calculator below estimates its effects.',
  rejected: 'The calculator below estimates what it would have done.',
};

/** "Voters approved this measure on November 3, 2026." */
export const resultSentence = (result: ElectionResult): string =>
  `Voters ${result.outcome} this measure on ${formatLongDate(result.date)}.`;

interface Props {
  result: ElectionResult;
  /** Default notes by outcome; the result's analysisNote overrides them. */
  notes?: Record<ElectionResult['outcome'], string>;
  className?: string;
}

/**
 * The result of the vote under a measure's title: plain text in the same
 * neutral box for either outcome, so it reads without color.
 */
export default function ElectionResultBanner({ result, notes = MEASURE_NOTES, className = '' }: Props) {
  return (
    <p
      data-testid="election-result"
      className={`rounded-lg border border-gray-200 border-l-4 border-l-primary-500 bg-gray-50 px-4 py-3 text-sm text-gray-700 ${className}`}
    >
      <strong className="font-semibold text-gray-900">{resultSentence(result)}</strong>{' '}
      {result.analysisNote ?? notes[result.outcome]}
    </p>
  );
}
