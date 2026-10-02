import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizeTelegram, normalizeX } from "@/data/handles";
import { ONE_LINER_MAX } from "@/data/oneLinerRules";
import { INTENT_IDS, TOPIC_IDS } from "@/data/types";
import { meetDay } from "@/match/day";
import { lineErrors, NAME_MAX, validateJoin } from "@/ui/joinDraft";
import type { JoinDraft } from "@/ui/joinDraft";

import { call, cleanup, join, visitor } from "./helpers";
import type { Me, Member, Venue } from "./helpers";

/**
 * Parity (docs/prd/database.md §17): one fixture list, checked against the app's validators
 * and the database. The client validates for UX; the server must agree on every case.
 */

const ONE_LINERS = [
  "I like DeFi.",
  "shipped v2.0 today",
  "agents + stablecoins = the new web? let's argue over chai",
  "see https://scam.example",
  "go to www.thing",
  "mint at foo.xyz",
  "dm me t.me/x",
  "UPI rails on upi.in soon",
  "a".repeat(ONE_LINER_MAX),
  "a".repeat(ONE_LINER_MAX + 1),
  "  spaced   out   line  ",
  "claim at scam\u200b.xyz",
  "gm\u200b\u2060",
  "airdrop at claimdrop.ai",
  "docs on coii.dev",
  "yield at max.finance",
  "I build with Node.js",
  "rolled out v2.0",
  "gas is 3.5 gwei. Wild.",
  "dm @zara_builds",
  "meet me @ the chai stall",
];

const LINE_SETS: readonly (readonly string[])[] = [
  ["  gm  ", "GM", "", "hello   world"],
  ["gm\u200b", "\u00a0GM", "\ufeff"],
  ["a", "b", "c", "A"],
  ["", "   "],
  ["Line\nbreak", "line break"],
];

const NAMES = [
  "Zara Khan",
  "  Zara   Khan  ",
  "Zara\nKhan",
  "",
  "   ",
  "a".repeat(NAME_MAX),
  "a".repeat(NAME_MAX + 1),
  "free ETH at mint-now.xyz",
  "claimdrop.ai team",
  "Zara v2.0",
  "K.Ravi Kumar",
  "S.Priya",
  "A.R.Rahman",
  "Dr.Anita Rao",
  "dm t.me/zara",
  "Zara x.com",
  "win at t.co",
  "\u3164\u2800",
  "Za\u200bra Khan",
  "Zara\u00a0\u2003Khan\ufeff",
  "\u200b\u200b",
];

const TELEGRAM = [
  "priya_builds",
  "abcd",
  "1abcde",
  "a2345",
  "a".repeat(32),
  "a".repeat(33),
  "dash-name",
];
const X = ["zara", "sixteen_chars_xx", "bad-x", "z", "fifteen_chars_x"];

const DRAFT: JoinDraft = {
  name: "Parity Person",
  telegram: "",
  x: "",
  topics: ["privacy"],
  intent: [],
  oneLiners: [""],
  avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
  consent: true,
};

let member: Member & { me: Me };

beforeAll(async () => {
  member = await join();
});

afterAll(async () => {
  await cleanup([member.userId]);
});

/** Saves a profile edit for the parity member; returns the stored profile or the error code. */
async function serverSays(patch: Record<string, unknown>): Promise<Me | string> {
  const { data, error } = await member.client.rpc("upsert_profile", {
    name: "Parity Person",
    topics: ["privacy"],
    intents: [],
    one_liners: [],
    avatar: [0, 0, 0, 0],
    telegram: member.me.telegram,
    x: null,
    consent: false,
    ...patch,
  });
  return error ? error.message : (data as Me);
}

describe("parity between the app and the database", () => {
  it("agrees on which one-liners are allowed", async () => {
    for (const line of ONE_LINERS) {
      const client = lineErrors([line])[0] === undefined;
      const server = await serverSays({ one_liners: [line] });
      expect({ line, ok: typeof server !== "string" }).toEqual({ line, ok: client });
    }
  });

  it("cleans one-liners the same way", async () => {
    for (const lines of LINE_SETS) {
      const result = validateJoin({
        ...DRAFT,
        telegram: member.me.telegram ?? "",
        oneLiners: lines,
      });
      if (!result.ok) throw new Error(`fixture should be valid: ${JSON.stringify(lines)}`);
      const server = await serverSays({ one_liners: lines });
      expect(typeof server === "string" ? server : server.one_liners).toEqual(
        result.input.oneLiners,
      );
    }
  });

  it("agrees on names, including trimming and collapsing whitespace", async () => {
    for (const name of NAMES) {
      const result = validateJoin({ ...DRAFT, telegram: member.me.telegram ?? "", name });
      const server = await serverSays({ name });
      const clientName = result.ok ? result.input.name : "refused";
      const serverName = typeof server === "string" ? "refused" : server.name;
      expect({ name, result: serverName }).toEqual({ name, result: clientName });
    }
  });

  it("agrees on Telegram usernames and X handles", async () => {
    for (const raw of TELEGRAM) {
      const client = normalizeTelegram(raw);
      const value = client.ok ? client.value : raw;
      const server = await serverSays({ telegram: value, x: null });
      expect({ raw, ok: typeof server !== "string" }).toEqual({ raw, ok: client.ok });
    }
    for (const raw of X) {
      const client = normalizeX(raw);
      const server = await serverSays({
        telegram: member.me.telegram,
        x: client.ok ? client.value : raw,
      });
      expect({ raw, ok: typeof server !== "string" }).toEqual({ raw, ok: client.ok });
    }
    await serverSays({ telegram: member.me.telegram, x: null });
  });

  it("knows the same topics, intents and Meet day", async () => {
    for (const topic of TOPIC_IDS) {
      expect(typeof (await serverSays({ topics: [topic] }))).toBe("object");
    }
    for (const intent of INTENT_IDS) {
      expect(typeof (await serverSays({ intents: [intent] }))).toBe("object");
    }
    const venue = await call<Venue>(visitor(), "get_venue");
    expect(venue.day).toBe(meetDay(Date.now()));
  });
});
