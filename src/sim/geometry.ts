export interface Point {
  x: number;
  y: number;
}

export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** True when the segment from A to B passes within `circle.r` of the circle centre. */
export function segmentHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circle: Circle,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : ((circle.x - ax) * dx + (circle.y - ay) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  const px = ax + dx * clamped;
  const py = ay + dy * clamped;
  return distance(px, py, circle.x, circle.y) < circle.r;
}

/**
 * Evenly spread points in the ring between `r0` and `r1` using the golden angle, so a crowd
 * standing on them looks naturally distributed without needing separation forces.
 */
export function sunflowerSpots(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  count: number,
): Float32Array {
  const spots = new Float32Array(count * 2);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const inner = r0 * r0;
  const span = r1 * r1 - inner;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(inner + (span * (i + 0.5)) / count);
    const angle = i * golden;
    spots[i * 2] = cx + Math.cos(angle) * r;
    spots[i * 2 + 1] = cy + Math.sin(angle) * r;
  }
  return spots;
}
