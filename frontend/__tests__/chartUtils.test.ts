import { describe, expect, it } from 'vitest';
import { niceDomain } from '../components/chartUtils';

describe('niceDomain', () => {
  it('keeps one side of zero when every value shares a sign', () => {
    expect(niceDomain([120, 480]).domain).toEqual([0, 500]);
    expect(niceDomain([-120, -480]).domain).toEqual([-500, 0]);
  });

  it('reaches each side only as far as its own values', () => {
    // A household chart whose net income starts at -$1: one step below zero, not -$2M
    const { domain, ticks } = niceDomain([-1, 250_000, 2_000_000]);
    expect(domain[1]).toBe(2_000_000);
    expect(domain[0]).toBeGreaterThanOrEqual(-1_000_000);
    expect(domain[0]).toBeLessThan(0);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
    expect(ticks).toContain(0);
    // South Dakota's budget chart: -$294M and +$15.6M, not +/-$300M
    expect(niceDomain([-294e6, 15.6e6]).domain).toEqual([-300e6, 100e6]);
  });

  it('gives an all-zero series one step either side, as before', () => {
    expect(niceDomain([0, 0]).domain).toEqual([-0.2, 0.2]);
  });
});
