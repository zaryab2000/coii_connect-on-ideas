import { describe, expect, it } from "vitest";

import { generateDemo } from "@/data/generateDemo";
import { containsLink, normalizeTelegram, normalizeX } from "@/data/handles";
import { GENERAL_ONE_LINERS, ONE_LINERS } from "@/data/oneLiners";
import { TOPIC_IDS } from "@/data/types";
import type { TopicId } from "@/data/types";

const OPTIONS = { seed: 2026, count: 1500, reserve: 300, now: Date.UTC(2026, 9, 1) };

describe("generateDemo", () => {
  const crowd = generateDemo(OPTIONS);
  const everyone = [...crowd.people, ...crowd.reserve];

  it("is deterministic for a seed", () => {
    const again = generateDemo(OPTIONS);
    expect(again.people.map((p) => p.name)).toEqual(crowd.people.map((p) => p.name));
    expect(again.reserve.map((p) => p.telegram)).toEqual(crowd.reserve.map((p) => p.telegram));
  });

  it("splits exactly 70% Indian and 30% international names", () => {
    expect(crowd.people).toHaveLength(1500);
    expect(crowd.people.filter((p) => p.origin === "india")).toHaveLength(1050);
    expect(crowd.reserve.filter((p) => p.origin === "india")).toHaveLength(210);
  });

  it("gives everyone 1 to 3 distinct topics", () => {
    for (const person of everyone) {
      expect(person.topics.length).toBeGreaterThanOrEqual(1);
      expect(person.topics.length).toBeLessThanOrEqual(3);
      expect(new Set(person.topics).size).toBe(person.topics.length);
    }
  });

  it("creates unique ids and valid, unique demo handles", () => {
    expect(new Set(everyone.map((p) => p.id)).size).toBe(everyone.length);
    const telegrams = everyone.map((p) => p.telegram ?? "");
    expect(new Set(telegrams).size).toBe(everyone.length);
    for (const handle of telegrams) {
      expect(handle.startsWith("demo_")).toBe(true);
      expect(normalizeTelegram(handle)).toEqual({ ok: true, value: handle });
    }
    const xs = everyone.flatMap((p) => (p.x ? [p.x] : []));
    expect(new Set(xs).size).toBe(xs.length);
    for (const handle of xs) {
      expect(normalizeX(handle)).toEqual({ ok: true, value: handle });
    }
  });

  it("gives people 0 to 3 distinct one-liners from the demo pools, most at least one", () => {
    const known = new Set([...Object.values(ONE_LINERS).flat(), ...GENERAL_ONE_LINERS]);
    for (const person of everyone) {
      expect(person.oneLiners.length).toBeLessThanOrEqual(3);
      expect(new Set(person.oneLiners).size).toBe(person.oneLiners.length);
      for (const line of person.oneLiners) expect(known.has(line)).toBe(true);
    }
    const withLines = everyone.filter((p) => p.oneLiners.length > 0).length;
    expect(withLines / everyone.length).toBeGreaterThan(0.8);
    expect(everyone.some((p) => p.oneLiners.some((l) => GENERAL_ONE_LINERS.includes(l)))).toBe(
      true,
    );
  });

  it("marks every generated person as demo data", () => {
    expect(everyone.every((p) => p.isDemo && !p.isYou)).toBe(true);
  });

  it("produces the intended popular topic pairings", () => {
    const pairs = new Map<string, number>();
    for (const person of everyone) {
      const sorted = person.topics.toSorted();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}+${sorted[j]}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
    const top = [...pairs.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k]) => k);
    expect(top).toContain("ai+stablecoins");
    expect(top).toContain("defi+prediction");
  });
});

describe("one-liners", () => {
  const URL_OR_HANDLE = /https?:|www\.|\.(com|xyz|io|org|app|dev)\b|@\w|t\.me/i;
  const lists: readonly (readonly string[])[] = [
    ...TOPIC_IDS.map((id: TopicId) => ONE_LINERS[id]),
    GENERAL_ONE_LINERS,
  ];
  const allLines = lists.flat();

  it("has a healthy pool for every topic and a general pool", () => {
    for (const id of TOPIC_IDS) {
      expect(ONE_LINERS[id].length).toBeGreaterThanOrEqual(25);
    }
    expect(GENERAL_ONE_LINERS.length).toBeGreaterThanOrEqual(40);
  });

  it("stay within 1 to 80 characters and contain no links or handles", () => {
    const bad = allLines.filter(
      (line) =>
        line.trim().length === 0 ||
        line.length > 80 ||
        URL_OR_HANDLE.test(line) ||
        containsLink(line),
    );
    expect(bad).toEqual([]);
  });

  it("never repeat a line across lists, ignoring case", () => {
    const seen = new Set<string>();
    const repeats = allLines.filter((line) => {
      const key = line.toLowerCase();
      const repeated = seen.has(key);
      seen.add(key);
      return repeated;
    });
    expect(repeats).toEqual([]);
  });
});
