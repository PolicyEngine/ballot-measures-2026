/**
 * Copy for every measure page, keyed by slug. MEASURE_SLUGS drives the
 * static routes (app/(shell)/[measure]/page.tsx) and must match
 * measures.json; __tests__/measures.test.ts checks that it does.
 */

import caProp3 from './ca-prop-3';
import coAmendment87 from './co-amendment-87';
import coPropNn from './co-prop-nn';
import ndMeasure2 from './nd-measure-2';
import sdAmendmentI from './sd-amendment-i';
import waI645 from './wa-i-645';
import type { MeasureContent } from './types';

export type {
  BallotText,
  Comparison,
  ComparisonRow,
  ContentSection,
  MeasureContent,
  Reference,
  SimpleTable,
  VoteRequirement,
} from './types';

/** Registry order (ballot_calc/measures.py). */
export const MEASURE_SLUGS = [
  'co-amendment-87',
  'co-prop-nn',
  'ca-prop-3',
  'wa-i-645',
  'nd-measure-2',
  'sd-amendment-i',
] as const;

export type MeasureSlug = (typeof MEASURE_SLUGS)[number];

export const MEASURE_CONTENT: Readonly<Record<string, MeasureContent>> = {
  'co-amendment-87': coAmendment87,
  'co-prop-nn': coPropNn,
  'ca-prop-3': caProp3,
  'wa-i-645': waI645,
  'nd-measure-2': ndMeasure2,
  'sd-amendment-i': sdAmendmentI,
};

export function getContent(slug: string): MeasureContent {
  const content = MEASURE_CONTENT[slug];
  if (!content) throw new Error(`No content for measure: ${slug}`);
  return content;
}
