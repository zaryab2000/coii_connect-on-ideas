import { describe, expect, it } from "vitest";

import { generateDemo } from "@/data/generateDemo";
import { containsLink, normalizeTelegram, normalizeX } from "@/data/handles";
import { ONE_LINERS } from "@/data/oneLiners";
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
    const top = [...pairs.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    expect(top).toContain("ai+stablecoins");
    expect(top).toContain("defi+prediction");
  });
});

describe("one-liners", () => {
  it("stay within 80 characters and contain no links", () => {
    for (const id of TOPIC_IDS) {
      const lines = ONE_LINERS[id as TopicId];
      expect(lines.length).toBeGreaterThanOrEqual(6);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(80);
        expect(containsLink(line)).toBe(false);
      }
    }
  });
});
