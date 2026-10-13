import { describe, expect, it } from "vitest";

import { parseAddaState } from "@/backend/addaState";
import { hasGoogle, meFrom } from "@/backend/auth";
import { backendConfig } from "@/backend/config";
import { BackendError, coiiCode, errorCopy, toBackendError } from "@/backend/errors";
import { meetViewOf, parseContacts, parseMeetState } from "@/backend/meetState";

/** A session whose account has these sign-in identities. */
function session(providers: string[]): Parameters<typeof hasGoogle>[0] {
  return { user: { identities: providers.map((provider) => ({ provider })) } } as never;
}

describe("backend mode", () => {
  it("needs both the URL and the publishable key", () => {
    expect(backendConfig({})).toBeNull();
    expect(backendConfig({ VITE_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(
      backendConfig({ VITE_SUPABASE_URL: " ", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }),
    ).toBeNull();
    expect(
      backendConfig({
        VITE_SUPABASE_URL: "https://x.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      }),
    ).toEqual({
      url: "https://x.supabase.co",
      publishableKey: "sb_publishable_x",
      turnstileSiteKey: null,
    });
  });
});

describe("error copy", () => {
  it("finds the code in database and Edge Function messages", () => {
    expect(coiiCode("coii:handle_taken")).toBe("handle_taken");
    expect(coiiCode('{"error":"coii:telegram_expired"}')).toBe("telegram_expired");
    expect(coiiCode("duplicate key")).toBeNull();
  });

  it("puts form errors on their field", () => {
    expect(errorCopy("handle_taken")).toEqual({
      field: "handles",
      text: "That username is already on coii. If it's yours, verify with Telegram to claim it.",
    });
    expect(errorCopy("mention_not_allowed").field).toBe("oneLiners");
    expect(errorCopy("name_blocked").field).toBe("name");
  });

  it("never stays silent, even for codes it doesn't know", () => {
    expect(errorCopy("something_new").text).toMatch(/didn't work/);
    expect(errorCopy(null).text).toMatch(/didn't work/);
  });

  it("tells a network failure from a refusal", () => {
    expect(toBackendError(new TypeError("Failed to fetch")).copy.text).toMatch(/Can't reach coii/);
    expect(toBackendError({ message: "TypeError: Load failed" }).code).toBe("offline");
    expect(toBackendError({ message: "coii:quota_whatever" }).code).toBe("quota_whatever");
    expect(toBackendError({ message: "nope", code: "captcha_failed" }).copy.text).toMatch(
      /robot check/,
    );
    const known = new BackendError("no_chai", "x");
    expect(toBackendError(known)).toBe(known);
  });
});

describe("server state", () => {
  it("reads Meet state into the Meet tab's view", () => {
    const state = parseMeetState({
      day: "2026-11-03",
      reset_at: "2026-11-04T00:30:00Z",
      points: 4,
      today_points: 2,
      waves_left: 47,
      waved: ["a", 3],
      skipped: [],
      blocked: ["z"],
      inbound: 1,
      chais: [{ person_id: "a", at: "2026-11-03T09:00:00Z", status: "met", seen: false }, {}],
      hand: { cards: [{ personId: "b", wildcard: true, reasons: ["You both: DeFi"] }] },
      deal_needed: false,
    });
    expect(state.blocked).toEqual(["z"]);
    expect(meetViewOf(state)).toMatchObject({
      resetAt: Date.parse("2026-11-04T00:30:00Z"),
      waved: ["a"],
      wavesLeft: 47,
      wavedAtYou: 4,
      inbound: 1,
      hand: [{ personId: "b", wildcard: true, reasons: ["You both: DeFi"] }],
      chais: [{ personId: "a", status: "met", seen: false, demo: false }],
      celebrate: "a",
    });
  });

  it("reads contacts, dropping rows without a handle; a locked Telegram still counts", () => {
    const found = parseContacts([
      { id: "a", telegram: "asha_builds", x: null, telegram_locked: false },
      { id: "b", telegram: null, x: null, telegram_locked: false },
      { id: "c", telegram: null, x: null, telegram_locked: true },
      { id: "d", telegram: "old_server", x: null },
    ]);
    expect([...found]).toEqual([
      ["a", { telegram: "asha_builds", x: null, telegramLocked: false }],
      ["c", { telegram: null, x: null, telegramLocked: true }],
      ["d", { telegram: "old_server", x: null, telegramLocked: false }],
    ]);
  });

  it("reads adda state; a declined invite never shows as declined", () => {
    const state = parseAddaState({
      addas: [
        {
          id: "t1",
          name: "Rust crew",
          style: "tambu",
          color: "leaf",
          places: { portrait: { x: 0.2, y: 0.9 }, landscape: { x: 4, y: 0 } },
          members: [{ id: "m1", status: "joined", invited_at: "2026-11-03T09:00:00Z" }],
        },
        { id: "bad", name: "x", style: "igloo", color: "leaf" },
      ],
      invites: [{ adda_id: "t2", owner_id: "o", name: "Zara's adda", at: "2026-11-03T09:00:00Z" }],
      joined: [
        {
          adda_id: "t3",
          owner_id: "o2",
          name: "ZK",
          style: "chhatri",
          color: "rani",
          member_ids: ["q"],
        },
      ],
    });
    expect(state.addas).toEqual([
      {
        id: "t1",
        name: "Rust crew",
        look: { style: "tambu", color: "leaf" },
        members: [
          { personId: "m1", status: "joined", invitedAt: Date.parse("2026-11-03T09:00:00Z") },
        ],
        declined: [],
        places: { portrait: { x: 0.2, y: 0.9 } },
      },
    ]);
    expect(state.invites[0]).toMatchObject({ ownerId: "o", addaId: "t2" });
    expect(state.joined[0]).toMatchObject({ ownerId: "o2", memberIds: ["q"] });
  });

  it("reads your own bean, handles included, and whether it's hidden", () => {
    const me = meFrom({
      id: "me",
      name: "Asha Rao",
      topics: ["privacy", "bogus"],
      intents: ["hiring"],
      one_liners: ["hi"],
      avatar: [2, 5, 1, 0],
      telegram: "asha_builds",
      x: "",
      telegram_verified: true,
      status: "hidden",
      joined_at: "2026-11-03T09:00:00Z",
    });
    expect(me).toMatchObject({
      hidden: true,
      person: {
        topics: ["privacy"],
        telegram: "asha_builds",
        x: null,
        isYou: true,
        avatar: { skin: 2, hair: 5, hairColor: 1, accessory: 0 },
      },
    });
    expect(meFrom(null)).toBeNull();
  });

  it("knows when Google is linked", () => {
    expect(hasGoogle(session(["anonymous"]))).toBe(false);
    expect(hasGoogle(session(["anonymous", "google"]))).toBe(true);
    expect(hasGoogle(null)).toBe(false);
  });
});
