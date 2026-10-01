import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { rubberBand, settleSheet } from "@/ui/sheetPhysics";

describe("settleSheet", () => {
  const plain = { height: 500, peekOffset: null };
  const peek = { height: 600, peekOffset: 300 };

  it("snaps back after a short slow drag", () => {
    expect(settleSheet({ ...plain, y: 60, velocity: 0 })).toBe("full");
  });

  it("closes after dragging past 30% of the sheet", () => {
    expect(settleSheet({ ...plain, y: 160, velocity: 0 })).toBe("close");
  });

  it("closes on a quick downward flick even when barely moved", () => {
    expect(settleSheet({ ...plain, y: 30, velocity: 1 })).toBe("close");
  });

  it("stays open on an upward flick", () => {
    expect(settleSheet({ ...plain, y: 140, velocity: -1 })).toBe("full");
  });

  it("moves a peeking sheet between its detents", () => {
    expect(settleSheet({ ...peek, y: 120, velocity: 0 })).toBe("full");
    expect(settleSheet({ ...peek, y: 200, velocity: 0 })).toBe("peek");
    expect(settleSheet({ ...peek, y: 290, velocity: -1.2 })).toBe("full");
  });

  it("closes a peeking sheet only past 30% of the way down from peek", () => {
    expect(settleSheet({ ...peek, y: 380, velocity: 0 })).toBe("peek");
    expect(settleSheet({ ...peek, y: 400, velocity: 0 })).toBe("close");
  });

  it("never picks peek for a sheet without one (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 800, noNaN: true }),
        fc.double({ min: -5, max: 5, noNaN: true }),
        (y, velocity) => {
          expect(settleSheet({ y, velocity, height: 500, peekOffset: null })).not.toBe("peek");
        },
      ),
    );
  });
});

describe("rubberBand", () => {
  it("resists more the further you pull past the top", () => {
    expect(rubberBand(0)).toBeCloseTo(0);
    expect(rubberBand(100)).toBeGreaterThan(-100);
    expect(Math.abs(rubberBand(400))).toBeLessThan(2 * Math.abs(rubberBand(100)) + 1);
  });
});
