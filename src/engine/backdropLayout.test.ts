import { describe, expect, it } from "vitest";

import plates from "@/assets/backdrop/mumbai.json";
import { backdropAlpha, backdropInWorld, backdropPieces } from "@/engine/backdropLayout";
import type { BackdropCamera, BackdropHome } from "@/engine/backdropLayout";

const SCREENS = {
  laptop: { w: 1048, h: 900, top: 130 },
  wide: { w: 1920, h: 1080, top: 130 },
  ultrawide: { w: 3440, h: 1000, top: 130 },
  phone: { w: 390, h: 760, top: 110 },
};

describe("backdropPieces", () => {
  for (const [name, screen] of Object.entries(SCREENS))
    it(`lays the harbour along the bottom of a ${name} screen, the sun under the HUD`, () => {
      const plate = name === "phone" ? plates.portrait : plates.landscape;
      const [band, sun] = backdropPieces(plate, screen);
      if (!band || !sun) throw new Error("expected the harbour band and the sun");
      const { pad, w, h, waterline } = plate.band;
      // The painting is centred, never wider than the screen nor taller than 42% of it.
      expect(band.x + (w / 2) * band.scale).toBeCloseTo(screen.w / 2);
      expect((w - 2 * pad) * band.scale).toBeLessThanOrEqual(screen.w + 1e-6);
      expect(h * band.scale).toBeLessThanOrEqual(screen.h * 0.42 + 1e-6);
      // The shore is in the bottom part of the screen, most of the sea above its bottom edge.
      const shore = band.y + waterline * band.scale;
      expect(shore).toBeLessThan(screen.h);
      expect(band.y + h * band.scale).toBeGreaterThan(screen.h);
      expect(band.y).toBeGreaterThan(screen.h * 0.5);
      // The sun sits top-left under the HUD, at the painting's scale.
      expect(sun).toMatchObject({ x: 0, y: screen.top, scale: band.scale });
    });

  for (const name of ["laptop", "wide", "phone"] as const)
    it(`spans a ${name} screen edge to edge, its sea carrying on past both sides`, () => {
      const screen = SCREENS[name];
      const plate = name === "phone" ? plates.portrait : plates.landscape;
      const [band] = backdropPieces(plate, screen);
      if (!band) throw new Error("expected the harbour band");
      expect((plate.band.w - 2 * plate.band.pad) * band.scale).toBeCloseTo(screen.w);
      expect(band.x).toBeLessThan(0);
      expect(band.x + plate.band.w * band.scale).toBeGreaterThan(screen.w);
    });
});

describe("backdropInWorld", () => {
  const home: BackdropHome = { x: 2000, y: 1600, zoom: 0.25 };
  const at = (camera: Partial<BackdropCamera>): BackdropCamera => ({
    x: home.x,
    y: home.y,
    zoom: home.zoom,
    viewW: 1048,
    viewH: 900,
    ...camera,
  });
  const piece = { frame: { x: 0, y: 0, w: 100, h: 100 }, x: 200, y: 700, scale: 0.6 };
  const onScreen = (camera: BackdropCamera) => {
    const p = backdropInWorld(piece, camera, home);
    const sx = (p.x - camera.x) * camera.zoom + camera.viewW / 2;
    const sy = (p.y - camera.y) * camera.zoom + camera.viewH / 2;
    return { sx, sy, size: p.scale * camera.zoom };
  };

  it("puts each piece exactly where it was composed at the default view", () => {
    const p = onScreen(at({}));
    expect(p.sx).toBeCloseTo(200);
    expect(p.sy).toBeCloseTo(700);
    expect(p.size).toBeCloseTo(0.6);
  });

  it("moves a little the way the venue moves when you pan, like something far behind it", () => {
    const camera = at({ x: home.x + 800 });
    const p = onScreen(camera);
    const venueShift = -800 * camera.zoom;
    expect(p.sx - 200).toBeLessThan(0);
    expect(p.sx - 200).toBeGreaterThan(venueShift * 0.3);
  });

  it("barely changes size when you zoom, where the venue doubles", () => {
    expect(onScreen(at({ zoom: home.zoom * 2 })).size / 0.6).toBeLessThan(1.15);
    expect(onScreen(at({ zoom: home.zoom / 2 })).size / 0.6).toBeGreaterThan(0.85);
  });
});

describe("backdropAlpha", () => {
  it("stays at the default view and zoomed out, and fades away up close", () => {
    expect(backdropAlpha(0.25, 0.25)).toBe(1);
    expect(backdropAlpha(0.1, 0.25)).toBe(1);
    expect(backdropAlpha(0.25 * 1.5, 0.25)).toBe(1);
    expect(backdropAlpha(0.25 * 2, 0.25)).toBeGreaterThan(0);
    expect(backdropAlpha(0.25 * 2, 0.25)).toBeLessThan(1);
    expect(backdropAlpha(0.25 * 2.4, 0.25)).toBe(0);
  });

  it("only ever fades as you zoom in", () => {
    let last = 1;
    for (let zoom = 0.05; zoom < 1; zoom += 0.01) {
      const alpha = backdropAlpha(zoom, 0.3);
      expect(alpha).toBeLessThanOrEqual(last);
      last = alpha;
    }
  });
});
