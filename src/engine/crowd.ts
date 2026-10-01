import { Particle, ParticleContainer, Rectangle } from "pixi.js";

import type { CrowdAtlas, Frame } from "@/engine/atlas";
import type { FaceKind, LegPose } from "@/engine/beanArt";
import type { Effect, EffectPool } from "@/engine/fx";
import { bgr } from "@/engine/palette";
import { IdleKind, State } from "@/sim/world";
import type { Agent, World } from "@/sim/world";

/** Per-agent colours and frames, fixed for the person's lifetime. */
export interface BeanLook {
  readonly shirt: number;
  readonly skin: number;
  readonly hair: number;
  readonly hairFrame: Frame | null;
  readonly accessory: Frame | null;
  readonly lod: Frame;
  readonly seed: number;
}

export interface View {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly zoom: number;
}

/** Below this zoom each bean is drawn as one pre-baked particle. */
export const LOD_ZOOM = 0.3;

const WHITE_BGR = 0xffffff;
const ALPHA_FULL = 255 << 24;
const RANI_BGR = bgr(0xff2e88);

interface Pose {
  lift: number;
  bob: number;
  tilt: number;
  sx: number;
  sy: number;
  legs: LegPose;
  face: FaceKind;
  facing: number;
  phone: boolean;
}

/**
 * Writes the whole crowd into one ParticleContainer each frame: shadows first, then beans in
 * depth order, then overlays and effects. One draw call for thousands of people.
 */
export class CrowdRenderer {
  readonly container: ParticleContainer;
  readonly looks: (BeanLook | undefined)[] = [];
  readonly squash: number[] = [];
  selected = -1;
  /** Topics to highlight; empty means everyone is shown normally. */
  highlight: ReadonlySet<number> = new Set();
  private readonly pool: Particle[] = [];
  private count = 0;
  private order: number[] = [];
  private readonly overlays: number[] = [];
  private readonly pose: Pose = {
    lift: 0,
    bob: 0,
    tilt: 0,
    sx: 1,
    sy: 1,
    legs: "stand",
    face: "open",
    facing: 1,
    phone: false,
  };

  constructor(
    private readonly atlas: CrowdAtlas,
    private readonly world: World,
    worldWidth: number,
    worldHeight: number,
  ) {
    this.container = new ParticleContainer({
      texture: atlas.body.texture,
      boundsArea: new Rectangle(0, 0, worldWidth, worldHeight),
      dynamicProperties: { position: true, vertex: true, rotation: true, uvs: true, color: true },
    });
  }

  setLook(index: number, look: BeanLook): void {
    this.looks[index] = look;
    this.squash[index] = 0;
    if (!this.order.includes(index)) this.order.push(index);
  }

  forget(index: number): void {
    this.looks[index] = undefined;
    this.order = this.order.filter((i) => i !== index);
  }

  impulse(index: number, amount: number): void {
    this.squash[index] = Math.max(this.squash[index] ?? 0, amount);
  }

  /** Insertion sort by y; the order barely changes between ticks so this is close to O(n). */
  sortByDepth(): void {
    const order = this.order;
    const agents = this.world.agents;
    for (let i = 1; i < order.length; i++) {
      const value = order[i] as number;
      const y = agents[value]?.y ?? 0;
      let j = i - 1;
      while (j >= 0 && (agents[order[j] as number]?.y ?? 0) > y) {
        order[j + 1] = order[j] as number;
        j--;
      }
      order[j + 1] = value;
    }
  }

  render(alpha: number, view: View, time: number, dt: number, effects: EffectPool): void {
    this.count = 0;
    this.overlays.length = 0;
    const lod = view.zoom < LOD_ZOOM;
    const agents = this.world.agents;
    const decay = Math.exp(-9 * dt);
    for (const index of this.order) {
      const a = agents[index];
      const look = this.looks[index];
      if (!a?.active || !look) continue;
      this.squash[index] = (this.squash[index] ?? 0) * decay;
      if (!this.visible(a, alpha, view)) continue;
      if (!lod) this.writeShadow(index, a, alpha);
    }
    for (const index of this.order) {
      const a = agents[index];
      const look = this.looks[index];
      if (!a?.active || !look || !this.visible(a, alpha, view)) continue;
      if (lod) this.writeLod(index, a, look, alpha, time);
      else this.writeBean(index, a, look, alpha, time);
    }
    if (!lod) this.writeOverlays(alpha, time);
    this.writeEffects(effects, alpha);
    const children = this.container.particleChildren;
    if (children.length !== this.count) {
      children.length = this.count;
      for (let i = 0; i < this.count; i++) children[i] = this.pool[i] as Particle;
      this.container.update();
    } else {
      for (let i = 0; i < this.count; i++) {
        if (children[i] !== this.pool[i]) children[i] = this.pool[i] as Particle;
      }
    }
  }

