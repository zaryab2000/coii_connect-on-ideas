import { afterEach, describe, expect, it, vi } from "vitest";

import {
  claimPreviewFrom,
  invitedNamed,
  readClaimToken,
  rememberTelegramClaim,
  sameName,
  takeClaimToken,
  takeTelegramClaim,
  tokenFromInput,
} from "@/app/claim";
import { BackendError, errorCopy, invitedRef, toBackendError } from "@/backend/errors";
import { CLAIM } from "@/content/claim";
import type { Person } from "@/data/types";
import { waveToast } from "@/ui/meet";

const TOKEN = "Zx3_k-9QmV8wL2pTaB7cD4eF6gH1jK5nR0sU8vY2wXq";

function person(overrides: Partial<Person>): Person {
  return {
    id: "p",
    name: "Kiran Rao",
    telegram: null,
    x: null,
    topics: ["privacy"],
    intent: [],
    oneLiners: [],
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    telegramVerified: false,
    ticketVerified: false,
    isDemo: false,
    isYou: false,
    origin: null,
    joinedAt: 0,
    ...overrides,
  };
}

/** A Storage that lives in a Map, for the Telegram claim round trip. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("claim links in the address", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the token from /claim/<token>", () => {
    expect(readClaimToken(`/claim/${TOKEN}`)).toBe(TOKEN);
    expect(readClaimToken(`/claim/${TOKEN}/`)).toBe(TOKEN);
    expect(readClaimToken("/claim/")).toBeNull();
    expect(readClaimToken("/claim/not a token")).toBeNull();
    expect(readClaimToken(`/join/${TOKEN}`)).toBeNull();
  });

  it("takes the token out of the address before anything else can see it", () => {
    const replaceState = vi.fn<History["replaceState"]>();
    vi.stubGlobal("location", { pathname: `/claim/${TOKEN}`, search: "?still", hash: "" });
    vi.stubGlobal("history", { replaceState });
    expect(takeClaimToken()).toBe(TOKEN);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?still");
  });

  it("passes garbage on, so the claim screen can say the link doesn't work", () => {
    const replaceState = vi.fn<History["replaceState"]>();
    vi.stubGlobal("location", { pathname: "/claim/oops", search: "", hash: "" });
    vi.stubGlobal("history", { replaceState });
    expect(takeClaimToken()).toBe("oops");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });

  it("leaves every other address alone", () => {
    const replaceState = vi.fn<History["replaceState"]>();
    vi.stubGlobal("location", { pathname: "/join", search: "", hash: "" });
    vi.stubGlobal("history", { replaceState });
    expect(takeClaimToken()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("accepts a pasted link or a bare token", () => {
    expect(tokenFromInput(`  https://coii.decipherclub.com/claim/${TOKEN} `)).toBe(TOKEN);
    expect(tokenFromInput(TOKEN)).toBe(TOKEN);
    expect(tokenFromInput("https://coii.decipherclub.com/join")).toBeNull();
    expect(tokenFromInput("hello")).toBeNull();
  });
});

describe("claim previews", () => {
  it("reads a ready preview", () => {
    expect(
      claimPreviewFrom({
        person_id: "k",
        name: "Kiran Rao",
        topics: ["privacy", "nope"],
        intents: ["building"],
        one_liners: ["hi"],
        avatar: [1, 2, 3, 0],
        status: "ready",
      }),
    ).toEqual({
      status: "ready",
      personId: "k",
      name: "Kiran Rao",
      topics: ["privacy"],
      intent: ["building"],
      oneLiners: ["hi"],
      avatar: { skin: 1, hair: 2, hairColor: 3, accessory: 0 },
    });
  });

  it("reads anything odd as a link that doesn't work", () => {
    expect(claimPreviewFrom({ status: "invalid" }).status).toBe("invalid");
    expect(claimPreviewFrom(null).status).toBe("invalid");
    expect(claimPreviewFrom({ status: "ready" }).status).toBe("invalid");
    expect(claimPreviewFrom({ status: "weird", person_id: "k" }).status).toBe("invalid");
  });
});

describe("finding an invited bean by name", () => {
  const people = [
    person({ id: "a", name: "Asha Rao" }),
    person({ id: "k", name: "Kiran  Rao", isInvited: true }),
  ];

  it("matches the typed name exactly, ignoring case and extra spaces", () => {
    expect(invitedNamed(people, "kiran rao ")?.id).toBe("k");
    expect(invitedNamed(people, "Kiran")).toBeNull();
    expect(sameName("", " ")).toBe(false);
  });

  it("never offers a bean that isn't invited", () => {
    expect(invitedNamed(people, "Asha Rao")).toBeNull();
  });
});

describe("the Telegram claim round trip", () => {
  it("remembers consent once, across the trip to Telegram", () => {
    const storage = memoryStorage();
    expect(takeTelegramClaim(storage)).toBe(false);
    rememberTelegramClaim(storage);
    expect(takeTelegramClaim(storage)).toBe(true);
    expect(takeTelegramClaim(storage)).toBe(false);
    expect(takeTelegramClaim(null)).toBe(false);
    // Ticked, then abandoned: coming back from Telegram much later doesn't count as consent.
    rememberTelegramClaim(storage, 1_000);
    expect(takeTelegramClaim(storage, 1_000 + 11 * 60 * 1000)).toBe(false);
  });
});

describe("claim error copy", () => {
  it("has words for every new code", () => {
    for (const code of [
      "handle_invited",
      "claim_invalid",
      "claim_expired",
      "claim_used",
      "not_invited",
    ]) {
      expect(errorCopy(code).text).not.toMatch(/didn't work\. Reload/);
    }
    expect(errorCopy("claim_expired").text).toBe(CLAIM.expired);
    expect(errorCopy("claim_invalid").text).toBe(CLAIM.invalid);
    expect(errorCopy("claim_used").text).toBe(CLAIM.claimed);
    expect(errorCopy("handle_invited").field).toBeNull();
  });

  it("reads who the invited bean is from the database error", () => {
    const error = toBackendError({
      message: "coii:handle_invited",
      details: "6f1d2c3a-0000-4000-8000-000000000001",
      hint: "telegram",
    });
    expect(invitedRef(error)).toEqual({
      personId: "6f1d2c3a-0000-4000-8000-000000000001",
      handle: "telegram",
    });
    expect(invitedRef(toBackendError({ message: "coii:handle_invited", details: "k" }))).toEqual({
      personId: "k",
      handle: null,
    });
    expect(invitedRef(new BackendError("handle_taken", "x", "k", "x"))).toBeNull();
  });

  it("says when a wave reached a bean nobody has claimed", () => {
    expect(waveToast("unclaimed", "Kiran Rao", true)?.text).toBe(CLAIM.unclaimed("Kiran"));
  });

  it("tells someone with a bean why they can't claim another", () => {
    expect(CLAIM.alreadyHaveBean("Asha")).toMatch(/You already have a bean here \(Asha\)/);
  });
});
