import type { Circle, Point } from "@/sim/geometry";
import { distance } from "@/sim/geometry";

export type LayoutMode = "landscape" | "portrait";

/** Booth stall art fits inside this circle (world units); beans are kept outside it. */
export const BOOTH_OBSTACLE_R = 160;
/** The chai stall in the plaza. */
export const PLAZA_OBSTACLE_R = 78;
/** Average floor area one standing bean needs. */
export const SPOT_SPACING = 28;

const ZONE_INSET = 16;
const MARGIN = 70;
const GATE_GAP = 340;
const STREET_HALF = 95;
const WORLD_PAD = 140;

export interface Zone {
  readonly kind: "booth" | "plaza";
  /** Topic index for booths, -1 for the plaza. */
  readonly topic: number;
  readonly x: number;
  readonly y: number;
  readonly r0: number;
  readonly r1: number;
  readonly obstacle: Circle;
}

export interface VenueLayout {
  readonly mode: LayoutMode;
  readonly width: number;
  readonly height: number;
  /** Booth zones first (indexed by topic), the plaza last. */
  readonly zones: readonly Zone[];
  readonly plazaIndex: number;
  readonly gate: Point;
}

export function zoneOuterRadius(r0: number, capacity: number): number {
  return Math.sqrt(r0 * r0 + (capacity * SPOT_SPACING * SPOT_SPACING) / Math.PI);
}

export function modeForAspect(aspect: number): LayoutMode {
  return aspect < 0.9 ? "portrait" : "landscape";
}

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

function zonesAreClear(booths: readonly Placed[], plaza: Placed): boolean {
  const all = [...booths, plaza];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i] as Placed;
      const b = all[j] as Placed;
      if (distance(a.x, a.y, b.x, b.y) < a.r + b.r + MARGIN * 0.8) return false;
    }
  }
  return true;
}

function ellipseArcTable(a: number, b: number, samples: number): Float64Array {
  const table = new Float64Array(samples + 1);
  let prevX = a;
  let prevY = 0;
  for (let i = 1; i <= samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const x = a * Math.cos(theta);
    const y = b * Math.sin(theta);
    table[i] = (table[i - 1] ?? 0) + Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return table;
}

function thetaAtArc(table: Float64Array, arc: number): number {
  const total = table[table.length - 1] ?? 1;
  const target = ((arc % total) + total) % total;
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((table[mid] ?? 0) < target) lo = mid;
    else hi = mid;
  }
  const a0 = table[lo] ?? 0;
  const a1 = table[hi] ?? a0;
  const frac = a1 === a0 ? 0 : (target - a0) / (a1 - a0);
  return ((lo + frac) / (table.length - 1)) * Math.PI * 2;
}