  private visible(a: Agent, alpha: number, view: View): boolean {
    const x = a.px + (a.x - a.px) * alpha;
    const y = a.py + (a.y - a.py) * alpha;
    return x > view.x0 - 40 && x < view.x1 + 40 && y > view.y0 - 10 && y < view.y1 + 80 + a.z;
  }

  private dimmed(a: Agent, index: number): boolean {
    if (this.highlight.size === 0 || index === this.selected || a.isYou) return false;
    for (const topic of a.topics) if (this.highlight.has(topic)) return false;
    return true;
  }

  private emit(
    frame: Frame,
    x: number,
    y: number,
    sx: number,
    sy: number,
    rotation: number,
    color: number,
  ): void {
    let p = this.pool[this.count];
    if (!p) {
      p = new Particle({ texture: frame.texture });
      this.pool.push(p);
    }
    p.texture = frame.texture;
    p.anchorX = frame.anchorX;
    p.anchorY = frame.anchorY;
    p.x = x;
    p.y = y;
    p.scaleX = sx * frame.scale;
    p.scaleY = sy * frame.scale;
    p.rotation = rotation;
    p.color = color;
    this.count++;
  }

  private writeShadow(index: number, a: Agent, alpha: number): void {
    const x = a.px + (a.x - a.px) * alpha;
    const y = a.py + (a.y - a.py) * alpha;
    const shrink = 1 - Math.min(a.z, 70) / 110;
    const dim = this.dimmed(a, index) ? 0.35 : 1;
    this.emit(
      this.atlas.shadow,
      x,
      y,
      shrink,
      shrink,
      0,
      (((0.2 * dim * 255) | 0) << 24) + WHITE_BGR,
    );
    if (index === this.selected) {
      const pulse = 1 + Math.sin(this.world.time * 6) * 0.06;
      this.emit(this.atlas.ring, x, y, pulse, pulse, 0, RANI_BGR + ALPHA_FULL);
    }
  }

  private computePose(index: number, a: Agent, look: BeanLook, time: number): Pose {
    const pose = this.pose;
    const t = time + look.seed * 10;
    pose.lift = a.z;
    pose.bob = 0;
    pose.tilt = 0;
    pose.sx = 1;
    pose.sy = 1;
    pose.legs = "stand";
    pose.face = t % 4.3 < 0.13 ? "blink" : "open";
    pose.facing = a.facing;
    pose.phone = false;
    switch (a.state) {
      case State.Wandering:
      case State.Commuting:
      case State.Arriving:
      case State.RunningHome: {
        const step = Math.sin(a.walkPhase);
        pose.legs = step > 0 ? "stepA" : "stepB";
        pose.bob = Math.abs(step) * 1.4;
        pose.tilt = a.facing * (a.state === State.RunningHome ? 0.16 : 0.05);
        if (a.state === State.RunningHome) pose.face = "wow";
        break;
      }
      case State.Idle:
        this.idlePose(pose, a, t);
        break;
      case State.Chatting:
        pose.sy = 1 + Math.sin(t * 11) * 0.025;
        pose.face = Math.sin(t * 2.3) > 0.6 ? "happy" : pose.face;
        break;
      case State.Held:
        pose.face = "wow";
        pose.sy = 0.94;
        break;
      case State.Grabbed:
        pose.legs = Math.sin(t * 22) > 0 ? "dangle" : "stepA";
        pose.face = "wow";
        pose.tilt = Math.sin(t * 9) * 0.14;
        pose.lift = a.z + Math.sin(t * 15) * 1.5;
        break;
      case State.Thrown:
        pose.legs = "dangle";
        pose.face = "wow";
        pose.tilt = Math.max(-0.7, Math.min(0.7, a.vx / 900)) + Math.sin(t * 13) * 0.1;
        break;
      case State.Dizzy:
        pose.face = "dizzy";
        pose.tilt = Math.sin(t * 7) * 0.13;
        break;
    }
    const squash = this.squash[index] ?? 0;
    if (squash > 0.01) {
      pose.sy *= 1 - squash * 0.45;
      pose.sx *= 1 + squash * 0.35;
    }
    return pose;
  }

  private idlePose(pose: Pose, a: Agent, t: number): void {
    switch (a.idleKind) {
      case IdleKind.LookAround:
        pose.facing = Math.sin(t * 0.9) > 0 ? 1 : -1;
        break;
      case IdleKind.Hop: {
        const hop = Math.max(0, Math.sin(t * 7));
        pose.lift = hop * 6;
        pose.sy = 1 + hop * 0.08;
        pose.sx = 1 - hop * 0.05;
        pose.face = "happy";
        break;
      }
      case IdleKind.Phone:
        pose.face = "down";
        pose.phone = true;
        break;
      case IdleKind.Wave: {
        const hop = Math.max(0, Math.sin(t * 9));
        pose.lift = hop * 7;
        pose.face = "happy";
        break;
      }
      default:
        pose.sy = 1 + Math.sin(t * 2.2) * 0.012;
    }
  }

