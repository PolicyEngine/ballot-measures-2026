import { describe, it, expect } from 'vitest';
import { poleOfInaccessibility, ringArea, type Point } from '../lib/polylabel';

describe('poleOfInaccessibility', () => {
  it('finds the center of a square', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const [x, y] = poleOfInaccessibility(square, 0.01);
    expect(x).toBeCloseTo(5, 1);
    expect(y).toBeCloseTo(5, 1);
  });

  it('stays inside an L shape, where the vertex average would not', () => {
    // An L: a tall bar on the left and a long foot along the bottom.
    const ell: Point[] = [[0, 0], [100, 0], [100, 20], [20, 20], [20, 100], [0, 100]];
    const [x, y] = poleOfInaccessibility(ell, 0.1);
    const inside = (x >= 0 && x <= 20 && y >= 0 && y <= 100) || (x >= 0 && x <= 100 && y >= 0 && y <= 20);
    expect(inside).toBe(true);
    // At least 9 units from every edge (the bars are 20 wide).
    expect(Math.min(x, y)).toBeGreaterThan(9);
  });

  it('compares ring sizes by area', () => {
    expect(Math.abs(ringArea([[0, 0], [10, 0], [10, 10], [0, 10]]))).toBe(100);
  });
});
