import { Container, Graphics, Text } from "pixi.js";

import { INK, WHITE } from "@/engine/palette";
import type { Zone } from "@/sim/layout";

/**
 * Booth jokes: the DeFi "liquidity pool" people wade in, robots roaming the AI Agents booth and
 * the Prediction Markets price ticker. Purely decorative; none of it affects the simulation.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function poolRect(zone: Zone): Rect {
  return { x: zone.x - 140, y: zone.y + zone.r0 + 14, w: 280, h: 118 };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y + 6 && y <= r.y + r.h;
}

export function buildPool(zone: Zone): Container {
  const r = poolRect(zone);
  const pool = new Container({ label: "liquidity-pool" });
  const g = new Graphics();
  g.roundRect(r.x - 12, r.y - 12, r.w + 24, r.h + 24, 30)
    .fill({ color: WHITE })
    .stroke({ color: INK, width: 4 });
  g.roundRect(r.x, r.y, r.w, r.h, 22).fill({ color: 0x7fdcf5 }).stroke({ color: INK, width: 3 });
  for (let row = 0; row < 3; row++) {
    const y = r.y + 28 + row * 32;
    for (let x = r.x + 24 + (row % 2) * 30; x < r.x + r.w - 40; x += 60) {
      g.moveTo(x, y)
        .quadraticCurveTo(x + 10, y - 7, x + 20, y)
        .quadraticCurveTo(x + 30, y + 7, x + 40, y);
    }
  }
  g.stroke({ color: WHITE, width: 3, alpha: 0.8 });
  for (const side of [0, 1]) {
    const x = r.x + r.w - 46 + side * 16;
    g.moveTo(x, r.y - 16)
      .lineTo(x, r.y + 18)
      .stroke({ color: 0xb8c0d0, width: 4 });
  }
  pool.addChild(g);
  return pool;
}

/** "liquidity pool" sign, drawn in the overhead layer so the crowd never hides it. */
export function buildPoolSign(zone: Zone, displayFont: string): Container {
  const r = poolRect(zone);
  const sign = new Container({ label: "pool-sign", x: r.x + r.w - 12, y: r.y - 6 });
  const label = new Text({
    text: "liquidity pool",
    style: { fontFamily: displayFont, fontWeight: "800", fontSize: 17, fill: INK },
    anchor: 0.5,
    resolution: 3,
  });
  const w = label.width + 22;
  const g = new Graphics();
  g.roundRect(-w / 2 + 3, -14 + 3, w, 28, 14).fill({ color: INK });
  g.roundRect(-w / 2, -14, w, 28, 14)
    .fill({ color: 0x7fdcf5 })
    .stroke({ color: INK, width: 3 });
  sign.addChild(g, label);
  return sign;
}

interface Robot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  phase: number;
  facing: number;
}

const ROBOT_SPEED = 34;

/** A few tiny robots that wander the AI Agents crowd (agents among humans). */
export class RobotCrew {
  readonly robots: Robot[] = [];

  constructor(
    private readonly zone: Zone,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.randomPoint();
      this.robots.push({
        x: p.x,
        y: p.y,
        tx: p.x,
        ty: p.y,
        wait: Math.random() * 2,
        phase: Math.random() * 6,
        facing: 1,
      });
    }
  }

  private randomPoint(): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const r = this.zone.r0 + 10 + Math.random() * (this.zone.r1 - this.zone.r0 - 20);
    return { x: this.zone.x + Math.cos(angle) * r, y: this.zone.y + Math.sin(angle) * r };
  }

  update(dt: number): void {
    for (const robot of this.robots) {
      robot.phase += dt * 9;
      if (robot.wait > 0) {
        robot.wait -= dt;
        continue;
      }
      const dx = robot.tx - robot.x;
      const dy = robot.ty - robot.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        robot.wait = 0.8 + Math.random() * 2.5;
        const next = this.randomPoint();
        // Short hops between nearby spots read better than long treks.
        robot.tx = robot.x + (next.x - robot.x) * 0.35;
        robot.ty = robot.y + (next.y - robot.y) * 0.35;
        continue;
      }
      const step = Math.min(dist, ROBOT_SPEED * dt);
      robot.x += (dx / dist) * step;
      robot.y += (dy / dist) * step;
      if (Math.abs(dx) > 1) robot.facing = dx > 0 ? 1 : -1;
    }
  }
}

const TICKER_LINES = ["YES 62¢ ▲", "NO 38¢ ▼", "RAIN IN BKC? 71¢", "ETH > 5K? 44¢", "YES 63¢ ▲"];

/** Scrolling price board on the Prediction Markets stall counter. */
export class Ticker {
  readonly view: Container;
  private readonly text: Text;
  private index = 0;
  private elapsed = 0;

  constructor(zone: Zone, displayFont: string) {
    this.view = new Container({ label: "ticker", x: zone.x, y: zone.y });
    const g = new Graphics();
    g.roundRect(-74, 50, 148, 34, 8).fill({ color: INK }).stroke({ color: WHITE, width: 3 });
    this.view.addChild(g);
    this.text = new Text({
      text: TICKER_LINES[0] ?? "",
      style: {
        fontFamily: displayFont,
        fontWeight: "800",
        fontSize: 20,
        fill: 0x56f39a,
        letterSpacing: 1,
      },
      anchor: 0.5,
      x: 0,
      y: 68,
      resolution: 3,
    });
    this.view.addChild(this.text);
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed < 2.4) return;
    this.elapsed = 0;
    this.index = (this.index + 1) % TICKER_LINES.length;
    const line = TICKER_LINES[this.index] ?? "";
    this.text.text = line;
    this.text.style.fill = line.includes("▼") ? 0xff6b6b : 0x56f39a;
  }
}
