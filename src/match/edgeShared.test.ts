import { dealFromInputs, toPerson } from "@functions/_shared/deal.ts";
import type { HandInputs, InputPerson } from "@functions/_shared/deal.ts";
import { SHARED_MODULES, sharedCopy, sharedPath } from "@scripts/shared-copy";
import { describe, expect, it } from "vitest";

import { generateDemo } from "@/data/generateDemo";
import type { Person } from "@/data/types";
import { meetDay } from "@/match/day";
import { buildHand, exposureCap } from "@/match/hand";

const SOURCES = import.meta.glob<string>("/src/{data,match}/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const COPIES = import.meta.glob<string>("/supabase/functions/_shared/{data,match}/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("Edge Function copies of the matching code", () => {
  it.each(SHARED_MODULES)("_shared/%s.ts matches src (run `pnpm sync:shared`)", (module) => {
    const source = SOURCES[`/src/${module}.ts`];
    if (source === undefined) throw new Error(`src/${module}.ts is missing`);
    expect(COPIES[`/${sharedPath(module)}`]).toBe(sharedCopy(module, source));
  });

  it("rewrites imports to relative .ts paths and refuses unshared ones", () => {
    const copy = sharedCopy("match/hand", 'import { x } from "@/data/affinity";');
    expect(copy).toContain('from "../data/affinity.ts"');
    expect(() => sharedCopy("match/hand", 'import { x } from "@/ui/meet";')).toThrow(/ui\/meet/);
  });
});

function asInput(p: Person): InputPerson {
  return {
    id: p.id,
    name: p.name,
    topics: p.topics,
    intents: p.intent,
    one_liners: p.oneLiners,
    joined_at: new Date(p.joinedAt).toISOString(),
    source: p.isDemo ? "demo" : "self",
  };
}

const NOW = Date.UTC(2026, 10, 3, 6, 0);
const CROWD = generateDemo({ seed: 31, count: 400, reserve: 0, now: NOW }).people;
const VIEWER = CROWD[0] as Person;
const OTHERS = CROWD.slice(1);

function inputs(patch: Partial<HandInputs> = {}): HandInputs {
  return {
    day: meetDay(NOW),
    now: new Date(NOW).toISOString(),
    viewer: asInput(VIEWER),
    candidates: OTHERS.map(asInput),
    excluded: [],
    recent_hands: [],
    waved_at_viewer: [],
    inbound: {},
    exposure: {},
    hands_today: 0,
    hand: null,
    ...patch,
  };
}

describe("deal-hand", () => {
  it("deals the same hand as the demo for the same inputs", () => {
    const waved = OTHERS.slice(5, 9).map((p) => p.id);
    const excluded = OTHERS.slice(0, 3).map((p) => p.id);
    const demo = buildHand({
      viewer: { ...VIEWER, isYou: true },
      people: [{ ...VIEWER, isYou: true }, ...OTHERS],
      day: meetDay(NOW),
      size: 3,
      context: {
        now: NOW,
        shownBefore: new Map(),
        wavedAtViewer: new Set(waved),
        inbound: new Map(),
      },
      eligibility: { excluded: new Set(excluded), allowDemo: true },
      exposure: { counts: new Map(), cap: exposureCap(0) },
    });
    const server = dealFromInputs(inputs({ waved_at_viewer: waved, excluded }));
    expect(server).toEqual(demo);
    expect(server).toHaveLength(3);
    expect(server.some((card) => excluded.includes(card.personId))).toBe(false);
  });

  it("keeps today's cards and adds one per bonus", () => {
    const first = dealFromInputs(inputs());
    const grown = dealFromInputs(inputs({ hand: { cards: first, bonus: 1 } }));
    expect(grown).toHaveLength(4);
    expect(grown.slice(0, 3)).toEqual(first);
  });

  it("maps the database row to a Person the matching code understands", () => {
    const person = toPerson(asInput(VIEWER), false);
    expect(person).toMatchObject({
      id: VIEWER.id,
      topics: VIEWER.topics,
      intent: VIEWER.intent,
      oneLiners: VIEWER.oneLiners,
      isDemo: true,
      isYou: false,
      joinedAt: VIEWER.joinedAt,
    });
  });
});
