import { describe, expect, it } from "vitest";

import { generateDemo } from "@/data/generateDemo";
import type { Person } from "@/data/types";
import {
  chaseTarget,
  demoBasePoints,
  demoWaveTarget,
  leaderboard,
  rankOf,
  topIds,
} from "@/match/points";

const CROWD = generateDemo({ seed: 7, count: 800, reserve: 0, now: 0 }).people;

function named(name: string, isDemo = true): Person {
  const base = CROWD[0];
  if (!base) throw new Error("expected a demo crowd");
  return { ...base, id: `id-${name}`, name, isDemo, isYou: !isDemo };
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("demo starting points", () => {
  it("are a long tail: most people have a few, a handful have dozens", () => {
    const points = CROWD.map(demoBasePoints).toSorted((a, b) => a - b);
    const median = points[Math.floor(points.length / 2)] ?? 0;
    const top = points.at(-1) ?? 0;
    expect(median).toBeLessThan(12);
    expect(top).toBeGreaterThan(30);
    expect(points.every((p) => p >= 0 && Number.isInteger(p))).toBe(true);
  });

  it("are stable for a person and zero for real people", () => {
    const someone = CROWD[3];
    if (!someone) throw new Error("expected a demo crowd");
    expect(demoBasePoints(someone)).toBe(demoBasePoints({ ...someone }));
    expect(demoBasePoints({ ...someone, isDemo: false })).toBe(0);
  });
});

describe("leaderboard", () => {
  it("ranks by points with shared ranks for ties, then by name", () => {
    const people = [named("Cara"), named("Asha"), named("Bo"), named("Dev")];
    const points: Record<string, number> = { Cara: 5, Asha: 9, Bo: 5, Dev: 1 };
    const rows = leaderboard(people, (p) => points[p.name] ?? 0);
    expect(rows.map((r) => [r.person.name, r.rank])).toEqual([
      ["Asha", 1],
      ["Bo", 2],
      ["Cara", 2],
      ["Dev", 4],
    ]);
  });

  it("tells you who to chase next and how many waves it takes", () => {
    const people = [named("Asha"), named("Bo"), named("Cara"), named("You")];
    const points: Record<string, number> = { Asha: 9, Bo: 5, Cara: 5, You: 5 };
    const read = (p: Person): number => points[p.name] ?? 0;
    const rows = leaderboard(people, read);
    expect(chaseTarget(rows, "id-You")).toEqual({ person: people[0], need: 5 });
    expect(chaseTarget(rows, "id-Asha")).toBeNull();
    expect(rankOf(people, read, people[3] as Person)).toBe(2);
  });

  it("crowns only people who actually have points", () => {
    const people = [named("A"), named("B"), named("C")];
    const rows = leaderboard(people, (p) => (p.name === "A" ? 3 : 0));
    expect(topIds(rows, 3)).toEqual(["id-A"]);
  });
});

describe("demo wave targets", () => {
  it("only go to demo people and favour catchy one-liners", () => {
    const quiet = { ...named("Quiet"), oneLiners: [] };
    const catchy = { ...named("Catchy"), oneLiners: ["one", "two", "three"] };
    const real = named("Real", false);
    const random = seeded(11);
    const hits = { Quiet: 0, Catchy: 0, Real: 0 } as Record<string, number>;
    for (let i = 0; i < 2000; i++) {
      const target = demoWaveTarget([quiet, catchy, real], () => 0, random);
      if (target) hits[target.name] = (hits[target.name] ?? 0) + 1;
    }
    expect(hits["Real"]).toBe(0);
    expect(hits["Catchy"] ?? 0).toBeGreaterThan((hits["Quiet"] ?? 0) * 3);
  });
});
