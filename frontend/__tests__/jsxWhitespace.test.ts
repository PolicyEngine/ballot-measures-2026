import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The production build drops the leading space of a JSX text node that
 * contains an HTML entity: `<strong>Top incomes.</strong> It&apos;s` renders
 * "Top incomes.It's". Tests render through Vite, which keeps the space, so
 * this check reads the source instead. Write such a space as {' '}.
 */
const FRONTEND = path.join(__dirname, '..');
const ROOTS = ['app', 'components'];
// A closing tag or expression, then a text node that starts with a space on
// the same line and contains an entity somewhere before the next tag or
// expression.
const SPACE_THEN_ENTITY = /(?:>|\})( [^<>{}]*?&(?:[a-zA-Z]+|#\d+);[^<>{}]*?)(?=<|\{)/g;

const matches = (source: string): RegExpExecArray[] => {
  const found: RegExpExecArray[] = [];
  const re = new RegExp(SPACE_THEN_ENTITY.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) found.push(m);
  return found;
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('JSX text', () => {
  it('writes a leading space explicitly when the text contains an entity', () => {
    const offenders = ROOTS.flatMap((root) => tsxFiles(path.join(FRONTEND, root))).flatMap((file) => {
      const source = readFileSync(file, 'utf-8');
      return matches(source).map((m) => {
        const line = source.slice(0, m.index).split('\n').length;
        return `${path.relative(FRONTEND, file)}:${line} ${m[1].trim().slice(0, 60)}`;
      });
    });
    expect(offenders).toEqual([]);
  });

  it('finds the pattern it guards against', () => {
    expect(matches('<p><strong>Top incomes.</strong> Changes drive this measure&apos;s revenue.</p>')).toHaveLength(1);
    expect(matches("<strong>Top incomes.</strong>{' '}\n  Changes drive this measure&apos;s revenue.")).toHaveLength(0);
  });
});
