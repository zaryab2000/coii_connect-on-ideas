import { Container, Graphics, Sprite } from "pixi.js";
import type { Texture } from "pixi.js";

import type { Topic } from "@/data/types";
import { INK, WHITE } from "@/engine/palette";
import type { Zone } from "@/sim/layout";

/** Booth art extents relative to the zone centre, kept inside the obstacle circle (r = 160). */
const SIGN = { x: -58, y: -126, w: 116, h: 46 };
const HIT = { x0: -104, x1: 104, y0: -140, y1: 100 };
/** Where the floating DOM name label anchors, relative to the zone centre. */
export const BOOTH_LABEL_DY = -134;

function drawStall(g: Graphics, color: number): void {
  g.ellipse(0, 100, 118, 18).fill({ color: INK, alpha: 0.12 });
  for (const side of [-1, 1]) g.roundRect(side * 84 - 5, -80, 10, 126, 4).fill({ color: INK });
  g.roundRect(-90 + 6, 40 + 6, 180, 54, 12).fill({ color: INK });
  g.roundRect(-90, 40, 180, 54, 12).fill({ color }).stroke({ color: INK, width: 4 });
  g.roundRect(-96, 32, 192, 16, 8).fill({ color: WHITE }).stroke({ color: INK, width: 4 });
  const stripes = 8;
  const width = 200 / stripes;
  for (let i = 0; i < stripes; i++) {
    g.rect(-100 + i * width, -74, width, 40).fill({ color: i % 2 ? WHITE : color });
    g.circle(-100 + i * width + width / 2, -34, width / 2).fill({ color: i % 2 ? WHITE : color });
  }
  g.rect(-100, -74, 200, 40).stroke({ color: INK, width: 4 });
  for (let i = 0; i < stripes; i++) {
    g.arc(-100 + i * width + width / 2, -34, width / 2, 0, Math.PI).stroke({
      color: INK,
      width: 3,
    });
  }
  g.roundRect(SIGN.x + 6, SIGN.y + 6, SIGN.w, SIGN.h, 16).fill({ color: INK });
  g.roundRect(SIGN.x, SIGN.y, SIGN.w, SIGN.h, 16)
    .fill({ color: WHITE })
    .stroke({ color: INK, width: 4 });
}

/** A market stall in the topic's colours with its icon on the sign board. */
export class BoothView {
  readonly container: Container;

  constructor(
    readonly zone: Zone,
    readonly topic: Topic,
    icon: Texture,
  ) {
    this.container = new Container({ label: `booth-${topic.id}`, x: zone.x, y: zone.y });
    const g = new Graphics();
    drawStall(g, topic.color);
    this.container.addChild(g);
    this.container.addChild(
      new Sprite({
        texture: icon,
        anchor: 0.5,
        x: 0,
        y: SIGN.y + SIGN.h / 2,
        width: 38,
        height: 38,
      }),
    );
  }

  setDimmed(dimmed: boolean): void {
    this.container.alpha = dimmed ? 0.35 : 1;
  }

  contains(wx: number, wy: number): boolean {
    const x = wx - this.zone.x;
    const y = wy - this.zone.y;
    return x >= HIT.x0 && x <= HIT.x1 && y >= HIT.y0 && y <= HIT.y1;
  }
}
