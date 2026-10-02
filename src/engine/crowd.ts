import { Particle, ParticleContainer, Rectangle } from "pixi.js";

import type { CrowdAtlas, Frame } from "@/engine/atlas";
import type { FaceKind } from "@/engine/beanArt";
import type { Effect, EffectPool } from "@/engine/fx";
import { inRect } from "@/engine/gags";
import type { Rect, RobotCrew } from "@/engine/gags";
import { bgr } from "@/engine/palette";
import { computePose, createPose } from "@/engine/pose";
import type { Pose } from "@/engine/pose";
import { State } from "@/sim/world";
import type { Agent, World } from "@/sim/world";

/** Per-agent colours and frames, fixed for the person's lifetime. */
export interface BeanLook {
  readonly shirt: number;
  readonly skin: number;
  readonly hair: number;
  readonly hairFrame: Frame | null;
  readonly accessory: Frame | null;
  /** Prop for the person's main intent (laptop, megaphone, …), held at their side. */
  readonly intentProp: Frame | null;
  readonly lod: Frame;
  readonly seed: number;
}

/** Booth jokes the renderer needs to know about (see `@/engine/gags`). */
export interface CrowdGags {
  /** Zone where everyone wears shades (Privacy). */
  readonly shadesZone: number;
  /** Zone with the liquidity pool (DeFi) and the pool's floor rectangle. */
  readonly poolZone: number;
  readonly pool: Rect | null;
  readonly robots: RobotCrew | null;
}

export interface View {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly zoom: number;
}

/** Below this zoom each bean is drawn as one pre-baked particle. */
export const LOD_ZOOM = 0.25;

const WHITE = 0xffffff;
const OPAQUE = 255 << 24;
const DIMMED = 70 << 24;
const SHADOW = ((0.2 * 255) | 0) << 24;
const RANI = bgr(0xff2e88);
const MARIGOLD = bgr(0xffb31a);
const PEACOCK = bgr(0x0fa3a3);

/** Interpolated agent position for this frame. */
function lerpX(a: Agent, alpha: number): number {
  return a.px + (a.x - a.px) * alpha;
}

/** Icon frames are this many world units across at scale 1. */
const ICON_UNITS = 16;
/** Crowns aim for this size on screen at any zoom. */
const CROWN_PX = 22;

