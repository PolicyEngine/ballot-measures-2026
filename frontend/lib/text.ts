/** Small text helpers for sentence-case copy. */

/** Words that keep their capital letter mid-sentence. */
const PROPER_NOUNS = new Set([
  'Medicaid',
  'TABOR',
  'Colorado',
  'California',
  'Washington',
  'North',
  'South',
  'Initiative',
  'Proposition',
  'Amendment',
]);

/**
 * Lowercase the first letter for use mid-sentence or after a colon
 * ("Graduated income tax" -> "graduated income tax"), unless the first
 * word is a proper noun or an acronym ("Medicaid expansion ..." stays).
 */
export function lowerFirst(text: string): string {
  const first = text.split(/\s+/, 1)[0] ?? '';
  if (!first || PROPER_NOUNS.has(first.replace(/[^A-Za-z]/g, ''))) return text;
  const letters = first.replace(/[^A-Za-z]/g, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "Tax year 2027" / "Tax years 2028 and 2029" */
export const yearsLabel = (years: number[]): string =>
  years.length === 1
    ? `Tax year ${years[0]}`
    : `Tax years ${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;
