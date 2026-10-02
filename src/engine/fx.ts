import type { Frame } from "@/engine/atlas";

/** Short-lived effect particles (dust, confetti, stars, chat bubbles), pooled and capped. */
export interface Effect {
  active: boolean;
  frame: Frame;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  rotation: number;
  spin: number;
  tint: number;
  /** When >= 0 the effect follows this agent's head instead of using x/y. */
  follow: number;
  followDy: number;
  pop: boolean;
}

const MAX_EFFECTS = 420;

function blank(frame: Frame): Effect {
  return {
    active: false,
    frame,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    grow: 0,
    rotation: 0,
    spin: 0,
    tint: 0xffffff,
    follow: -1,
    followDy: 0,
    pop: false,
  };
}

export class EffectPool {
  readonly effects: Effect[] = [];
  private cursor = 0;

  spawn(frame: Frame, x: number, y: number, life: number): Effect {
    let effect: Effect | undefined;
    if (this.effects.length < MAX_EFFECTS) {
      effect = blank(frame);
      this.effects.push(effect);
    } else {
      for (let n = 0; n < this.effects.length; n++) {
        const candidate = this.effects[(this.cursor + n) % this.effects.length];
        if (candidate && !candidate.active) {
          effect = candidate;
          break;
        }
      }
      effect ??= this.effects[this.cursor % this.effects.length] as Effect;
      this.cursor = (this.cursor + 1) % this.effects.length;
      Object.assign(effect, blank(frame));
    }
    effect.active = true;
    effect.x = x;
    effect.y = y;
    effect.life = life;
    effect.maxLife = life;
    return effect;
  }

  update(dt: number): void {
    for (const e of this.effects) {
      if (!e.active) continue;
      e.life -= dt;
      if (e.life <= 0) {
        e.active = false;
        continue;
      }
      e.vy += e.gravity * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.rotation += e.spin * dt;
      e.size += e.grow * dt;
    }
  }

  clearFollowing(agent: number): void {
    for (const e of this.effects) {
      if (e.follow === agent) e.active = false;
    }
  }
}