function lerpY(a: Agent, alpha: number): number {
  return a.py + (a.y - a.py) * alpha;
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
  /** Agents to highlight ("My tribe"); combines with the topic highlight. Empty = off. */
  highlightIds: ReadonlySet<number> = new Set();
  /** Today's picks; they get sparkles that only the viewer sees. */
  picks: ReadonlySet<number> = new Set();
  /** Wave-points leaders; they wear crowns, big enough to spot from the overview. */
  crowns: ReadonlySet<number> = new Set();
  /** Current camera zoom, so crowns keep a readable size on screen. */
  zoom = 1;
  private readonly particles: Particle[] = [];
  private count = 0;
  private order: number[] = [];
  private readonly overlays: number[] = [];
  private readonly robotOrder: number[] = [];
  private robotQueue: number[] = [];
  private nextRobot = 0;
  private readonly pose: Pose = createPose();
  /** Current transform that `stamp` draws with; set once per bean by `place`. */
  private readonly pen = { x: 0, y: 0, sx: 1, sy: 1, rotation: 0 };

  constructor(
    private readonly atlas: CrowdAtlas,
    private readonly world: World,
    private readonly gags: CrowdGags,
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
    const decay = Math.exp(-9 * dt);
    for (const index of this.order) this.squash[index] = (this.squash[index] ?? 0) * decay;
    if (!lod) this.writeShadows(alpha, view);
    this.writeCrowd(alpha, view, time, lod);
    if (!lod) this.writeOverlays(alpha, time);
    this.writeEffects(effects, alpha);
    this.commit();
  }

  // ---- particle output ------------------------------------------------------------------------

  private place(x: number, y: number, sx: number, sy: number, rotation: number): void {
    const pen = this.pen;
    pen.x = x;
    pen.y = y;
    pen.sx = sx;
    pen.sy = sy;
    pen.rotation = rotation;
  }

  /** Emits one particle at the pen, optionally offset in world units and scaled by `k`. */
  private stamp(frame: Frame, color: number, dy = 0, dx = 0, k = 1): void {
    let p = this.particles[this.count];
    if (!p) {
      p = new Particle({ texture: frame.texture });
      this.particles.push(p);
    }
    const pen = this.pen;
    p.texture = frame.texture;
    p.anchorX = frame.anchorX;
    p.anchorY = frame.anchorY;
    p.x = pen.x + dx;
    p.y = pen.y + dy;
    p.scaleX = pen.sx * frame.scale * k;
    p.scaleY = pen.sy * frame.scale * k;
    p.rotation = pen.rotation;
    p.color = color;
    this.count++;
  }

  /** Hands this frame's particles to the container, only rebuilding when the count changed. */
  private commit(): void {
    const children = this.container.particleChildren;
    const resized = children.length !== this.count;
    if (resized) children.length = this.count;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i] as Particle;
      if (children[i] !== p) children[i] = p;
    }
    if (resized) this.container.update();
  }

  // ---- passes ---------------------------------------------------------------------------------

  private visible(a: Agent, alpha: number, view: View): boolean {
    const x = lerpX(a, alpha);
    const y = lerpY(a, alpha);
    return x > view.x0 - 40 && x < view.x1 + 40 && y > view.y0 - 10 && y < view.y1 + 80 + a.z;
  }

  private dimmed(a: Agent, index: number): boolean {
    if (index === this.selected || a.isYou) return false;
    if (this.highlightIds.size > 0 && !this.highlightIds.has(index)) return true;
    if (this.highlight.size === 0) return false;
    return !a.topics.some((topic) => this.highlight.has(topic));
  }

  /** The agent at `index` if it is active, has a look and is on screen; otherwise null. */
  private onScreen(index: number, alpha: number, view: View): Agent | null {
    const a = this.world.agents[index];
    if (!a?.active || !this.looks[index]) return null;
    return this.visible(a, alpha, view) ? a : null;
  }

  private writeShadows(alpha: number, view: View): void {
    for (const index of this.order) {
      const a = this.onScreen(index, alpha, view);
      if (!a) continue;
      const shrink = 1 - Math.min(a.z, 70) / 110;
      const shade = this.dimmed(a, index) ? ((0.07 * 255) | 0) << 24 : SHADOW;
      this.place(lerpX(a, alpha), lerpY(a, alpha), shrink, shrink, 0);
      this.stamp(this.atlas.shadow, shade + WHITE);
      if (index === this.selected || a.isYou) this.writeRing(index, a, alpha);
      else if (this.highlightIds.has(index)) this.writeTribeGlow(a, alpha);
    }
  }

  private writeRing(index: number, a: Agent, alpha: number): void {
    const pulse = 1 + Math.sin(this.world.time * 6) * 0.06;
    this.place(lerpX(a, alpha), lerpY(a, alpha), pulse, pulse, 0);
    this.stamp(this.atlas.ring, (index === this.selected ? RANI : MARIGOLD) + OPAQUE);
  }

  /** Soft teal halo marking a tribe member while "My tribe" is on. */
  private writeTribeGlow(a: Agent, alpha: number): void {
    const breathe = 1.15 + Math.sin(this.world.time * 3 + a.x * 0.01) * 0.08;
    this.place(lerpX(a, alpha), lerpY(a, alpha), breathe, breathe, 0);
    this.stamp(this.atlas.ring, PEACOCK + (((0.9 * 255) | 0) << 24));
  }

  private writeCrowd(alpha: number, view: View, time: number, lod: boolean): void {
    this.robotQueue = lod ? [] : this.sortedRobots();
    this.nextRobot = 0;
    for (const index of this.order) {
      const a = this.onScreen(index, alpha, view);
      const look = this.looks[index];
      if (!a || !look) continue;
      this.writeRobotsBefore(a.y, view);
      if (lod) this.writeLod(index, a, look, alpha);
      else this.writeBean(index, a, look, alpha, time);
    }
    this.writeRobotsBefore(Infinity, view);
  }

  private writeBean(index: number, a: Agent, look: BeanLook, alpha: number, time: number): void {
    const pose = computePose(this.pose, a, time + look.seed * 10, this.squash[index] ?? 0);
    const wading = this.inPool(a);
    const alphaBits = this.dimmed(a, index) ? DIMMED : OPAQUE;
    const float = wading ? Math.sin(time * 2.4 + look.seed * 6) * 1.2 : 0;
    this.place(
      lerpX(a, alpha),
      lerpY(a, alpha) - pose.lift,
      pose.facing * pose.sx,
      pose.sy,
      pose.tilt,
    );
    if (!wading) this.stamp(this.atlas.legs[pose.legs], WHITE + alphaBits);
    this.writeUpperBody(a, look, pose, float - pose.bob, alphaBits);
    if (wading) this.stamp(this.atlas.floatie, WHITE + alphaBits, float - pose.bob);
    if (this.needsOverlay(index, a)) this.overlays.push(index);
  }

  private needsOverlay(index: number, a: Agent): boolean {
    return (
      index === this.selected ||
      a.isYou ||
      a.state === State.Dizzy ||
      this.picks.has(index) ||
      this.crowns.has(index)
    );
  }

  private writeUpperBody(
    a: Agent,
    look: BeanLook,
    pose: Pose,
    dy: number,
    alphaBits: number,
  ): void {
    const atlas = this.atlas;
    this.stamp(atlas.body, look.shirt + alphaBits, dy);
    this.stamp(atlas.head, look.skin + alphaBits, dy);
    this.stamp(atlas.faces[pose.face], WHITE + alphaBits, dy, pose.facing * 0.7);
    if (look.hairFrame) this.stamp(look.hairFrame, look.hair + alphaBits, dy);
    const accessory = this.accessoryFor(a, look, pose.face);
    if (accessory) this.stamp(accessory, WHITE + alphaBits, dy);
    if (pose.phone) this.stamp(atlas.phone, WHITE + alphaBits, dy);
    else if (look.intentProp) {
      this.stamp(look.intentProp, WHITE + alphaBits, dy - 16, pose.facing * 13.5, 0.78);
    }
  }

  private inPool(a: Agent): boolean {
    const pool = this.gags.pool;
    if (!pool || a.zone !== this.gags.poolZone || a.z > 0) return false;
    return a.state !== State.Grabbed && a.state !== State.Thrown && inRect(pool, a.x, a.y);
  }

  /** Everyone at the Privacy booth wears shades, unless their face is mid-surprise. */
  private accessoryFor(a: Agent, look: BeanLook, face: FaceKind): Frame | null {
    if (a.zone !== this.gags.shadesZone || face === "wow" || face === "dizzy")
      return look.accessory;
    const headphones = this.atlas.accessories[3];
    return look.accessory === headphones ? look.accessory : (this.atlas.accessories[2] ?? null);
  }

  private writeLod(index: number, a: Agent, look: BeanLook, alpha: number): void {
    const bob = a.moving ? Math.abs(Math.sin(a.walkPhase)) * 1.5 : 0;
    const squash = 1 - (this.squash[index] ?? 0) * 0.4;
    const alphaBits = this.dimmed(a, index) ? 60 << 24 : OPAQUE;
    this.place(lerpX(a, alpha), lerpY(a, alpha) - a.z - bob, a.facing, squash, 0);
    this.stamp(look.lod, WHITE + alphaBits);
    if (this.crowns.has(index)) this.writeCrown(lerpX(a, alpha), lerpY(a, alpha) - a.z - 30);
    if (index !== this.selected) return;
    const s = 2.6 + Math.sin(this.world.time * 5) * 0.2;
    this.place(lerpX(a, alpha), lerpY(a, alpha) - 70, s, s, 0);
    this.stamp(this.atlas.bang, WHITE + OPAQUE);
  }

  private writeOverlays(alpha: number, time: number): void {
    for (const index of this.overlays) {
      const a = this.world.agents[index];
      if (!a) continue;
      const x = lerpX(a, alpha);
      const head = lerpY(a, alpha) - a.z - 33.5;
      if (a.state === State.Dizzy) this.writeDizzyStars(x, head, time);
      if (this.crowns.has(index)) this.writeCrown(x, head - 3 + Math.sin(time * 2.4 + x) * 1.5);
      if (this.picks.has(index) && index !== this.selected) this.writeSparkle(x, head, time);
      if (index !== this.selected) continue;
      const bounce = Math.abs(Math.sin(time * 4)) * 2.5;
      this.place(x, head - 22 - bounce, 1, 1, 0);
      this.stamp(this.atlas.bang, WHITE + OPAQUE);
    }
  }

  /**
   * A crown perched on top of the head. It grows as you zoom out so it stays about 22 CSS px
   * on screen, which makes the leaders easy to spot from the overview.
   */
  private writeCrown(x: number, top: number): void {
    const frame = this.atlas.icons.get("crown");
    if (!frame) return;
    const scale = Math.min(6, Math.max(1.25, CROWN_PX / (ICON_UNITS * Math.max(this.zoom, 0.05))));
    this.place(x, top - 9 * scale, scale, scale, -0.12);
    this.stamp(frame, WHITE + OPAQUE);
  }

  /** A gently bobbing sparkle above one of today's picks. */
  private writeSparkle(x: number, head: number, time: number): void {
    const frame = this.atlas.icons.get("sparkles");
    if (!frame) return;
    const bob = Math.sin(time * 3 + x * 0.01) * 2.5;
    const pulse = 1.35 + Math.sin(time * 5 + x * 0.02) * 0.15;
    this.place(x, head - 30 + bob, pulse, pulse, Math.sin(time * 2) * 0.15);
    this.stamp(frame, WHITE + OPAQUE);
  }

  private writeDizzyStars(x: number, head: number, time: number): void {
    for (let k = 0; k < 3; k++) {
      const angle = time * 5 + (k * Math.PI * 2) / 3;
      this.place(x + Math.cos(angle) * 11, head - 13 + Math.sin(angle) * 3.5, 0.8, 0.8, angle);
      this.stamp(this.atlas.star, WHITE + OPAQUE);
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
        x += lerpX(a, alpha);
        y += lerpY(a, alpha) - a.z + e.followDy;
      }
      const scale = effectScale(e);
      this.place(x, y, scale, scale, e.rotation);
      this.stamp(e.frame, bgr(e.tint) + (((effectAlpha(e) * 255) | 0) << 24));
    }
  }

  // ---- AI booth robots --------------------------------------------------------------------------

  private sortedRobots(): number[] {
    const crew = this.gags.robots;
    const order = this.robotOrder;
    if (!crew) return order;
    if (order.length !== crew.robots.length) {
      order.length = 0;
      crew.robots.forEach((_, i) => order.push(i));
    }
    order.sort((i, j) => this.robotY(i) - this.robotY(j));
    return order;
  }

  private robotY(i: number): number {
    return this.gags.robots?.robots[i]?.y ?? 0;
  }

  /** Draws queued robots standing behind depth `y`, keeping them correctly layered in the crowd. */
  private writeRobotsBefore(y: number, view: View): void {
    const queue = this.robotQueue;
    while (this.nextRobot < queue.length) {
      const robot = queue[this.nextRobot] ?? 0;
      if (this.robotY(robot) > y) return;
      this.writeRobot(robot, view);
      this.nextRobot++;
    }
  }

  private writeRobot(i: number, view: View): void {
    const robot = this.gags.robots?.robots[i];
    const frame = this.atlas.icons.get("robot");
    if (!robot || !frame || !robotVisible(robot, view)) return;
    const hop = robot.wait > 0 ? 0 : Math.abs(Math.sin(robot.phase)) * 5;
    this.place(robot.x, robot.y, 0.9, 0.9, 0);
    this.stamp(this.atlas.shadow, (((0.22 * 255) | 0) << 24) + WHITE);
    this.place(
      robot.x,
      robot.y - 16 - hop,
      robot.facing * 2.1,
      2.1,
      Math.sin(robot.phase * 0.5) * 0.08,
    );
    this.stamp(frame, WHITE + OPAQUE);
  }
}

function robotVisible(robot: { x: number; y: number }, view: View): boolean {
  return (
    robot.x > view.x0 - 30 && robot.x < view.x1 + 30 && robot.y > view.y0 && robot.y < view.y1 + 40
  );
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
