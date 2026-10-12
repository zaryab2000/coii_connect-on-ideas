import { describe, expect, it } from "vitest";

import { TOPICS } from "@/data/topics";
import type { Person } from "@/data/types";
import { outfitFor } from "@/engine/outfit";
import { NPC_OUTFIT } from "@/engine/palette";

const BASE: Person = {
  id: "p",
  name: "P",
  telegram: null,
  x: null,
  topics: ["defi"],
  intent: [],
  oneLiners: [],
  avatar: { skin: 2, hair: 1, hairColor: 0, accessory: 0 },
  telegramVerified: false,
  ticketVerified: false,
  isDemo: false,
  isYou: false,
  origin: null,
  joinedAt: 0,
};

describe("bean outfits", () => {
  it("dresses NPCs in grey close up and far away, whatever their topic", () => {
    for (let primary = 0; primary < TOPICS.length; primary++) {
      expect(outfitFor({ ...BASE, isNpc: true }, primary)).toEqual({
        shirt: NPC_OUTFIT,
        lodRow: TOPICS.length,
      });
    }
    expect(NPC_OUTFIT).toBe(0x9aa0a6);
  });

  it("keeps everyone else in their primary topic's colour", () => {
    expect(outfitFor(BASE, 2)).toEqual({ shirt: TOPICS[2]?.color, lodRow: 2 });
  });
});