  private writeBean(index: number, a: Agent, look: BeanLook, alpha: number, time: number): void {
    const pose = this.computePose(index, a, look, time);
    const x = a.px + (a.x - a.px) * alpha;
    const y = a.py + (a.y - a.py) * alpha - pose.lift;
    const upper = y - pose.bob;
    const fx = pose.facing * pose.sx;
    const fy = pose.sy;
    const r = pose.tilt;
    const al = (this.dimmed(a, index) ? 70 : 255) << 24;
    const atlas = this.atlas;
    this.emit(atlas.legs[pose.legs], x, y, fx, fy, r, WHITE_BGR + al);
    this.emit(atlas.body, x, upper, fx, fy, r, look.shirt + al);
    this.emit(atlas.head, x, upper, fx, fy, r, look.skin + al);
    this.emit(atlas.faces[pose.face], x + pose.facing * 0.7, upper, fx, fy, r, WHITE_BGR + al);
    if (look.hairFrame) this.emit(look.hairFrame, x, upper, fx, fy, r, look.hair + al);
    if (look.accessory) this.emit(look.accessory, x, upper, fx, fy, r, WHITE_BGR + al);
    if (pose.phone) this.emit(atlas.phone, x, upper, fx, fy, r, WHITE_BGR + al);
    if (index === this.selected || a.isYou || a.state === State.Dizzy) this.overlays.push(index);
  }

  private writeLod(index: number, a: Agent, look: BeanLook, alpha: number, time: number): void {
    const x = a.px + (a.x - a.px) * alpha;
    const y = a.py + (a.y - a.py) * alpha - a.z;
    const bob = a.moving ? Math.abs(Math.sin(a.walkPhase)) * 1.5 : 0;
    const al = (this.dimmed(a, index) ? 60 : 255) << 24;
    const squash = 1 - (this.squash[index] ?? 0) * 0.4;
    this.emit(look.lod, x, y - bob, a.facing, squash, 0, WHITE_BGR + al);
    if (index === this.selected || a.isYou) {
      const s = 2.6 + Math.sin(time * 5) * 0.2;
      this.emit(
        a.isYou ? this.atlas.you : this.atlas.bang,
        x,
        y - 70,
        s,
        s,
        0,
        WHITE_BGR + ALPHA_FULL,
      );
    }
  }

  private writeOverlays(alpha: number, time: number): void {
    const agents = this.world.agents;
    for (const index of this.overlays) {
      const a = agents[index];
      if (!a) continue;
      const x = a.px + (a.x - a.px) * alpha;
      const head = a.py + (a.y - a.py) * alpha - a.z - 33.5;
      if (a.state === State.Dizzy) {
        for (let k = 0; k < 3; k++) {
          const angle = time * 5 + (k * Math.PI * 2) / 3;
          this.emit(
            this.atlas.star,
            x + Math.cos(angle) * 11,
            head - 13 + Math.sin(angle) * 3.5,
            0.8,
            0.8,
            angle,
            WHITE_BGR + ALPHA_FULL,
          );
        }
      }
      if (a.isYou) {
        const bounce = Math.abs(Math.sin(time * 3.2)) * 3;
        this.emit(this.atlas.you, x, head - 26 - bounce, 1, 1, 0, WHITE_BGR + ALPHA_FULL);
      } else if (index === this.selected) {
        const bounce = Math.abs(Math.sin(time * 4)) * 2.5;
        this.emit(this.atlas.bang, x, head - 22 - bounce, 1, 1, 0, WHITE_BGR + ALPHA_FULL);
      }
    }
  }

  private writeEffects(effects: EffectPool, alpha: number): void {
    const agents = this.world.agents;
    for (const e of effects.effects) {
      if (!e.active) continue;
      let x = e.x;
      let y = e.y;
      if (e.follow >= 0) {
        const a = agents[e.follow];
        if (!a?.active) {
          e.active = false;
          continue;
        }
        x += a.px + (a.x - a.px) * alpha;
        y += a.py + (a.y - a.py) * alpha - a.z + e.followDy;
      }
      this.emit(
        e.frame,
        x,
        y,
        effectScale(e),
        effectScale(e),
        e.rotation,
        bgr(e.tint) + (((effectAlpha(e) * 255) | 0) << 24),
      );
    }
  }
}

function effectScale(e: Effect): number {
  if (!e.pop) return e.size;
  const age = e.maxLife - e.life;
  const appear = Math.min(1, age / 0.18);
  const overshoot = appear < 1 ? appear * (1.25 - 0.25 * appear) : 1;
  return e.size * overshoot;
}

function effectAlpha(e: Effect): number {
  const fadeOut = Math.min(1, e.life / Math.min(0.35, e.maxLife * 0.5));
  return Math.max(0, Math.min(1, fadeOut));
}
