import { describe, it, expect } from 'vitest';
import {
  formatCompactUSD,
  formatCount,
  formatIncomeTick,
  formatLongDate,
  formatPercentagePoints,
  formatShare,
  formatUSD,
  formatUSDRange,
  formatUSDWithSign,
} from '../lib/format';

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

describe('compact and percent formatters', () => {
  it('formats aggregates compactly with an optional sign', () => {
    expect(formatCompactUSD(1_972_000_000, { precise: true })).toBe('$1.97B');
    expect(formatCompactUSD(-3_108_000_000, { precise: true })).toBe('-$3.11B');
    expect(formatCompactUSD(259_800_000, { sign: true })).toBe('+$259.8M');
    expect(formatCompactUSD(0.2, { sign: true })).toBe('$0');
  });

  it('formats ranges, shares, points and counts', () => {
    expect(formatUSDRange(5e9, 15e9)).toBe('$5B to $15B');
    expect(formatUSDRange(124_300_000, 124_300_000)).toBe('$124.3M');
    expect(formatShare(0.1234)).toBe('12.3%');
    expect(formatShare(-0.0001, 2, { sign: true })).toBe('-0.01%');
    expect(formatPercentagePoints(-0.04)).toBe('0.0 pp');
    expect(formatCount(29_055.4)).toBe('29,055');
    expect(formatIncomeTick(1_500_000)).toBe('$1.5M');
    expect(formatIncomeTick(5_000_000)).toBe('$5M');
    expect(formatIncomeTick(45_000)).toBe('$45k');
  });

  it('labels income ticks below $10k to a tenth of a thousand, and puts a minus before the dollar sign', () => {
    // School meals gridlines every $500: "$1.5k", not a second "$2k"
    expect([0, 500, 1_000, 1_500, 2_000, 2_500].map(formatIncomeTick)).toEqual([
      '$0', '$500', '$1k', '$1.5k', '$2k', '$2.5k',
    ]);
    expect(formatIncomeTick(10_000)).toBe('$10k');
    expect(formatIncomeTick(-400_000)).toBe('-$400k');
    expect(formatIncomeTick(-2_000_000)).toBe('-$2M');
    expect(formatIncomeTick(-1_500)).toBe('-$1.5k');
  });

  it('writes election dates without time-zone drift', () => {
    expect(formatLongDate('2026-11-03')).toBe('November 3, 2026');
  });
});
