import { describe, expect, it } from "vitest";

import type { Person, TopicId } from "@/data/types";
import { chaseOf, heatLevel, hottest, risingRows, trendRows } from "@/match/trends";

const NOW = 10_000_000;
const DAY = 24 * 60 * 60 * 1000;
let next = 0;

function person(topics: TopicId[], joinedAt: number): Person {
  next++;
  return {
    id: `p${next}`,
    name: `Person ${next}`,
    telegram: null,
    x: null,
    topics,
    intent: [],
    oneLiners: [],
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    telegramVerified: false,
    ticketVerified: false,
    isDemo: true,
    isYou: false,
    origin: "india",
    joinedAt,
  };
}

function crowd(topic: TopicId, old: number, fresh: number): Person[] {
  return [
    ...Array.from({ length: old }, () => person([topic], NOW - 5 * DAY)),
    ...Array.from({ length: fresh }, () => person([topic], NOW - 1000)),
  ];
}

const PEOPLE = [
  ...crowd("ai", 50, 5),
  ...crowd("defi", 30, 10),
  ...crowd("prediction", 8, 8),
  ...crowd("jobs", 3, 2),
];

describe("the narrative race", () => {
  const rows = trendRows(PEOPLE, NOW - DAY);
  const row = (topic: TopicId) => rows.find((r) => r.topic === topic);
  const level = (topic: TopicId) => heatLevel(row(topic)!, rows);

  it("counts everyone per booth, and who joined in the window", () => {
    expect(row("ai")).toMatchObject({ count: 55, recent: 5, rank: 1 });
    expect(row("defi")).toMatchObject({ count: 40, recent: 10, rank: 2 });
    expect(row("security")).toMatchObject({ count: 0, recent: 0 });
    expect(rows).toHaveLength(10);
  });

  it("counts someone in every booth they picked", () => {
    const both = trendRows([person(["ai", "defi"], NOW)], NOW - DAY);
    expect(both.find((r) => r.topic === "ai")?.count).toBe(1);
    expect(both.find((r) => r.topic === "defi")?.count).toBe(1);
  });

  it("lets tied booths share a place", () => {
    const tied = trendRows([person(["ai"], 0), person(["defi"], 0)], NOW);
    expect(tied.slice(0, 2).map((r) => r.rank)).toEqual([1, 1]);
    expect(tied[2]?.rank).toBe(3);
  });

  it("calls the fastest-rising booth the hottest, not the biggest", () => {
    // Prediction doubled today (8 -> 16); AI only grew 10%.
    expect(hottest(rows)).toBe("prediction");
    // Jobs grew 67% but on 2 joins: too few to count as a trend.
    expect(hottest(trendRows(crowd("jobs", 3, 2), NOW - DAY))).toBeNull();
  });

  it("orders by joins for 'Rising fastest'", () => {
    expect(
      risingRows(rows)
        .map((r) => r.topic)
        .slice(0, 3),
    ).toEqual(["defi", "prediction", "ai"]);
  });

  it("gives the busiest booth three flames and quiet ones none", () => {
    expect(level("defi")).toBe(3);
    expect(level("prediction")).toBe(3);
    expect(level("ai")).toBe(2);
    expect(level("jobs")).toBe(1);
    expect(level("security")).toBe(0);
  });

  it("tells a booth who it chases and how many people it needs", () => {
    expect(chaseOf(rows, "defi")).toMatchObject({ ahead: { topic: "ai" }, need: 16 });
    expect(chaseOf(rows, "ai")).toMatchObject({ ahead: null, need: 0 });
  });
});
