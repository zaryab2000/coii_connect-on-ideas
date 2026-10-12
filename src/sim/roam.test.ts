import { describe, expect, it } from "vitest";

import { createRng } from "@/data/rng";
import { DWELL_MAX_S, DWELL_MIN_S, nextRoamZone, roamDwell } from "@/sim/roam";

const BOOTHS = 10;
const PLAZA = 10;

describe("NPC roaming", () => {
  it("heads to the chai hub about 40% of the time and never stays put", () => {
    const rng = createRng(4);
    let zone = 3;
    let hub = 0;
    let fromBooth = 0;
    for (let i = 0; i < 20_000; i++) {
      const next = nextRoamZone(zone, BOOTHS, PLAZA, () => rng.next());
      expect(next).not.toBe(zone);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThanOrEqual(PLAZA);
      if (zone !== PLAZA) {
        fromBooth++;
        if (next === PLAZA) hub++;
      }
      zone = next;
    }
    expect(hub / fromBooth).toBeGreaterThan(0.37);
    expect(hub / fromBooth).toBeLessThan(0.43);
  });

  it("visits every booth, not just its own topics", () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(nextRoamZone(PLAZA, BOOTHS, PLAZA, () => rng.next()));
    expect([...seen].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("dwells 8 to 20 seconds at a stop", () => {
    const rng = createRng(2);
    for (let i = 0; i < 1000; i++) {
      const dwell = roamDwell(() => rng.next());
      expect(dwell).toBeGreaterThanOrEqual(DWELL_MIN_S);
      expect(dwell).toBeLessThanOrEqual(DWELL_MAX_S);
    }
    expect([DWELL_MIN_S, DWELL_MAX_S]).toEqual([8, 20]);
  });
});
