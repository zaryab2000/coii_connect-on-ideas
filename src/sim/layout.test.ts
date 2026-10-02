import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { distance, sunflowerSpots } from "@/sim/geometry";
import { computeLayout, modeForAspect } from "@/sim/layout";
import type { VenueLayout } from "@/sim/layout";

function assertValid(layout: VenueLayout): void {
  expect(layout.zones).toHaveLength(11);
  for (let i = 0; i < layout.zones.length; i++) {
    const a = layout.zones[i]!;
    expect(a.x - a.r1).toBeGreaterThanOrEqual(0);
    expect(a.y - a.r1).toBeGreaterThanOrEqual(0);
    expect(a.x + a.r1).toBeLessThanOrEqual(layout.width);
    expect(a.y + a.r1).toBeLessThanOrEqual(layout.height);
    expect(a.r1).toBeGreaterThan(a.r0);
    expect(distance(layout.gate.x, layout.gate.y, a.x, a.y)).toBeGreaterThan(a.r1);
    for (let j = i + 1; j < layout.zones.length; j++) {
      const b = layout.zones[j]!;
      expect(distance(a.x, a.y, b.x, b.y)).toBeGreaterThanOrEqual(a.r1 + b.r1);
    }
  }
  expect(layout.gate.y).toBeLessThan(layout.height);
}

const capacities = fc.array(fc.integer({ min: 10, max: 420 }), { minLength: 10, maxLength: 10 });

describe("computeLayout", () => {
  it("never overlaps zones and keeps everything inside the world (landscape)", () => {
    fc.assert(
      fc.property(capacities, fc.integer({ min: 10, max: 120 }), (caps, plaza) => {
        assertValid(computeLayout("landscape", caps, plaza));
      }),
      { numRuns: 60 },
    );
  });

  it("never overlaps zones and keeps everything inside the world (portrait)", () => {
    fc.assert(
      fc.property(capacities, fc.integer({ min: 10, max: 120 }), (caps, plaza) => {
        assertValid(computeLayout("portrait", caps, plaza));
      }),
      { numRuns: 60 },
    );
  });

  it("is wider than tall in landscape and taller than wide in portrait", () => {
    const caps = [300, 150, 200, 160, 180, 120, 100, 100, 90, 70];
    const wide = computeLayout("landscape", caps, 60);
    const tall = computeLayout("portrait", caps, 60);
    expect(wide.width).toBeGreaterThan(wide.height);
    expect(tall.height).toBeGreaterThan(tall.width);
  });

  it("picks portrait for phones held upright", () => {
    expect(modeForAspect(390 / 844)).toBe("portrait");
    expect(modeForAspect(1440 / 900)).toBe("landscape");
  });
});

describe("sunflowerSpots", () => {
  it("keeps every spot inside the ring", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 1, max: 400 }),
        (r0, extra, count) => {
          const r1 = r0 + extra;
          const spots = sunflowerSpots(500, 500, r0, r1, count);
          for (let i = 0; i < count; i++) {
            const d = distance(500, 500, spots[i * 2]!, spots[i * 2 + 1]!);
            expect(d).toBeGreaterThanOrEqual(r0 - 0.01);
            expect(d).toBeLessThanOrEqual(r1 + 0.01);
          }
        },
      ),
    );
  });
});
