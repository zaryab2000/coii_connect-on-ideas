import type { Circle, Point } from "@/sim/geometry";
import { distance } from "@/sim/geometry";

export type LayoutMode = "landscape" | "portrait";

/** Booth stall art fits inside this circle (world units); beans are kept outside it. */
export const BOOTH_OBSTACLE_R = 150;
/** The chai stall in the plaza. */
export const PLAZA_OBSTACLE_R = 78;
/** Average floor area one standing bean needs. */
export const SPOT_SPACING = 26;

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

function placeRing(radii: readonly number[], a: number, b: number): Placed[] | null {
  const table = ellipseArcTable(a, b, 2048);
  const perimeter = table[table.length - 1] ?? 0;
  const count = radii.length;
  const spacings: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    spacings.push((radii[i] ?? 0) + (radii[i + 1] ?? 0) + MARGIN);
  }
  const gap = (radii[count - 1] ?? 0) + (radii[0] ?? 0) + GATE_GAP;
  const required = spacings.reduce((sum, s) => sum + s, 0) + gap;
  if (perimeter < required) return null;
  const extra = (perimeter - required) / count;
  const bottomArc = table[512] ?? 0;
  let arc = bottomArc + (gap + extra) / 2;
  const placed: Placed[] = [];
  for (let i = 0; i < count; i++) {
    const theta = thetaAtArc(table, arc);
    placed.push({ x: a * Math.cos(theta), y: b * Math.sin(theta), r: radii[i] ?? 0 });
    arc += (spacings[i] ?? 0) + extra;
  }
  return placed;
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

function portraitBooths(radii: readonly number[], plazaR: number): { booths: Placed[]; plaza: Placed } {
  const d = Math.max(...radii) + STREET_HALF;
  const left = [0, 2, 4, 6, 8];
  const right = [1, 3, 5, 7, 9];
  const r = (i: number): number => radii[i] ?? 0;
  const rowY: number[] = [0];
  let plazaY = 0;
  for (let row = 1; row < 5; row++) {
    const prevY = rowY[row - 1] ?? 0;
    const sameSide = Math.max(
      r(left[row - 1] ?? 0) + r(left[row] ?? 0),
      r(right[row - 1] ?? 0) + r(right[row] ?? 0),
    );
    let y = prevY + sameSide + MARGIN;
    if (row === 2) {
      const reach = (rr: number): number => Math.sqrt(Math.max(0, (rr + plazaR + MARGIN) ** 2 - d * d));
      const above = Math.max(reach(r(left[1] ?? 0)), reach(r(right[1] ?? 0)));
      const below = Math.max(reach(r(left[2] ?? 0)), reach(r(right[2] ?? 0)));
      plazaY = prevY + Math.max(above, plazaR + MARGIN);
      y = Math.max(y, plazaY + Math.max(below, plazaR + MARGIN));
    }
    rowY.push(y);
  }
  const booths: Placed[] = Array.from({ length: radii.length });
  for (let row = 0; row < 5; row++) {
    const li = left[row] ?? 0;
    const ri = right[row] ?? 0;
    booths[li] = { x: -d, y: rowY[row] ?? 0, r: r(li) };
    booths[ri] = { x: d, y: rowY[row] ?? 0, r: r(ri) };
  }
  return { booths, plaza: { x: 0, y: plazaY, r: plazaR } };
}

/**
 * Lays out 10 booth zones plus the central chai plaza. Landscape rings booths around the plaza;
 * portrait lines them along a market street ("gully") with the plaza mid-street.
 */
export function computeLayout(mode: LayoutMode, capacities: readonly number[], plazaCapacity: number): VenueLayout {
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