function num(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

/** Arc distance between neighbouring booth centres, plus the wider gap left for the gate. */
function ringSpacing(radii: readonly number[]): { spacings: number[]; gap: number } {
  const count = radii.length;
  const spacings: number[] = [];
  for (let i = 0; i < count - 1; i++) spacings.push(num(radii, i) + num(radii, i + 1) + MARGIN);
  return { spacings, gap: num(radii, count - 1) + num(radii, 0) + GATE_GAP };
}

function placeRing(radii: readonly number[], a: number, b: number): Placed[] | null {
  const table = ellipseArcTable(a, b, 2048);
  const perimeter = table[table.length - 1] ?? 0;
  const { spacings, gap } = ringSpacing(radii);
  const required = spacings.reduce((sum, s) => sum + s, 0) + gap;
  if (perimeter < required) return null;
  const extra = (perimeter - required) / radii.length;
  // Index 512 of 2048 samples is theta = PI/2: the bottom of the ellipse, where the gate goes.
  let arc = (table[512] ?? 0) + (gap + extra) / 2;
  return radii.map((r, i) => {
    const theta = thetaAtArc(table, arc);
    arc += num(spacings, i) + extra;
    return { x: a * Math.cos(theta), y: b * Math.sin(theta), r };
  });
}

function landscapeBooths(radii: readonly number[], plaza: Placed): Placed[] {
  const aspect = 1.55;
  let b = plaza.r + Math.max(...radii) + MARGIN;
  for (let attempt = 0; attempt < 120; attempt++) {
    const placed = placeRing(radii, b * aspect, b);
    if (placed && zonesAreClear(placed, plaza)) return placed;
    b *= 1.04;
  }
  throw new Error("Could not fit booths on the landscape ring after 120 attempts");
}

const LEFT_COLUMN = [0, 2, 4, 6, 8];
const RIGHT_COLUMN = [1, 3, 5, 7, 9];

/** Vertical position of each street row, leaving room for the plaza between rows 1 and 2. */
function streetRows(
  radii: readonly number[],
  d: number,
  plazaR: number,
): { rowY: number[]; plazaY: number } {
  const r = (column: readonly number[], row: number): number => num(radii, num(column, row));
  const reach = (rr: number): number => Math.sqrt(Math.max(0, (rr + plazaR + MARGIN) ** 2 - d * d));
  const rowY: number[] = [0];
  let plazaY = 0;
  for (let row = 1; row < 5; row++) {
    const prevY = num(rowY, row - 1);
    const sameSide = Math.max(
      r(LEFT_COLUMN, row - 1) + r(LEFT_COLUMN, row),
      r(RIGHT_COLUMN, row - 1) + r(RIGHT_COLUMN, row),
    );
    let y = prevY + sameSide + MARGIN;
    if (row === 2) {
      const above = Math.max(reach(r(LEFT_COLUMN, 1)), reach(r(RIGHT_COLUMN, 1)), plazaR + MARGIN);
      const below = Math.max(reach(r(LEFT_COLUMN, 2)), reach(r(RIGHT_COLUMN, 2)), plazaR + MARGIN);
      plazaY = prevY + above;
      y = Math.max(y, plazaY + below);
    }
    rowY.push(y);
  }
  return { rowY, plazaY };
}

function portraitBooths(
  radii: readonly number[],
  plazaR: number,
): { booths: Placed[]; plaza: Placed } {
  const d = Math.max(...radii) + STREET_HALF;
  const { rowY, plazaY } = streetRows(radii, d, plazaR);
  const booths: Placed[] = Array.from({ length: radii.length });
  for (let row = 0; row < 5; row++) {
    const li = num(LEFT_COLUMN, row);
    const ri = num(RIGHT_COLUMN, row);
    booths[li] = { x: -d, y: num(rowY, row), r: num(radii, li) };
    booths[ri] = { x: d, y: num(rowY, row), r: num(radii, ri) };
  }
  return { booths, plaza: { x: 0, y: plazaY, r: plazaR } };
}

/**
 * Lays out 10 booth zones plus the central chai plaza. Landscape rings booths around the plaza;
 * portrait lines them along a market street ("gully") with the plaza mid-street.
 */
export function computeLayout(
  mode: LayoutMode,
  capacities: readonly number[],
  plazaCapacity: number,
): VenueLayout {
  const boothR0 = BOOTH_OBSTACLE_R + ZONE_INSET;
  const plazaR0 = PLAZA_OBSTACLE_R + ZONE_INSET;
  const radii = capacities.map((cap) => zoneOuterRadius(boothR0, cap));
  const plazaR = zoneOuterRadius(plazaR0, plazaCapacity);

  let booths: Placed[];
  let plaza: Placed;
  if (mode === "landscape") {
    plaza = { x: 0, y: 0, r: plazaR };
    booths = landscapeBooths(radii, plaza);
  } else {
    ({ booths, plaza } = portraitBooths(radii, plazaR));
  }

  const maxBoothY = Math.max(...booths.map((z) => z.y + z.r));
  const gateLocal = { x: 0, y: maxBoothY + 150 };
  const minX = Math.min(...booths.map((z) => z.x - z.r), plaza.x - plaza.r) - WORLD_PAD;
  const maxX = Math.max(...booths.map((z) => z.x + z.r), plaza.x + plaza.r) + WORLD_PAD;
  const minY = Math.min(...booths.map((z) => z.y - z.r), plaza.y - plaza.r) - WORLD_PAD;
  const maxY = gateLocal.y + WORLD_PAD;

  const zones: Zone[] = booths.map((z, topic) => ({
    kind: "booth",
    topic,
    x: z.x - minX,
    y: z.y - minY,
    r0: boothR0,
    r1: z.r,
    obstacle: { x: z.x - minX, y: z.y - minY, r: BOOTH_OBSTACLE_R },
  }));
  zones.push({
    kind: "plaza",
    topic: -1,
    x: plaza.x - minX,
    y: plaza.y - minY,
    r0: plazaR0,
    r1: plaza.r,
    obstacle: { x: plaza.x - minX, y: plaza.y - minY, r: PLAZA_OBSTACLE_R },
  });

  return {
    mode,
    width: maxX - minX,
    height: maxY - minY,
    zones,
    plazaIndex: zones.length - 1,
    gate: { x: gateLocal.x - minX, y: gateLocal.y - minY },
  };
}
