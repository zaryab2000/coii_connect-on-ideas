import { CanvasSource, Container, Graphics, Sprite, Text, Texture, TilingSprite } from "pixi.js";

import { TOPICS } from "@/data/topics";
import {
  FLOOR,
  FLOOR_LINE,
  INK,
  LEAF,
  MARIGOLD,
  MARIGOLD_DEEP,
  PEACOCK,
  RANI,
  WHITE,
} from "@/engine/palette";
import type { VenueLayout, Zone } from "@/sim/layout";

function tileTexture(): Texture {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable, so the venue floor cannot be drawn");
  ctx.fillStyle = `#${FLOOR.toString(16)}`;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = `#${FLOOR_LINE.toString(16)}`;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  ctx.fillStyle = "rgba(124, 77, 255, 0.07)";
  for (const [x, y] of [
    [24, 30],
    [70, 18],
    [52, 66],
    [15, 80],
    [82, 76],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
}

function plazaPetals(g: Graphics, zone: Zone): void {
  const { x, y } = zone;
  const outer = zone.r1 - 8;
  g.circle(x, y, outer).fill({ color: 0xfff1d6 }).stroke({ color: MARIGOLD, width: 6 });
  g.circle(x, y, outer - 16).stroke({ color: RANI, width: 4, alpha: 0.6 });
  const rings: ReadonlyArray<readonly [number, number, number, number]> = [
    [outer - 42, 16, MARIGOLD, 20],
    [outer - 80, 12, RANI, 15],
    [outer - 112, 10, PEACOCK, 11],
  ];
  for (const [radius, count, color, size] of rings) {
    if (radius < zone.obstacle.r + 8) continue;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (count % 2 ? 0 : Math.PI / count);
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      g.ellipse(px, py, size, size * 0.55)
        .fill({ color })
        .stroke({ color: INK, width: 2, alpha: 0.35 });
      g.circle(px + Math.cos(angle) * size * 1.25, py + Math.sin(angle) * size * 1.25, 3.2).fill({
        color: WHITE,
      });
    }
  }
}

/** Floor, walkways, zone discs and the plaza rangoli. Static; drawn once. */
export function buildFloor(layout: VenueLayout): Container {
  const floor = new Container({ label: "floor" });
  const tiles = new TilingSprite({
    texture: tileTexture(),
    width: layout.width,
    height: layout.height,
  });
  floor.addChild(tiles);

  const g = new Graphics();
  const plaza = layout.zones[layout.plazaIndex] as Zone;
  g.moveTo(layout.gate.x, layout.gate.y + 60)
    .lineTo(plaza.x, plaza.y)
    .stroke({ color: 0xf8f3ff, width: 150, cap: "round" });
  for (const zone of layout.zones) {
    if (zone.kind !== "booth") continue;
    g.moveTo(plaza.x, plaza.y)
      .lineTo(zone.x, zone.y)
      .stroke({ color: 0xf8f3ff, width: 84, cap: "round" });
  }
  for (const zone of layout.zones) {
    if (zone.kind !== "booth") continue;
    const color = TOPICS[zone.topic]?.color ?? MARIGOLD;
    g.circle(zone.x, zone.y, zone.r1 + 16)
      .fill({ color, alpha: 0.1 })
      .stroke({ color, width: 4, alpha: 0.32 });
  }
  plazaPetals(g, plaza);
  g.roundRect(layout.gate.x - 150, layout.gate.y - 40, 300, 110, 30)
    .fill({ color: 0xfff1d6 })
    .stroke({ color: MARIGOLD, width: 5 });
  floor.addChild(g);
  return floor;
}

function garlandDots(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2 + 70;
  const length = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(6, Math.floor(length / 17));
  g.moveTo(x0, y0)
    .quadraticCurveTo(midX, midY, x1, y1)
    .stroke({ color: INK, width: 2, alpha: 0.3 });
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const px = u * u * x0 + 2 * u * t * midX + t * t * x1;
    const py = u * u * y0 + 2 * u * t * midY + t * t * y1;
    if (i % 7 === 3) {
      g.ellipse(px, py + 6, 3.5, 7)
        .fill({ color: LEAF })
        .stroke({ color: INK, width: 1.2, alpha: 0.5 });
    }
    g.circle(px, py, 6)
      .fill({ color: i % 2 ? MARIGOLD : MARIGOLD_DEEP })
      .stroke({ color: INK, width: 1.4, alpha: 0.45 });
  }
}

