import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SpatialGrid } from "@/sim/grid";

describe("SpatialGrid.forEachNear", () => {
  it("finds exactly the points a brute-force scan finds", () => {
    const point = fc.record({
      x: fc.float({ min: 0, max: 999, noNaN: true }),
      y: fc.float({ min: 0, max: 599, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.array(point, { minLength: 0, maxLength: 200 }),
        point,
        fc.float({ min: 1, max: 300, noNaN: true }),
        (points, query, radius) => {
          const grid = new SpatialGrid(40, 1000, 600, 8);
          points.forEach((p, i) => grid.insert(i, p.x, p.y));
          const found: number[] = [];
          grid.forEachNear(query.x, query.y, radius, (i) => found.push(i));
          const expected = points.flatMap((p, i) => {
            const fx = Math.fround(p.x) - query.x;
            const fy = Math.fround(p.y) - query.y;
            return fx * fx + fy * fy <= radius * radius ? [i] : [];
          });
          expect(found.toSorted((a, b) => a - b)).toEqual(expected);
        },
      ),
      { numRuns: 80 },
    );
  });
});
