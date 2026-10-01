import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { generateDemo } from "@/data/generateDemo";
import type { IntentId, Person, TopicId } from "@/data/types";
import { daysBetween, meetDay, nextResetAt } from "@/match/day";
import { demoReply } from "@/match/demoBots";
import { buildHand, exposureCap } from "@/match/hand";
import type { HandRequest } from "@/match/hand";
import { openerText, suggestedSpot, suggestedTime, telegramLink } from "@/match/opener";
import { reasonsFor } from "@/match/reasons";
import { complementOf, isEligible, keywordOverlap, scoreParts, topicOverlap } from "@/match/score";
import type { ScoreContext } from "@/match/score";

const NOW = Date.UTC(2026, 10, 3, 6, 0); // 3 Nov 2026, 11:30 IST
const EMPTY_CONTEXT: ScoreContext = {
  now: NOW,
  shownBefore: new Map(),
  wavedAtViewer: new Set(),
  inbound: new Map(),
};

/** Epoch ms for an IST wall-clock time on 3 Nov 2026. */
function istTime(hour: number, minute: number): number {
  return Date.UTC(2026, 10, 3, hour, minute) - 5.5 * 3_600_000;
}

function person(
  id: string,
  topics: TopicId[],
  intent: IntentId[] = [],
  oneLiner: string | null = null,
): Person {
  return {
    id,
    name: `${id} Test`,
    telegram: `${id}_tg`,
    x: null,
    topics,
    intent,
    oneLiner,
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    telegramVerified: false,
    ticketVerified: false,
    isDemo: true,
    isYou: false,
    origin: null,
    joinedAt: NOW - 5 * 86_400_000,
  };
}

const CROWD = generateDemo({ seed: 99, count: 600, reserve: 0, now: NOW }).people;
const VIEWER: Person = {
  ...person("me", ["privacy", "core"], ["job_hunting"], "building private payments"),
  isDemo: false,
  isYou: true,
};

function request(overrides: Partial<HandRequest> = {}): HandRequest {
  return {
    viewer: VIEWER,
    people: CROWD,
    day: "2026-11-03",
    size: 3,
    context: EMPTY_CONTEXT,
    eligibility: { excluded: new Set(), allowDemo: true },
    ...overrides,
  };
}

describe("meet day", () => {
  it("turns over at 06:00 IST", () => {
    expect(meetDay(Date.UTC(2026, 10, 3, 0, 29))).toBe("2026-11-02"); // 05:59 IST
    expect(meetDay(Date.UTC(2026, 10, 3, 0, 30))).toBe("2026-11-03"); // 06:00 IST
  });

  it("always schedules the next reset within the next 24 hours", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }), (now) => {
        const next = nextResetAt(now);
        expect(next).toBeGreaterThan(now);
        expect(next - now).toBeLessThanOrEqual(86_400_000);
        expect(daysBetween(meetDay(now), meetDay(next))).toBe(1);
      }),
    );
  });
});

