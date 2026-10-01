import { describe, expect, it } from "vitest";

import { createController } from "@/app/controller";
import type { JoinInput } from "@/app/controller";
import { WAVES_PER_DAY } from "@/app/meet";
import type { MeetClock } from "@/app/meet";
import type { AppState, MeetView, Store } from "@/app/store";
import { generateDemo } from "@/data/generateDemo";
import { FakeEngine } from "@/engine/fake";

const START = Date.UTC(2026, 10, 3, 5, 0); // 3 Nov 2026, 10:30 IST

/** Deterministic time, randomness and timers. */
function fakeClock(seed = 0.31) {
  let now = START;
  let roll = seed;
  const timers: { at: number; fn: () => void; cancelled: boolean }[] = [];
  const clock: MeetClock = {
    now: () => now,
    random: () => {
      roll = ((roll * 9301 + 49297) % 233280) / 233280;
      return roll;
    },
    schedule(fn, ms) {
      const timer = { at: now + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  const advance = (ms: number): void => {
    now += ms;
    for (const timer of timers.toSorted((a, b) => a.at - b.at)) {
      if (!timer.cancelled && timer.at <= now) {
        timer.cancelled = true;
        timer.fn();
      }
    }
  };
  return { clock, advance };
}

function meetOf(store: Store<AppState>): MeetView {
  const meet = store.get().meet;
  if (!meet) throw new Error("expected Meet to be active after joining");
  return meet;
}

/** First argument of the most recent engine call with this name. */
function lastCall(engine: FakeEngine, method: string): unknown {
  const calls = engine.calls.filter((c) => c.method === method);
  return calls[calls.length - 1]?.args[0];
}

const CROWD = generateDemo({ seed: 5, count: 300, reserve: 0, now: START }).people;
const JOIN: JoinInput = {
  name: "Zara Khan",
  telegram: "zara_builds",
  x: null,
  topics: ["privacy", "core"],
  intent: ["job_hunting"],
  oneLiner: "private payments",
  avatar: { skin: 1, hair: 0, hairColor: 0, accessory: 0 },
};

function setup(seed?: number) {
  const engine = new FakeEngine();
  const { clock, advance } = fakeClock(seed);
  const controller = createController(engine, {
    people: CROWD,
    you: null,
    reducedMotion: false,
    clock,
  });
  return { engine, advance, store: controller.store, actions: controller.actions };
}

describe("Meet", () => {
  it("has nothing to show until you join, then deals three picks", () => {
    const { store, actions } = setup();
    expect(store.get().meet).toBeNull();
    actions.join(JOIN);
    const meet = store.get().meet;
    expect(meet?.hand).toHaveLength(3);
    expect(meet?.wavesLeft).toBe(WAVES_PER_DAY);
    expect(meet?.revealed).toEqual([]);
  });

  it("shows sparkles only for cards you have revealed", () => {
    const { store, actions, engine } = setup();
    actions.join(JOIN);
    const first = store.get().meet?.hand[0]?.personId ?? "";
    actions.revealCard(first);
    expect(store.get().meet?.revealed).toEqual([first]);
    expect(lastCall(engine, "setPicks")).toEqual([first]);
  });

  it("enforces the daily wave quota and refuses double waves", () => {
    const { store, actions } = setup();
    actions.join(JOIN);
    const targets = CROWD.slice(0, WAVES_PER_DAY + 1);
    const results = targets.map((p) => actions.wave(p.id));
    expect(results.at(-1)).toBe("quota");
    expect(actions.wave(targets[0]?.id ?? "")).toBe("already");
    expect(store.get().meet?.wavesLeft).toBe(0);
  });

  it("turns waves at demo people into a chai after their simulated reply", () => {
    const { store, actions, advance, engine } = setup();
    actions.join(JOIN);
    for (const p of CROWD.slice(0, 15)) actions.wave(p.id);
    advance(30_000);
    const chais = store.get().meet?.chais ?? [];
    expect(chais.length).toBeGreaterThan(0);
    expect(chais.every((c) => c.demo && c.status === "new")).toBe(true);
    expect(store.get().meet?.celebrate).toBe(chais[0]?.personId);
    expect(engine.calls.some((c) => c.method === "chaiMoment")).toBe(true);
  });

  it("never reveals who waved at you, only how many", () => {
    const { store, actions } = setup();
    actions.join(JOIN);
    const meet = store.get().meet;
    expect(typeof meet?.inbound).toBe("number");
    expect(Object.keys(meet ?? {})).not.toContain("inboundIds");
  });

  it("cancels a pending demo reply when you take the wave back", () => {
    const { store, actions, advance } = setup();
    actions.join(JOIN);
    for (const p of CROWD.slice(0, 15)) {
      actions.wave(p.id);
      actions.unwave(p.id);
    }
    advance(30_000);
    expect(store.get().meet?.chais.filter((c) => !c.personId.startsWith("you"))).toEqual([]);
  });

  it("rewards meeting in person with a bonus card in today's hand", () => {
    const { store, actions, advance } = setup();
    actions.join(JOIN);
    for (const p of CROWD.slice(0, 15)) actions.wave(p.id);
    advance(30_000);
    const [chai] = meetOf(store).chais;
    if (!chai) throw new Error("expected a demo chai within 30s");
    actions.dismissChai();
    expect(meetOf(store).celebrate).not.toBe(chai.personId);
    actions.confirmMet(chai.personId);
    expect(meetOf(store).hand).toHaveLength(4);
    expect(meetOf(store).chais.find((c) => c.personId === chai.personId)).toMatchObject({
      status: "met",
    });
  });

  it("deals a new hand at 06:00 IST and keeps skipped people out of it", () => {
    const { store, actions, advance } = setup();
    actions.join(JOIN);
    const dayOne = store.get().meet;
    const skipped = dayOne?.hand[0]?.personId ?? "";
    actions.skip(skipped);
    advance(24 * 3_600_000);
    const dayTwo = store.get().meet;
    expect(dayTwo?.day).not.toBe(dayOne?.day);
    expect(dayTwo?.hand.map((c) => c.personId)).not.toContain(skipped);
  });

  it("toggles My tribe on the map and clears everything when you leave", () => {
    const { store, actions, engine } = setup();
    actions.join(JOIN);
    actions.toggleTribe();
    expect(store.get().tribe).toBe(true);
    const lit = lastCall(engine, "highlightPeople") as string[];
    expect(lit.length).toBeGreaterThan(0);
    actions.leave();
    expect(store.get().meet).toBeNull();
    expect(store.get().tribe).toBe(false);
  });
});
