import { createRng } from "@/data/rng";
import type { Rng } from "@/data/rng";
import { segmentHitsCircle, sunflowerSpots } from "@/sim/geometry";
import { SpatialGrid } from "@/sim/grid";
import type { VenueLayout, Zone } from "@/sim/layout";

export const State = {
  Idle: 0,
  Wandering: 1,
  Commuting: 2,
  Arriving: 3,
  Chatting: 4,
  Held: 5,
  Grabbed: 6,
  Thrown: 7,
  Dizzy: 8,
  RunningHome: 9,
} as const;
export type State = (typeof State)[keyof typeof State];

export const IdleKind = { Stand: 0, LookAround: 1, Hop: 2, Phone: 3, Wave: 4 } as const;
export type IdleKind = (typeof IdleKind)[keyof typeof IdleKind];

export type SimEventKind = "bounce" | "bump" | "dizzy" | "arrive" | "bubble" | "chat";

export interface SimEvent {
  kind: SimEventKind;
  agent: number;
  x: number;
  y: number;
}

export interface AgentSpec {
  readonly id: string;
  /** Booth zone indexes (topic indexes) this person cares about, primary first. */
  readonly topics: readonly number[];
  readonly isYou: boolean;
}

export class Agent {
  active = false;
  id = "";
  topics: number[] = [];
  isYou = false;
  zone = 0;
  spot = -1;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  z = 0;
  vz = 0;
  vx = 0;
  vy = 0;
  tx = 0;
  ty = 0;
  wx = 0;
  wy = 0;
  hasWaypoint = false;
  state: State = State.Idle;
  t = 0;
  idleKind: IdleKind = IdleKind.Stand;
  speed = 50;
  facing = 1;
  flipTimer = 0;
  moving = false;
  walkPhase = 0;
  partner = -1;
  bubbleT = 0;
  airTime = 0;
}

const WALK_MIN = 36;
const WALK_MAX = 60;
const RUN_FACTOR = 2.7;
const SEPARATION_R = 12;
const GRAVITY = 1500;
const MAX_THROW_SPEED = 2600;
const CHAT_RADIUS = 46;
const WORLD_EDGE = 40;
export const BODY_CENTER_Y = 18;

interface ZoneSpots {
  readonly spots: Float32Array;
  readonly occupant: Int32Array;
}

export interface WorldOptions {
  readonly seed: number;
  /** Spot count per zone, same order as `layout.zones`. */
  readonly capacities: readonly number[];
  readonly reducedMotion?: boolean;
}

export class World {
  readonly agents: Agent[] = [];
  readonly events: SimEvent[] = [];
  eventCount = 0;
  time = 0;
  reducedMotion: boolean;
  private readonly grid: SpatialGrid;
  private readonly zoneSpots: ZoneSpots[];
  private readonly free: number[] = [];
  private readonly rng: Rng;
  private chatClock = 0;
  private sepIndex = -1;
  private sepX = 0;
  private sepY = 0;
  private sepPushX = 0;
  private sepPushY = 0;

  constructor(
    readonly layout: VenueLayout,
    options: WorldOptions,
  ) {
    this.rng = createRng(options.seed);
    this.reducedMotion = options.reducedMotion ?? false;
    this.grid = new SpatialGrid(32, layout.width, layout.height, 2048);
    this.zoneSpots = layout.zones.map((zone, i) => {
      const count = Math.max(8, Math.round(options.capacities[i] ?? 40));
      return {
        spots: sunflowerSpots(zone.x, zone.y, zone.r0 + 6, zone.r1 - 6, count),
        occupant: new Int32Array(count).fill(-1),
      };
    });
  }

  get activeCount(): number {
    return this.agents.length - this.free.length;
  }

