import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { TOPIC_IDS } from "@/data/types";
import type { Person, TopicId } from "@/data/types";
import { peopleInTopic, queryPeople, searchTerms, sharedTopicCount } from "@/ui/people";
import type { PeopleQuery } from "@/ui/people";

function person(id: string, topics: TopicId[], overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: `Person ${id}`,
    telegram: null,
    x: null,
    topics,
    oneLiner: null,
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    telegramVerified: false,
    ticketVerified: false,
    isDemo: true,
    isYou: false,
    origin: "india",
    joinedAt: 0,
    ...overrides,
  };
}

const ALL: PeopleQuery = { search: "", topics: [], match: "any", sort: "newest" };

const priya = person("1", ["ai", "defi"], {
  name: "Priya Shah",
  telegram: "priya_builds",
  oneLiner: "Agent wallets for chai stalls",
  joinedAt: 30,
});
const omar = person("2", ["defi"], { name: "Omar Ali", x: "omar_onchain", joinedAt: 20 });
const lena = person("3", ["privacy", "ai", "core"], { name: "Lena Berg", joinedAt: 10 });
const you = person("you", ["ai", "core"], { name: "Zara", isYou: true, isDemo: false });
const CROWD = [omar, lena, priya];

function matchesTopics(p: Person, topics: readonly TopicId[], match: "any" | "all"): boolean {
  if (topics.length === 0) return true;
  const hits = topics.filter((t) => p.topics.includes(t)).length;
  return match === "all" ? hits === topics.length : hits > 0;
}

describe("searchTerms", () => {
  it("splits on whitespace, lower-cases and drops a leading @", () => {
    expect(searchTerms("  @Priya   BUILDS ")).toEqual(["priya", "builds"]);
  });

  it("returns nothing for blank input", () => {
    expect(searchTerms("   ")).toEqual([]);
  });
});

describe("queryPeople", () => {
  it("lists everyone newest first by default", () => {
    expect(queryPeople(CROWD, ALL, null)).toEqual([priya, omar, lena]);
  });

  it("matches every term across name, handles and one-liner", () => {
    expect(queryPeople(CROWD, { ...ALL, search: "@omar_ON" }, null)).toEqual([omar]);
    expect(queryPeople(CROWD, { ...ALL, search: "chai priya" }, null)).toEqual([priya]);
    expect(queryPeople(CROWD, { ...ALL, search: "chai lena" }, null)).toEqual([]);
  });

  it("filters topics with any or all", () => {
    const topics: TopicId[] = ["ai", "defi"];
    expect(queryPeople(CROWD, { ...ALL, topics }, null)).toEqual([priya, omar, lena]);
    expect(queryPeople(CROWD, { ...ALL, topics, match: "all" }, null)).toEqual([priya]);
  });

  it("sorts A to Z", () => {
    expect(queryPeople(CROWD, { ...ALL, sort: "name" }, null)).toEqual([lena, omar, priya]);
  });

  it("ranks best matches by shared topics, then newest, and leaves you out", () => {
    const result = queryPeople([...CROWD, you], { ...ALL, sort: "match" }, you);
    expect(result).toEqual([lena, priya, omar]);
  });

  it("falls back to newest for best match before you join", () => {
    expect(queryPeople(CROWD, { ...ALL, sort: "match" }, null)).toEqual([priya, omar, lena]);
  });

  it("never mutates its input", () => {
    const input = [...CROWD];
    queryPeople(input, { ...ALL, sort: "name" }, null);
    expect(input).toEqual(CROWD);
  });

  it("only returns people who satisfy the topic filter (property)", () => {
    const topicArb = fc.constantFrom(...TOPIC_IDS);
    const personArb = fc
      .record({
        id: fc.uuid(),
        topics: fc.uniqueArray(topicArb, { minLength: 1, maxLength: 3 }),
        joinedAt: fc.nat(),
      })
      .map(({ id, topics, joinedAt }) => person(id, topics, { joinedAt }));
    fc.assert(
      fc.property(
        fc.array(personArb, { maxLength: 40 }),
        fc.uniqueArray(topicArb, { maxLength: 4 }),
        fc.constantFrom("any" as const, "all" as const),
        (people, topics, match) => {
          const result = queryPeople(people, { ...ALL, topics, match }, null);
          for (const p of result) expect(matchesTopics(p, topics, match)).toBe(true);
          const times = result.map((p) => p.joinedAt);
          expect(times).toEqual(times.toSorted((a, b) => b - a));
        },
      ),
    );
  });
});

describe("sharedTopicCount", () => {
  it("counts topics in common", () => {
    expect(sharedTopicCount(lena, you)).toBe(2);
    expect(sharedTopicCount(omar, you)).toBe(0);
  });
});

describe("peopleInTopic", () => {
  it("lists a booth's people newest first", () => {
    expect(peopleInTopic(CROWD, "ai")).toEqual([priya, lena]);
    expect(peopleInTopic(CROWD, "jobs")).toEqual([]);
  });
});