function garlandPairs(layout: VenueLayout): (readonly [number, number])[] {
  if (layout.mode === "portrait") {
    // Bunting strung across the market street, stall to stall.
    return [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
    ];
  }
  const pairs: (readonly [number, number])[] = [];
  for (let i = 0; i < 9; i++) pairs.push([i, i + 1]);
  return pairs;
}

/** Marigold garlands strung between neighbouring booth signs; drawn above the crowd. */
export function buildGarlands(layout: VenueLayout): Graphics {
  const g = new Graphics({ label: "garlands" });
  for (const [a, b] of garlandPairs(layout)) {
    const za = layout.zones[a];
    const zb = layout.zones[b];
    // Mostly-vertical neighbours would string the garland straight through a stall; skip them.
    if (!za || !zb || Math.abs(zb.y - za.y) > Math.abs(zb.x - za.x) * 0.9) continue;
    const dir = zb.x >= za.x ? 1 : -1;
    garlandDots(g, za.x + dir * 58, za.y - 118, zb.x - dir * 58, zb.y - 118);
  }
  return g;
}

/** Entrance arch at the gate; drawn above the crowd so arrivals walk under it. */
export function buildGate(layout: VenueLayout, displayFont: string): Container {
  const gate = new Container({ label: "gate", x: layout.gate.x, y: layout.gate.y });
  const g = new Graphics();
  for (const side of [-1, 1]) {
    g.roundRect(side * 140 - 16 + 6, -190 + 6, 32, 210, 10).fill({ color: INK });
    g.roundRect(side * 140 - 16, -190, 32, 210, 10)
      .fill({ color: PEACOCK })
      .stroke({ color: INK, width: 4 });
  }
  g.roundRect(-176 + 6, -250 + 6, 352, 70, 34).fill({ color: INK });
  g.roundRect(-176, -250, 352, 70, 34).fill({ color: RANI }).stroke({ color: INK, width: 5 });
  gate.addChild(g);
  const garland = new Graphics();
  garlandDots(garland, -168, -178, 168, -178);
  gate.addChild(garland);
  const title = new Text({
    text: "gm coii",
    style: { fontFamily: displayFont, fontWeight: "800", fontSize: 44, fill: WHITE },
    anchor: 0.5,
    x: 0,
    y: -218,
    resolution: 2,
  });
  gate.addChild(title);
  return gate;
}

/** The chai stall in the middle of the plaza. */
export function buildChaiStall(zone: Zone, displayFont: string, cupIcon: Texture): Container {
  const stall = new Container({ label: "chai", x: zone.x, y: zone.y });
  const g = new Graphics();
  g.ellipse(0, 46, 66, 12).fill({ color: INK, alpha: 0.14 });
  for (const side of [-1, 1]) g.rect(side * 44 - 3, -46, 6, 50).fill({ color: INK });
  g.roundRect(-50 + 5, 2 + 5, 100, 40, 10).fill({ color: INK });
  g.roundRect(-50, 2, 100, 40, 10).fill({ color: MARIGOLD }).stroke({ color: INK, width: 4 });
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const a0 = Math.PI + (i / stripes) * Math.PI;
    const a1 = Math.PI + ((i + 1) / stripes) * Math.PI;
    g.moveTo(0, -12)
      .arc(0, -12, 54, a0, a1)
      .lineTo(0, -12)
      .fill({ color: i % 2 ? WHITE : RANI });
  }
  g.moveTo(-54, -12)
    .arc(0, -12, 54, Math.PI, Math.PI * 2)
    .lineTo(-54, -12)
    .stroke({ color: INK, width: 4 });
  g.circle(0, -68, 6).fill({ color: MARIGOLD }).stroke({ color: INK, width: 3 });
  stall.addChild(g);
  const label = new Text({
    text: "CHAI",
    style: {
      fontFamily: displayFont,
      fontWeight: "800",
      fontSize: 20,
      fill: INK,
      letterSpacing: 2,
    },
    anchor: 0.5,
    x: 10,
    y: 23,
    resolution: 2,
  });
  stall.addChild(label);
  const cup = new Sprite({ texture: cupIcon, anchor: 0.5, x: -26, y: 22, width: 24, height: 24 });
  stall.addChild(cup);
  return stall;
}