  agent(index: number): Agent {
    const agent = this.agents[index];
    if (!agent) throw new Error(`No agent at index ${index}`);
    return agent;
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  spawn(spec: AgentSpec, at: "scatter" | "gate"): number {
    if (spec.topics.length === 0) {
      throw new Error(`Agent "${spec.id}" needs at least one topic to know which booth to visit`);
    }
    const index = this.free.pop() ?? this.agents.length;
    if (index === this.agents.length) this.agents.push(new Agent());
    const a = this.agent(index);
    Object.assign(a, new Agent());
    a.active = true;
    a.id = spec.id;
    a.topics = [...spec.topics];
    a.isYou = spec.isYou;
    a.speed = this.rng.range(WALK_MIN, WALK_MAX);
    a.facing = this.rng.chance(0.5) ? 1 : -1;

    if (at === "scatter") {
      a.zone = this.pickZone(a, this.rng.chance(0.04));
      this.claimSpot(index, a.zone);
      a.x = a.tx;
      a.y = a.ty;
      this.toIdle(a, this.rng.range(0.2, 7));
    } else {
      a.x = this.layout.gate.x + this.rng.range(-50, 50);
      a.y = this.layout.gate.y + this.rng.range(-10, 20);
      a.zone = a.topics[0] ?? 0;
      this.claimSpot(index, a.zone);
      this.route(a);
      a.state = State.Arriving;
    }
    a.px = a.x;
    a.py = a.y;
    return index;
  }

  remove(index: number): void {
    const a = this.agent(index);
    if (!a.active) return;
    this.endChat(a);
    this.releaseSpot(index);
    a.active = false;
    this.free.push(index);
  }

  // ---- interaction -------------------------------------------------------------------------

  /** Freeze an agent under the pointer so it is still there when a long-press completes. */
  hold(index: number): void {
    const a = this.agent(index);
    if (!a.active || a.state === State.Grabbed || a.state === State.Thrown) return;
    this.endChat(a);
    a.state = State.Held;
    a.moving = false;
  }

  unhold(index: number): void {
    const a = this.agent(index);
    if (a.state === State.Held) this.toIdle(a, this.rng.range(0.4, 1.5));
  }

  grab(index: number): void {
    const a = this.agent(index);
    if (!a.active) return;
    this.endChat(a);
    this.releaseSpot(index);
    a.state = State.Grabbed;
    a.moving = false;
    a.hasWaypoint = false;
    a.z = 26;
    a.vz = 0;
    a.vx = 0;
    a.vy = 0;
  }

  dragTo(index: number, x: number, y: number): void {
    const a = this.agent(index);
    if (a.state !== State.Grabbed) return;
    const nx = this.clampX(x);
    const ny = this.clampY(y);
    if (Math.abs(nx - a.x) > 0.5) a.facing = nx > a.x ? 1 : -1;
    a.x = nx;
    a.y = ny;
    a.px = nx;
    a.py = ny;
  }

  release(index: number, vx: number, vy: number): void {
    const a = this.agent(index);
    if (a.state !== State.Grabbed) return;
    if (this.reducedMotion) {
      a.z = 0;
      this.goHome(index);
      return;
    }
    const speed = Math.hypot(vx, vy);
    const scale = speed > MAX_THROW_SPEED ? MAX_THROW_SPEED / speed : 1;
    a.vx = vx * scale;
    a.vy = vy * scale;
    a.vz = 220 + Math.min(speed, MAX_THROW_SPEED) * 0.07;
    a.airTime = 0;
    a.state = State.Thrown;
  }

  /** Make an agent stop and wave (used when someone locates them). */
  wave(index: number): void {
    const a = this.agent(index);
    if (!a.active || a.state === State.Grabbed || a.state === State.Thrown) return;
    this.endChat(a);
    a.state = State.Idle;
    a.idleKind = IdleKind.Wave;
    a.t = 3;
    a.moving = false;
  }

  /** Front-most agent whose body is within `radius` of the world point, or -1. */
  pick(x: number, y: number, radius: number): number {
    let best = -1;
    let bestY = -Infinity;
    const r2 = radius * radius;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a?.active) continue;
      const dx = a.x - x;
      const dy = a.y - BODY_CENTER_Y - a.z - y;
      if (dx * dx + dy * dy <= r2 && a.y > bestY) {
        best = i;
        bestY = a.y;
      }
    }
    return best;
  }

  // ---- simulation --------------------------------------------------------------------------

  step(dt: number): void {
    this.eventCount = 0;
    this.time += dt;
    this.grid.clear();
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a?.active) this.grid.insert(i, a.x, a.y);
    }
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!a?.active) continue;
      a.px = a.x;
      a.py = a.y;
      this.updateAgent(i, a, dt);
    }
    this.chatClock -= dt;
    if (this.chatClock <= 0) {
      this.chatClock = 0.5;
      this.pairChats();
    }
  }

  private updateAgent(index: number, a: Agent, dt: number): void {
    switch (a.state) {
      case State.Idle:
        a.t -= dt;
        if (a.t <= 0) this.decideNext(index, a);
        break;
      case State.Chatting:
        this.updateChat(index, a, dt);
        break;
      case State.Wandering:
      case State.Commuting:
      case State.Arriving:
        if (this.moveToward(index, a, dt, a.state === State.Arriving ? 1.25 : 1)) this.arrive(index, a);
        break;
      case State.RunningHome:
        if (this.moveToward(index, a, dt, RUN_FACTOR)) this.arrive(index, a);
        break;
      case State.Thrown:
        this.updateThrown(index, a, dt);
        break;
      case State.Dizzy:
        a.t -= dt;
        if (a.t <= 0) this.goHome(index);
        break;
      case State.Held:
      case State.Grabbed:
        break;
    }
  }

  private decideNext(index: number, a: Agent): void {
    const roll = this.rng.next();
    const commuteChance = this.reducedMotion ? 0.06 : 0.2;
    const plaza = this.layout.plazaIndex;
    if (a.zone === plaza) {
      this.travel(index, a, this.pickZone(a, false), State.Commuting);
    } else if (a.topics.length > 1 && roll < commuteChance) {
      const others = a.topics.filter((t) => t !== a.zone);
      this.travel(index, a, this.rng.pick(others.length > 0 ? others : a.topics), State.Commuting);
    } else if (roll < commuteChance + 0.035) {
      this.travel(index, a, plaza, State.Commuting);
    } else if (roll < 0.68) {
      this.travel(index, a, a.zone, State.Wandering);
    } else {
      this.toIdle(a, this.idleDuration());
    }
  }

  private travel(index: number, a: Agent, zone: number, state: State): void {
    this.releaseSpot(index);
    a.zone = zone;
    this.claimSpot(index, zone);
    this.route(a);
    a.state = state;
  }

  private goHome(index: number): void {
    const a = this.agent(index);
    a.vx = 0;
    a.vy = 0;
    a.vz = 0;
    a.z = 0;
    this.releaseSpot(index);
    this.claimSpot(index, a.zone);
    this.route(a);
    a.state = State.RunningHome;
  }

  private arrive(index: number, a: Agent): void {
    const wasArriving = a.state === State.Arriving;
    const wasRunning = a.state === State.RunningHome;
    this.toIdle(a, this.idleDuration());
    if (wasRunning) a.idleKind = IdleKind.Hop;
    if (wasArriving) this.emit("arrive", index, a.x, a.y);
  }

  private toIdle(a: Agent, duration: number): void {
    a.state = State.Idle;
    a.t = duration;
    a.moving = false;
    a.hasWaypoint = false;
    a.idleKind = this.rng.weighted([5, 2, 1.2, 1.6]) as IdleKind;
  }

  private idleDuration(): number {
    return this.reducedMotion ? this.rng.range(6, 14) : this.rng.range(1.8, 7);
  }

  // ---- movement ----------------------------------------------------------------------------

  /** Moves toward the waypoint/target; returns true on reaching the final target. */
  private moveToward(index: number, a: Agent, dt: number, factor: number): boolean {
    const goalX = a.hasWaypoint ? a.wx : a.tx;
    const goalY = a.hasWaypoint ? a.wy : a.ty;
    const dx = goalX - a.x;
    const dy = goalY - a.y;
    const dist = Math.hypot(dx, dy);
    const stride = a.speed * factor * dt;
    a.moving = true;
    a.walkPhase += stride * 0.22;
    this.updateFacing(a, dx, dt);
    if (dist <= stride) {
      a.x = goalX;
      a.y = goalY;
      if (!a.hasWaypoint) return true;
      a.hasWaypoint = false;
      return false;
    }
    a.x += (dx / dist) * stride;
    a.y += (dy / dist) * stride;
    this.separate(index, a, stride);
    this.pushOutOfObstacles(a);
    return false;
  }

  private updateFacing(a: Agent, dx: number, dt: number): void {
    if (Math.abs(dx) < 0.5) return;
    const desired = dx > 0 ? 1 : -1;
    if (desired === a.facing) {
      a.flipTimer = 0;
      return;
    }
    a.flipTimer += dt;
    if (a.flipTimer > 0.12) {
      a.facing = desired;
      a.flipTimer = 0;
    }
  }

  private readonly visitSeparation = (other: number, distSq: number): void => {
    if (other === this.sepIndex || distSq < 0.0001) return;
    const b = this.agents[other];
    if (!b) return;
    const dist = Math.sqrt(distSq);
    const push = (SEPARATION_R - dist) / SEPARATION_R;
    this.sepPushX += ((this.sepX - b.x) / dist) * push;
    this.sepPushY += ((this.sepY - b.y) / dist) * push;
  };

  private separate(index: number, a: Agent, stride: number): void {
    this.sepIndex = index;
    this.sepX = a.x;
    this.sepY = a.y;
    this.sepPushX = 0;
    this.sepPushY = 0;
    this.grid.forEachNear(a.x, a.y, SEPARATION_R, this.visitSeparation);
    a.x += this.sepPushX * stride * 0.6;
    a.y += this.sepPushY * stride * 0.6;
  }

  private pushOutOfObstacles(a: Agent): boolean {
    let hit = false;
    for (const zone of this.layout.zones) {
      const o = zone.obstacle;
      const dx = a.x - o.x;
      const dy = a.y - o.y;
      const dist = Math.hypot(dx, dy);
      if (dist < o.r) {
        const nx = dist > 0.001 ? dx / dist : 0;
        const ny = dist > 0.001 ? dy / dist : 1;
        a.x = o.x + nx * o.r;
        a.y = o.y + ny * o.r;
        if (a.state === State.Thrown) {
          const dot = a.vx * nx + a.vy * ny;
          if (dot < 0) {
            a.vx -= 1.55 * dot * nx;
            a.vy -= 1.55 * dot * ny;
          }
        }
        hit = true;
      }
    }
    return hit;
  }

  private route(a: Agent): void {
    a.hasWaypoint = false;
    const target = this.layout.zones[a.zone];
    for (const zone of this.layout.zones) {
      if (zone === target) continue;
      if (segmentHitsCircle(a.x, a.y, a.tx, a.ty, zone.obstacle)) {
        this.setPlazaWaypoint(a);
        return;
      }
    }
  }

  private setPlazaWaypoint(a: Agent): void {
    const plaza = this.layout.zones[this.layout.plazaIndex] as Zone;
    const dx = a.tx - plaza.x;
    const dy = a.ty - plaza.y;
    const len = Math.hypot(dx, dy) || 1;
    const r = plaza.r1 + 26;
    a.wx = plaza.x + (dx / len) * r + this.rng.range(-24, 24);
    a.wy = plaza.y + (dy / len) * r + this.rng.range(-24, 24);
    a.hasWaypoint = true;
  }

  // ---- throwing ----------------------------------------------------------------------------

  private updateThrown(index: number, a: Agent, dt: number): void {
    a.airTime += dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.vz -= GRAVITY * dt;
    a.z += a.vz * dt;
    const drag = a.z > 0 ? Math.exp(-0.5 * dt) : Math.exp(-5.5 * dt);
    a.vx *= drag;
    a.vy *= drag;
    if (Math.abs(a.vx) > 4) a.facing = a.vx > 0 ? 1 : -1;

    if (a.z <= 0) {
      a.z = 0;
      if (a.vz < -140) {
        a.vz = -a.vz * 0.42;
        this.emit("bounce", index, a.x, a.y);
      } else {
        a.vz = 0;
      }
    }
    this.bounceOffWalls(index, a);
    if (this.pushOutOfObstacles(a)) this.emit("bump", index, a.x, a.y);

    const settled = a.z === 0 && a.vz === 0 && Math.hypot(a.vx, a.vy) < 28;
    if (settled || a.airTime > 6) {
      a.z = 0;
      a.vx = 0;
      a.vy = 0;
      a.state = State.Dizzy;
      a.t = 1.4;
      this.emit("dizzy", index, a.x, a.y);
    }
  }

  private bounceOffWalls(index: number, a: Agent): void {
    const minX = WORLD_EDGE;
    const maxX = this.layout.width - WORLD_EDGE;
    const minY = WORLD_EDGE + 30;
    const maxY = this.layout.height - WORLD_EDGE;
    let bumped = false;
    if (a.x < minX || a.x > maxX) {
      a.x = Math.min(maxX, Math.max(minX, a.x));
      a.vx = -a.vx * 0.6;
      bumped = true;
    }
    if (a.y < minY || a.y > maxY) {
      a.y = Math.min(maxY, Math.max(minY, a.y));
      a.vy = -a.vy * 0.6;
      bumped = true;
    }
    if (bumped) this.emit("bump", index, a.x, a.y);
  }

  private clampX(x: number): number {
    return Math.min(this.layout.width - WORLD_EDGE, Math.max(WORLD_EDGE, x));
  }

  private clampY(y: number): number {
    return Math.min(this.layout.height - WORLD_EDGE, Math.max(WORLD_EDGE + 30, y));
  }

  // ---- chatting ----------------------------------------------------------------------------

  private pairChats(): void {
    const chance = this.reducedMotion ? 0.04 : 0.14;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (!this.canChat(a) || !a || !this.rng.chance(chance)) continue;
      let partner = -1;
      let best = Infinity;
      this.grid.forEachNear(a.x, a.y, CHAT_RADIUS, (j, distSq) => {
        const b = this.agents[j];
        if (j !== i && distSq < best && this.canChat(b) && b?.zone === a.zone) {
          partner = j;
          best = distSq;
        }
      });
      if (partner >= 0) this.startChat(i, partner);
    }
  }

  private canChat(a: Agent | undefined): boolean {
    return !!a && a.active && a.state === State.Idle && a.partner === -1 && a.t > 1.5;
  }

  private startChat(i: number, j: number): void {
    const a = this.agent(i);
    const b = this.agent(j);
    const duration = this.rng.range(3.5, 6.5);
    for (const [self, other, otherIndex, delay] of [
      [a, b, j, 0.25],
      [b, a, i, 1.1],
    ] as const) {
      self.state = State.Chatting;
      self.t = duration;
      self.partner = otherIndex;
      self.bubbleT = delay;
      self.moving = false;
      self.facing = other.x >= self.x ? 1 : -1;
    }
    this.emit("chat", i, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  private updateChat(index: number, a: Agent, dt: number): void {
    a.t -= dt;
    a.bubbleT -= dt;
    if (a.bubbleT <= 0) {
      a.bubbleT = this.rng.range(1.4, 2.6);
      this.emit("bubble", index, a.x, a.y);
    }
    if (a.t <= 0) this.endChat(a);
  }

  private endChat(a: Agent): void {
    if (a.partner < 0) return;
    const partner = this.agents[a.partner];
    a.partner = -1;
    if (a.state === State.Chatting) this.toIdle(a, this.rng.range(0.5, 2.5));
    if (partner && partner.partner >= 0) {
      partner.partner = -1;
      if (partner.state === State.Chatting) this.toIdle(partner, this.rng.range(0.5, 2.5));
    }
  }

  // ---- zones and spots ---------------------------------------------------------------------

  private pickZone(a: Agent, allowPlaza: boolean): number {
    if (allowPlaza) return this.layout.plazaIndex;
    if (a.topics.length === 1) return a.topics[0] ?? 0;
    const weights = a.topics.map((_, i) => (i === 0 ? 0.55 : 0.45 / (a.topics.length - 1)));
    return a.topics[this.rng.weighted(weights)] ?? 0;
  }

  private claimSpot(index: number, zoneIndex: number): void {
    const a = this.agent(index);
    const zs = this.zoneSpots[zoneIndex];
    const zone = this.layout.zones[zoneIndex];
    if (!zs || !zone) throw new Error(`Zone ${zoneIndex} does not exist`);
    const count = zs.occupant.length;
    for (let attempt = 0; attempt < 10; attempt++) {
      const spot = this.rng.int(count);
      if (zs.occupant[spot] === -1) {
        zs.occupant[spot] = index;
        a.spot = spot;
        a.tx = zs.spots[spot * 2] ?? zone.x;
        a.ty = zs.spots[spot * 2 + 1] ?? zone.y;
        return;
      }
    }
    a.spot = -1;
    const angle = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(zone.r0 + 8, zone.r1);
    a.tx = zone.x + Math.cos(angle) * r;
    a.ty = zone.y + Math.sin(angle) * r;
  }

  private releaseSpot(index: number): void {
    const a = this.agent(index);
    if (a.spot < 0) return;
    const zs = this.zoneSpots[a.zone];
    if (zs && zs.occupant[a.spot] === index) zs.occupant[a.spot] = -1;
    a.spot = -1;
  }

  private emit(kind: SimEventKind, agent: number, x: number, y: number): void {
    const existing = this.events[this.eventCount];
    if (existing) {
      existing.kind = kind;
      existing.agent = agent;
      existing.x = x;
      existing.y = y;
    } else {
      this.events.push({ kind, agent, x, y });
    }
    this.eventCount++;
  }
}
