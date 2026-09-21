import { describe, it, expect } from 'vitest';
import { formatUSD, formatUSDWithSign } from '../lib/format';

describe('formatUSD', () => {
  it('places the minus sign before the dollar sign for negatives', () => {
    // The bug this guards against: "$-1,593".
    expect(formatUSD(-1593)).toBe('-$1,593');
    expect(formatUSD(-1593)).not.toContain('$-');
  });

  it('formats positive and zero values as whole dollars', () => {
    expect(formatUSD(1593)).toBe('$1,593');
    expect(formatUSD(0)).toBe('$0');
    expect(formatUSD(1234567.4)).toBe('$1,234,567');
  });

  it('normalizes tiny negatives to $0 instead of -$0', () => {
    expect(formatUSD(-0.4)).toBe('$0');
  });
});

describe('formatUSDWithSign', () => {
  it('adds an explicit plus on gains and keeps -$ on losses', () => {
    expect(formatUSDWithSign(1593)).toBe('+$1,593');
    expect(formatUSDWithSign(-1593)).toBe('-$1,593');
    expect(formatUSDWithSign(0)).toBe('$0');
  });
});
