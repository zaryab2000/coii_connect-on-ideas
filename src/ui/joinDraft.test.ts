import { describe, expect, it } from "vitest";

import type { Person } from "@/data/types";
import { draftFrom, toggleTopic, validateJoin } from "@/ui/joinDraft";
import type { JoinDraft } from "@/ui/joinDraft";

const AVATAR = { skin: 1, hair: 2, hairColor: 3, accessory: 0 };

const VALID: JoinDraft = {
  name: "  Zara   Khan ",
  telegram: "@zara_builds",
  x: "",
  topics: ["wallets", "ai"],
  oneLiner: "  Shipping agent wallets  ",
  avatar: AVATAR,
  consent: true,
};

function errorsOf(draft: JoinDraft) {
  const result = validateJoin(draft);
  return result.ok ? {} : result.errors;
}

describe("validateJoin", () => {
  it("cleans a valid draft into join input", () => {
    const result = validateJoin(VALID);
    expect(result).toEqual({
      ok: true,
      input: {
        name: "Zara Khan",
        telegram: "zara_builds",
        x: null,
        topics: ["wallets", "ai"],
        oneLiner: "Shipping agent wallets",
        avatar: AVATAR,
      },
    });
  });

  it("accepts an X handle alone and normalises URLs", () => {
    const result = validateJoin({ ...VALID, telegram: "", x: "https://x.com/zara?s=1" });
    expect(result.ok && result.input).toMatchObject({ telegram: null, x: "zara" });
  });

  it("stores an empty one-liner as null", () => {
    const result = validateJoin({ ...VALID, oneLiner: "   " });
    expect(result.ok && result.input.oneLiner).toBeNull();
  });

  it("requires a name", () => {
    expect(errorsOf({ ...VALID, name: "   " })).toEqual({ name: "Add your name." });
  });

  it("rejects names over 40 characters", () => {
    expect(errorsOf({ ...VALID, name: "a".repeat(41) }).name).toMatch(/40 characters/);
  });

  it("requires at least one handle", () => {
    expect(errorsOf({ ...VALID, telegram: " ", x: "" })).toEqual({
      handles: "Add a Telegram username or an X handle.",
    });
  });

  it("reports each invalid handle on its own field", () => {
    const errors = errorsOf({ ...VALID, telegram: "ab", x: "this_handle_is_too_long" });
    expect(Object.keys(errors).toSorted()).toEqual(["telegram", "x"]);
    expect(errors.handles).toBeUndefined();
  });

  it("requires one to three topics", () => {
    expect(errorsOf({ ...VALID, topics: [] }).topics).toBe("Pick at least one topic.");
    expect(errorsOf({ ...VALID, topics: ["ai", "defi", "core", "jobs"] }).topics).toMatch(/3/);
  });

  it("rejects links and overlong one-liners", () => {
    expect(errorsOf({ ...VALID, oneLiner: "see zara.xyz" }).oneLiner).toMatch(/Links/);
    expect(errorsOf({ ...VALID, oneLiner: "a".repeat(81) }).oneLiner).toMatch(/80/);
  });

  it("requires consent", () => {
    expect(Object.keys(errorsOf({ ...VALID, consent: false }))).toEqual(["consent"]);
  });
});

describe("toggleTopic", () => {
  it("adds in pick order, removes picked topics and caps at three", () => {
    expect(toggleTopic(["ai"], "defi")).toEqual(["ai", "defi"]);
    expect(toggleTopic(["ai", "defi"], "ai")).toEqual(["defi"]);
    expect(toggleTopic(["ai", "defi", "core"], "jobs")).toEqual(["ai", "defi", "core"]);
  });
});

describe("draftFrom", () => {
  const you: Person = {
    id: "you-1",
    name: "Zara",
    telegram: "zara_builds",
    x: null,
    topics: ["ai"],
    oneLiner: null,
    avatar: AVATAR,
    telegramVerified: false,
    ticketVerified: false,
    isDemo: false,
    isYou: true,
    origin: null,
    joinedAt: 1,
  };

  it("starts empty with the given avatar for newcomers, preset topic picked", () => {
    const fresh = { skin: 4, hair: 0, hairColor: 0, accessory: 1 };
    expect(draftFrom(null, "defi", fresh)).toEqual({
      name: "",
      telegram: "",
      x: "",
      topics: ["defi"],
      oneLiner: "",
      avatar: fresh,
      consent: false,
    });
  });

  it("prefills from your profile and adds the booth topic when there is room", () => {
    const draft = draftFrom(you, "privacy", { skin: 0, hair: 0, hairColor: 0, accessory: 0 });
    expect(draft).toMatchObject({ name: "Zara", telegram: "zara_builds", consent: true });
    expect(draft.topics).toEqual(["ai", "privacy"]);
    expect(draft.avatar).toBe(AVATAR);
  });

  it("does not duplicate a topic you already have", () => {
    expect(draftFrom(you, "ai", AVATAR).topics).toEqual(["ai"]);
  });
});
