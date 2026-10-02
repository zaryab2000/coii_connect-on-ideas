import { describe, expect, it } from "vitest";

import { createController } from "@/app/controller";
import type { MeetClock } from "@/app/meet";
import { pointsReader } from "@/app/points";
import { generateDemo } from "@/data/generateDemo";
import { FakeEngine } from "@/engine/fake";
import { leaderboard } from "@/match/points";

const CROWD = generateDemo({ seed: 9, count: 200, reserve: 0, now: 0 }).people;

function fakeClock() {
  let now = Date.UTC(2026, 10, 3, 6, 0);
  let roll = 0.42;
  const timers: { at: number; fn: () => void; done: boolean }[] = [];
  const clock: MeetClock = {
    now: () => now,
    random: () => {
      roll = ((roll * 9301 + 49297) % 233280) / 233280;
      return roll;
    },
    schedule(fn, ms) {
      const timer = { at: now + ms, fn, done: false };
      timers.push(timer);
      return () => {
        timer.done = true;
      };
    },
  };
  /** Advances time in small steps so timers scheduled by timers also fire. */
  const advance = (ms: number): void => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 500);
      for (const timer of timers.filter((t) => !t.done && t.at <= now)) {
        timer.done = true;
        timer.fn();
      }
    }
  };
  return { clock, advance };
}

function setup() {
  const engine = new FakeEngine();
  const { clock, advance } = fakeClock();
  const controller = createController(engine, {
    people: CROWD,
    you: null,
    reducedMotion: false,
    clock,
  });
  return { engine, advance, controller, store: controller.store };
}

function total(state: ReturnType<typeof setup>["store"]): number {
  const s = state.get();
  const read = pointsReader(s);
  return s.people.reduce((sum, p) => sum + read(p), 0);
}

describe("live wave points", () => {
  it("crowns the top three as soon as the venue opens", () => {
    const { engine, store } = setup();
    const crowned = engine.calls.find((c) => c.method === "setCrowns")?.args[0];
    const top = leaderboard(store.get().people, pointsReader(store.get()))
      .slice(0, 3)
      .map((r) => r.person.id);
    expect(crowned).toEqual(top);
  });

  it("lets the demo crowd wave at each other every few seconds, one point at a time", () => {
    const { controller, store, advance, engine } = setup();
    const before = total(store);
    const stop = controller.startDemoWaves();
    advance(60_000);
    stop();
    const waves = total(store) - before;
    expect(waves).toBeGreaterThanOrEqual(10);
    expect(waves).toBeLessThanOrEqual(24);
    expect(engine.calls.filter((c) => c.method === "pointPop")).toHaveLength(waves);
    expect(store.get().points.lastBump).not.toBeNull();
    const after = total(store);
    advance(60_000);
    expect(total(store)).toBe(after);
  });
});
