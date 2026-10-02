import { assertEquals } from "jsr:@std/assert@1.0.13";

import { dealFromInputs } from "./deal.ts";
import type { HandInputs, InputPerson } from "./deal.ts";

const TOPICS = ["ai", "defi", "privacy", "core", "stablecoins"];

function person(n: number): InputPerson {
  return {
    id: `p${n}`,
    name: `Person ${n}`,
    topics: [TOPICS[n % TOPICS.length] as string],
    intents: n % 3 === 0 ? ["hiring"] : ["job_hunting"],
    one_liners: [],
    joined_at: "2026-11-01T10:00:00Z",
    source: "self",
  };
}

const PEOPLE = Array.from({ length: 60 }, (_, n) => person(n));

function inputs(patch: Partial<HandInputs> = {}): HandInputs {
  return {
    day: "2026-11-03",
    now: "2026-11-03T06:00:00Z",
    viewer: PEOPLE[0] as InputPerson,
    candidates: PEOPLE.slice(1),
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

Deno.test("is deterministic per person and day", () => {
  assertEquals(dealFromInputs(inputs()), dealFromInputs(inputs()));
});

Deno.test("never deals excluded people or the viewer", () => {
  const excluded = PEOPLE.slice(1, 40).map((p) => p.id);
  const cards = dealFromInputs(inputs({ excluded }));
  assertEquals(cards.length, 3);
  for (const card of cards) {
    assertEquals(excluded.includes(card.personId) || card.personId === "p0", false);
  }
});

Deno.test("bonus growth keeps the cards already dealt", () => {
  const first = dealFromInputs(inputs());
  const grown = dealFromInputs(inputs({ hand: { cards: first, bonus: 2 } }));
  assertEquals(grown.length, 5);
  assertEquals(grown.slice(0, 3), first);
});

Deno.test("skips people at today's exposure cap", () => {
  const first = dealFromInputs(inputs());
  const capped = Object.fromEntries(first.map((card) => [card.personId, 3]));
  const second = dealFromInputs(inputs({ exposure: capped, hands_today: 10 }));
  for (const card of second) assertEquals(card.personId in capped, false);
});
