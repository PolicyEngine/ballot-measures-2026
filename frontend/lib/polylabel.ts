/**
 * Pole of inaccessibility: the interior point farthest from a polygon's
 * edges, a good spot for a label. A small port of Mapbox's polylabel
 * (ISC license, https://github.com/mapbox/polylabel) for one ring in
 * screen coordinates.
 */

export type Point = [number, number];

interface Cell {
  x: number;
  y: number;
  /** Half the cell size. */
  h: number;
  /** Signed distance from the cell center to the ring (positive inside). */
  d: number;
  /** Largest distance any point in the cell could reach. */
  max: number;
}

function segmentDistanceSq(px: number, py: number, a: Point, b: Point): number {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      [x, y] = b;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

function pointToRingDistance(x: number, y: number, ring: Point[]): number {
  let inside = false;
  let minDistSq = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
    minDistSq = Math.min(minDistSq, segmentDistanceSq(x, y, a, b));
  }
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function makeCell(x: number, y: number, h: number, ring: Point[]): Cell {
  const d = pointToRingDistance(x, y, ring);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/** Area-weighted centroid of a ring (falls back to the first point). */
function centroidCell(ring: Point[]): Cell {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area === 0) return makeCell(ring[0][0], ring[0][1], 0, ring);
  return makeCell(x / area, y / area, 0, ring);
}

/** Signed area (shoelace); its absolute value compares ring sizes. */
export function ringArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

export function poleOfInaccessibility(ring: Point[], precision = 0.5): Point {
  if (ring.length === 0) return [0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize === 0) return [minX, minY];

  const queue: Cell[] = [];
  const h = cellSize / 2;
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, ring));
    }
  }

  let best = centroidCell(ring);
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, ring);
  if (bboxCell.d > best.d) best = bboxCell;

  while (queue.length) {
    // Take the most promising cell.
    let top = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[top].max) top = i;
    const cell = queue.splice(top, 1)[0];
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const ch = cell.h / 2;
    queue.push(
      makeCell(cell.x - ch, cell.y - ch, ch, ring),
      makeCell(cell.x + ch, cell.y - ch, ch, ring),
      makeCell(cell.x - ch, cell.y + ch, ch, ring),
      makeCell(cell.x + ch, cell.y + ch, ch, ring),
    );
  }
  return [best.x, best.y];
}
