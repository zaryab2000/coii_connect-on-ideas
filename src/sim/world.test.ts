import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { generateDemo } from "@/data/generateDemo";
import { topicIndex } from "@/data/topics";
import { zoneCapacities } from "@/sim/capacity";
import { computeLayout } from "@/sim/layout";
import type { LayoutMode } from "@/sim/layout";
import { State, World } from "@/sim/world";

const DT = 1 / 30;

function makeWorld(mode: LayoutMode = "landscape", count = 400): World {
  const crowd = generateDemo({ seed: 7, count, reserve: 50, now: Date.UTC(2026, 9, 1) });
  const topicLists = crowd.people.map((p) => p.topics.map(topicIndex));
  const capacities = zoneCapacities(topicLists, 10);
  const layout = computeLayout(mode, capacities.slice(0, 10), capacities[10] ?? 40);
  const world = new World(layout, { seed: 11, capacities });
  crowd.people.forEach((p, i) =>
    world.spawn({ id: p.id, topics: topicLists[i] ?? [0], isYou: false }, "scatter"),
  );
  return world;
}

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) world.step(DT);
}

function expectInsideWorldAndOutsideObstacles(world: World): void {
  for (const a of world.agents) {
    if (!a.active || a.state === State.Grabbed || a.state === State.Held) continue;
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x).toBeLessThanOrEqual(world.layout.width);
    expect(a.y).toBeLessThanOrEqual(world.layout.height);
    for (const zone of world.layout.zones) {
      const d = Math.hypot(a.x - zone.obstacle.x, a.y - zone.obstacle.y);
      expect(d).toBeGreaterThanOrEqual(zone.obstacle.r - 0.5);
    }
  }
}

describe("World", () => {
  it("keeps everyone inside the venue and out of the booths while living", () => {
    for (const mode of ["landscape", "portrait"] as const) {
      const world = makeWorld(mode);
      run(world, 40);
      expectInsideWorldAndOutsideObstacles(world);
    }
  });

  it("produces movement and chats so the venue looks alive", () => {
    const world = makeWorld();
    let movingSeen = 0;
    let chats = 0;
    for (let t = 0; t < 20; t += DT) {
      world.step(DT);
      for (let e = 0; e < world.eventCount; e++) if (world.events[e]?.kind === "chat") chats++;
      if (Math.round(t * 30) % 30 === 0)
        movingSeen = Math.max(movingSeen, world.agents.filter((a) => a.moving).length);
    }
    expect(movingSeen).toBeGreaterThan(20);
    expect(chats).toBeGreaterThan(5);
  });

  it("sends a thrown person through dizzy and back home to an idle spot", () => {
    const world = makeWorld();
    const index = 3;
    const agent = world.agent(index);
    const homeZone = agent.zone;
    world.grab(index);
    expect(agent.state).toBe(State.Grabbed);
    world.dragTo(index, world.layout.width / 2, world.layout.height / 2);
    world.release(index, 1800, -900);
    expect(agent.state).toBe(State.Thrown);

    const seen = new Set<number>();
    for (let t = 0; t < 30 && agent.state !== State.Idle; t += DT) {
      world.step(DT);
      seen.add(agent.state);
    }
    expect(seen.has(State.Dizzy)).toBe(true);
    expect(seen.has(State.RunningHome)).toBe(true);
    expect(agent.state).toBe(State.Idle);
    expect(agent.zone).toBe(homeZone);
    const zone = world.layout.zones[homeZone]!;
    expect(Math.hypot(agent.x - zone.x, agent.y - zone.y)).toBeLessThanOrEqual(zone.r1 + 1);
  });

  it("ends a chat for both people when one of them is grabbed", () => {
    const world = makeWorld();
    let pair: [number, number] | null = null;
    for (let t = 0; t < 20 && !pair; t += DT) {
      world.step(DT);
      const i = world.agents.findIndex((a) => a.state === State.Chatting);
      if (i >= 0) pair = [i, world.agent(i).partner];
    }
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    world.grab(a);
    expect(world.agent(b).state).not.toBe(State.Chatting);
    expect(world.agent(b).partner).toBe(-1);
    expect(world.agent(a).partner).toBe(-1);
  });

  it("walks a new arrival from the gate to their booth", () => {
    const world = makeWorld("portrait", 100);
    const index = world.spawn({ id: "new", topics: [4], isYou: true }, "gate");
    let arrived = false;
    for (let t = 0; t < 120 && !arrived; t += DT) {
      world.step(DT);
      for (let e = 0; e < world.eventCount; e++) {
        const ev = world.events[e];
        if (ev?.kind === "arrive" && ev.agent === index) arrived = true;
      }
    }
    expect(arrived).toBe(true);
    const zone = world.layout.zones[4]!;
    const a = world.agent(index);
    expect(Math.hypot(a.x - zone.x, a.y - zone.y)).toBeLessThanOrEqual(zone.r1 + 1);
  });

  it("survives random grabs and throws without leaving the venue", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            agent: fc.integer({ min: 0, max: 199 }),
            x: fc.float({ min: -500, max: 6000, noNaN: true }),
            y: fc.float({ min: -500, max: 6000, noNaN: true }),
            vx: fc.float({ min: -5000, max: 5000, noNaN: true }),
            vy: fc.float({ min: -5000, max: 5000, noNaN: true }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (throws) => {
          const world = makeWorld("landscape", 200);
          for (const th of throws) {
            world.grab(th.agent);
            world.dragTo(th.agent, th.x, th.y);
            world.release(th.agent, th.vx, th.vy);
            run(world, 0.5);
          }
          run(world, 8);
          expectInsideWorldAndOutsideObstacles(world);
        },
      ),
      { numRuns: 15 },
    );
  });

  it("reuses slots of removed people", () => {
    const world = makeWorld("landscape", 50);
    const before = world.agents.length;
    world.remove(10);
    expect(world.activeCount).toBe(before - 1);
    const index = world.spawn({ id: "again", topics: [1], isYou: false }, "gate");
    expect(index).toBe(10);
    expect(world.agents.length).toBe(before);
  });

  it("picks the front-most person under the pointer", () => {
    const world = makeWorld("landscape", 30);
    const a = world.agent(0);
    const hit = world.pick(a.x, a.y - 18, 10);
    expect(hit).toBeGreaterThanOrEqual(0);
    expect(world.pick(-1000, -1000, 10)).toBe(-1);
  });

  it("walks two people up to each other for a chai and clinks once both arrive", () => {
    const world = makeWorld("landscape", 200);
    let clinks = 0;
    world.rendezvous(5, 150);
    for (let t = 0; t < 60 && clinks === 0; t += DT) {
      world.step(DT);
      for (let e = 0; e < world.eventCount; e++) if (world.events[e]?.kind === "clink") clinks++;
    }
    expect(clinks).toBe(1);
    const a = world.agent(5);
    const b = world.agent(150);
    expect(a.state).toBe(State.Chatting);
    expect(a.partner).toBe(150);
    expect(b.partner).toBe(5);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(40);
  });
});