describe("scoring", () => {
  it("counts a shared primary topic more than a shared secondary one", () => {
    const viewer = person("v", ["privacy", "core"]);
    expect(topicOverlap(viewer, person("a", ["privacy"]))).toBeGreaterThan(
      topicOverlap(viewer, person("b", ["core"])),
    );
    expect(topicOverlap(viewer, person("c", ["jobs"]))).toBe(0);
  });

  it("pairs complementary intents symmetrically", () => {
    expect(complementOf("hiring", "job_hunting")).toBe(1);
    expect(complementOf("job_hunting", "hiring")).toBe(1);
    expect(complementOf("hiring", "hiring")).toBe(0);
    expect(complementOf("vibing", "raising")).toBe(0.2);
  });

  it("finds a shared meaningful word but ignores filler", () => {
    const a = person("a", ["ai"], [], "building UPI rails for agents");
    const b = person("b", ["ai"], [], "agents that pay over UPI");
    expect(keywordOverlap(a, b).word).toMatch(/agents|upi/);
    expect(keywordOverlap(person("c", ["ai"], [], "the and for"), b).value).toBe(0);
  });

  it("keeps every part within 0..1", () => {
    for (const candidate of CROWD.slice(0, 200)) {
      const parts = scoreParts(VIEWER, candidate, EMPTY_CONTEXT);
      for (const value of [parts.topic, parts.intent, parts.keywords, parts.fresh, parts.crowded]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never treats yourself, excluded people or (outside demo) demo people as eligible", () => {
    const other = person("x", ["privacy"]);
    expect(isEligible(VIEWER, VIEWER, { excluded: new Set(), allowDemo: true })).toBe(false);
    expect(isEligible(VIEWER, other, { excluded: new Set(["x"]), allowDemo: true })).toBe(false);
    expect(isEligible(VIEWER, other, { excluded: new Set(), allowDemo: false })).toBe(false);
    expect(isEligible(VIEWER, other, { excluded: new Set(), allowDemo: true })).toBe(true);
  });
});

describe("reasons", () => {
  it("explains shared topics and complementary intents, never the hidden wave boost", () => {
    const them = person("h", ["privacy", "core"], ["hiring"]);
    const context: ScoreContext = { ...EMPTY_CONTEXT, wavedAtViewer: new Set(["h"]) };
    const reasons = reasonsFor(VIEWER, them, scoreParts(VIEWER, them, context), false);
    expect(reasons).toContain("You both: Privacy · Core & L2s");
    expect(reasons.some((r) => r.includes("hiring") && r.includes("looking for a role"))).toBe(
      true,
    );
    expect(reasons.join(" ").toLowerCase()).not.toContain("wave");
  });
});

describe("buildHand", () => {
  it("deals three cards with one wildcard from a neighbouring topic", () => {
    const hand = buildHand(request());
    expect(hand).toHaveLength(3);
    const wildcards = hand.filter((c) => c.wildcard);
    expect(wildcards.length).toBeLessThanOrEqual(1);
    for (const card of wildcards) {
      const p = CROWD.find((c) => c.id === card.personId);
      expect(p?.topics.some((t) => VIEWER.topics.includes(t))).toBe(false);
    }
    for (const card of hand) expect(card.reasons.length).toBeGreaterThan(0);
  });

  it("is stable within a day and changes across days", () => {
    const today = buildHand(request()).map((c) => c.personId);
    expect(buildHand(request()).map((c) => c.personId)).toEqual(today);
    const days = ["2026-11-04", "2026-11-05", "2026-11-06"].map((day) =>
      buildHand(request({ day }))
        .map((c) => c.personId)
        .join(),
    );
    expect(days.some((d) => d !== today.join())).toBe(true);
  });

  it("never deals excluded people, whoever is excluded", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: CROWD.length - 1 }), { maxLength: 300 }),
        (indexes) => {
          const excluded = new Set(indexes.map((i) => CROWD[i]?.id ?? ""));
          const hand = buildHand(request({ eligibility: { excluded, allowDemo: true } }));
          for (const card of hand) {
            expect(excluded.has(card.personId)).toBe(false);
            expect(card.personId).not.toBe(VIEWER.id);
          }
          expect(new Set(hand.map((c) => c.personId)).size).toBe(hand.length);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("keeps dealt cards and adds bonus cards after them", () => {
    const first = buildHand(request());
    const more = buildHand(request({ size: 4, keep: first }));
    expect(more.slice(0, 3)).toEqual(first);
    expect(more).toHaveLength(4);
  });

  it("spreads attention: nobody appears in more than 5x the median number of hands", () => {
    const viewers = CROWD.slice(0, 300);
    const counts = new Map<string, number>();
    const cap = exposureCap(viewers.length);
    for (const viewer of viewers) {
      for (const card of buildHand(request({ viewer, people: CROWD, exposure: { counts, cap } }))) {
        counts.set(card.personId, (counts.get(card.personId) ?? 0) + 1);
      }
    }
    const values = [...counts.values()].toSorted((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)] ?? 1;
    expect(Math.max(...values)).toBeLessThanOrEqual(Math.max(cap, 5 * median));
  });

  it("gives almost everyone at least one card that shares a topic", () => {
    const viewers = CROWD.slice(0, 200);
    let withShared = 0;
    for (const viewer of viewers) {
      const hand = buildHand(request({ viewer }));
      const ids = new Set(hand.map((c) => c.personId));
      if (CROWD.some((p) => ids.has(p.id) && p.topics.some((t) => viewer.topics.includes(t))))
        withShared++;
    }
    expect(withShared / viewers.length).toBeGreaterThanOrEqual(0.9);
  });
});

describe("demo replies and openers", () => {
  it("demo people reply more often when topics overlap, within 4–25 s", () => {
    const close = person("c", ["privacy", "core"]);
    const far = person("f", ["jobs"]);
    const roll = (target: Person) => demoReply(VIEWER, target, () => 0.3).wavesBack;
    expect(roll(close)).toBe(true);
    expect(roll(far)).toBe(false);
    const delay = demoReply(VIEWER, close, () => 0.999).delayMs;
    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(25_000);
  });

  it("builds a Telegram draft link and the same spot for both people", () => {
    const them = person("asha", ["privacy"]);
    expect(suggestedSpot("a", "b")).toBe(suggestedSpot("b", "a"));
    const text = openerText(VIEWER, them, "the coffee lounge", "around 4:30 pm");
    expect(text).toContain("Privacy");
    expect(telegramLink("asha_tg", text)).toBe(
      `https://t.me/asha_tg?text=${encodeURIComponent(text)}`,
    );
  });

  it("suggests meetups only during venue hours (IST)", () => {
    expect(suggestedTime(istTime(15, 10))).toBe("around 3:45 pm");
    expect(suggestedTime(istTime(2, 15))).toBe("today around 11:00 am");
    expect(suggestedTime(istTime(21, 0))).toBe("tomorrow around 11:00 am");
  });
});
