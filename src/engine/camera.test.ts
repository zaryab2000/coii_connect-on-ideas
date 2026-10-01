import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { Camera, MAX_ZOOM } from "@/engine/camera";

function camera(): Camera {
  const cam = new Camera();
  cam.setWorld(3000, 2000);
  cam.setViewport(1200, 800);
  cam.flyTo(1500, 1000, 1, 0);
  return cam;
}

describe("Camera", () => {
  it("round-trips between screen and world coordinates", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1200 }), fc.integer({ min: 0, max: 800 }), (sx, sy) => {
        const cam = camera();
        const w = cam.screenToWorld(sx, sy);
        const s = cam.worldToScreen(w.x, w.y);
        expect(s.x).toBeCloseTo(sx, 6);
        expect(s.y).toBeCloseTo(sy, 6);
      }),
    );
  });

  it("keeps the world point under the cursor fixed while zooming", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 900 }),
        fc.integer({ min: 200, max: 600 }),
        fc.double({ min: 0.8, max: 1.25, noNaN: true }),
        (sx, sy, factor) => {
          const cam = camera();
          const before = cam.screenToWorld(sx, sy);
          cam.zoomAt(sx, sy, factor);
          const after = cam.screenToWorld(sx, sy);
          expect(after.x).toBeCloseTo(before.x, 4);
          expect(after.y).toBeCloseTo(before.y, 4);
        },
      ),
    );
  });

  it("never zooms past its limits or leaves the world", () => {
    const cam = camera();
    cam.zoomAt(600, 400, 100);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.zoomAt(600, 400, 0.0001);
    expect(cam.zoom).toBeCloseTo(cam.minZoom, 6);
    cam.flyTo(1500, 1000, 1, 0);
    cam.panBy(-100000, -100000);
    const view = cam.view();
    expect(view.x1).toBeCloseTo(3000, 6);
    expect(view.y1).toBeCloseTo(2000, 6);
    cam.panBy(100000, 100000);
    expect(cam.view().x0).toBeCloseTo(0, 6);
  });

  it("finishes a fly-to at the requested spot", () => {
    const cam = camera();
    cam.flyTo(2000, 1200, 1.5, 0.6);
    for (let i = 0; i < 60; i++) cam.update(1 / 60);
    expect(cam.animating).toBe(false);
    expect(cam.x).toBeCloseTo(2000, 3);
    expect(cam.y).toBeCloseTo(1200, 3);
    expect(cam.zoom).toBeCloseTo(1.5, 6);
  });

  it("coasts to a stop after a flick", () => {
    const cam = camera();
    cam.vx = 1500;
    for (let i = 0; i < 240; i++) cam.update(1 / 60);
    expect(cam.vx).toBe(0);
    expect(cam.x).toBeLessThan(1500);
  });
});
