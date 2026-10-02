import { describe, expect, it } from "vitest";

import type { Person } from "@/data/types";
import {
  addLine,
  draftFrom,
  lineErrors,
  removeLine,
  toggleTopic,
  validateJoin,
} from "@/ui/joinDraft";
import type { JoinDraft } from "@/ui/joinDraft";

const AVATAR = { skin: 1, hair: 2, hairColor: 3, accessory: 0 };

const VALID: JoinDraft = {
  name: "  Zara   Khan ",
  telegram: "@zara_builds",
  x: "",
  topics: ["wallets", "ai"],
  intent: ["building", "hiring"],
  oneLiners: ["  Shipping agent wallets  ", "", "ask me about   passkeys"],
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
        intent: ["building", "hiring"],
        oneLiners: ["Shipping agent wallets", "ask me about passkeys"],
        avatar: AVATAR,
      },
    });
  });

  it("accepts an X handle alone and normalises URLs", () => {
    const result = validateJoin({ ...VALID, telegram: "", x: "https://x.com/zara?s=1" });
    expect(result.ok && result.input).toMatchObject({ telegram: null, x: "zara" });
  });

  it("drops blank and repeated one-liners", () => {
    const result = validateJoin({ ...VALID, oneLiners: ["   ", "gm", "GM ", ""] });
    expect(result.ok && result.input.oneLiners).toEqual(["gm"]);
    const none = validateJoin({ ...VALID, oneLiners: [""] });
    expect(none.ok && none.input.oneLiners).toEqual([]);
  });

  it("refuses @usernames in one-liners but allows a lone @", () => {
    expect(lineErrors(["dm @zara_builds", "meet me @ the chai stall"])).toEqual([
      "No @usernames here. Your handles show after someone waves.",
      undefined,
    ]);
  });

  it("refuses links in names and strips invisible characters", () => {
    expect(errorsOf({ ...VALID, name: "free ETH at mint-now.xyz" }).name).toMatch(/links/);
    const result = validateJoin({ ...VALID, name: "Za\u200bra Khan", oneLiners: ["gm\u200b"] });
    expect(result.ok && [result.input.name, result.input.oneLiners]).toEqual(["Zara Khan", ["gm"]]);
    expect(lineErrors(["scam\u200b.xyz"])[0]).toMatch(/Links/);
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

  it("rejects a link or an overlong line in any one-liner", () => {
    expect(errorsOf({ ...VALID, oneLiners: ["fine", "see zara.xyz"] }).oneLiners).toBeDefined();
    expect(errorsOf({ ...VALID, oneLiners: ["a".repeat(81)] }).oneLiners).toBeDefined();
    expect(lineErrors(["ok", "see zara.xyz", "a".repeat(81)])).toEqual([
      undefined,
      expect.stringMatching(/Links/),
      expect.stringMatching(/80/),
    ]);
  });

  it("requires consent", () => {
    expect(Object.keys(errorsOf({ ...VALID, consent: false }))).toEqual(["consent"]);
  });
});

describe("one-liner inputs", () => {
  it("adds inputs up to three and always keeps at least one", () => {
    expect(addLine(["a"])).toEqual(["a", ""]);
    expect(addLine(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(removeLine(["a", "b"], 0)).toEqual(["b"]);
    expect(removeLine(["a"], 0)).toEqual([""]);
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
    intent: [],
    oneLiners: [],
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
      intent: [],
      oneLiners: [""],
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
