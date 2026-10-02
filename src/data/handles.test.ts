import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  cleanText,
  containsLink,
  nameHasLink,
  normalizeTelegram,
  normalizeX,
} from "@/data/handles";

const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const tail = [...letters, ..."0123456789_".split("")];

const telegramHandle = fc
  .tuple(
    fc.constantFrom(...letters),
    fc.array(fc.constantFrom(...tail), { minLength: 4, maxLength: 31 }),
  )
  .map(([head, rest]) => head + rest.join(""));

const xHandle = fc
  .array(fc.constantFrom(...tail), { minLength: 1, maxLength: 15 })
  .map((chars) => chars.join(""));

describe("normalizeTelegram", () => {
  it("returns the same username for every accepted input shape", () => {
    fc.assert(
      fc.property(telegramHandle, (handle) => {
        for (const input of [
          handle,
          `@${handle}`,
          `t.me/${handle}`,
          `https://t.me/${handle}`,
          ` ${handle} `,
        ]) {
          expect(normalizeTelegram(input)).toEqual({ ok: true, value: handle });
        }
      }),
    );
  });

  it("rejects usernames that are too short, too long or start with a digit", () => {
    expect(normalizeTelegram("abcd").ok).toBe(false);
    expect(normalizeTelegram(`a${"b".repeat(32)}`).ok).toBe(false);
    expect(normalizeTelegram("1abcde").ok).toBe(false);
    expect(normalizeTelegram("").ok).toBe(false);
    expect(normalizeTelegram("bad-name").ok).toBe(false);
  });
});

describe("normalizeX", () => {
  it("returns the same handle for every accepted input shape", () => {
    fc.assert(
      fc.property(xHandle, (handle) => {
        for (const input of [
          handle,
          `@${handle}`,
          `x.com/${handle}`,
          `https://twitter.com/${handle}`,
        ]) {
          expect(normalizeX(input)).toEqual({ ok: true, value: handle });
        }
      }),
    );
  });

  it("rejects handles longer than 15 characters or with symbols", () => {
    expect(normalizeX("a".repeat(16)).ok).toBe(false);
    expect(normalizeX("hello.world").ok).toBe(false);
  });
});

describe("containsLink", () => {
  it("flags URLs and bare domains", () => {
    expect(containsLink("see https://evil.example")).toBe(true);
    expect(containsLink("claim at airdrop.xyz now")).toBe(true);
    expect(containsLink("www.something")).toBe(true);
  });

  it("flags any word.word with 2+ letters after the dot, whatever the ending", () => {
    expect(containsLink("airdrop at claimdrop.ai")).toBe(true);
    expect(containsLink("docs on coii.dev")).toBe(true);
    expect(containsLink("yield at max.finance")).toBe(true);
    expect(containsLink("dm t.me/someone")).toBe(true);
    expect(containsLink("I build with Node.js")).toBe(true);
  });

  it("allows ordinary sentences and numbers after a dot", () => {
    expect(containsLink("building private payments on Ethereum")).toBe(false);
    expect(containsLink("cricket prediction markets, anyone?")).toBe(false);
    expect(containsLink("rolled out v2.0 today")).toBe(false);
    expect(containsLink("gas is 3.5 gwei. Wild.")).toBe(false);
    expect(containsLink("i.e. a single letter after a dot")).toBe(false);
  });
});

describe("nameHasLink", () => {
  it("lets names written with initials through", () => {
    for (const name of ["K.Ravi Kumar", "S.Priya", "A.R.Rahman", "Dr.Anita Rao", "Zara v2.0"]) {
      expect([name, nameHasLink(name)]).toEqual([name, false]);
    }
  });

  it("still catches domains, URLs and the short domains people paste", () => {
    for (const name of [
      "free ETH at mint-now.xyz",
      "claimdrop.ai team",
      "dm t.me/zara",
      "Zara x.com",
      "win at t.co",
      "https://evil",
      "www.thing",
      "MINT.XYZ",
    ]) {
      expect([name, nameHasLink(name)]).toEqual([name, true]);
    }
  });
});

describe("cleanText", () => {
  it("removes invisible characters that could disguise blocked words or links", () => {
    expect(cleanText("Dev\u200bcon")).toBe("Devcon");
    expect(cleanText("scam\u200b.xyz")).toBe("scam.xyz");
    expect(containsLink(cleanText("scam\u200b.xyz"))).toBe(true);
    expect(cleanText("\ufeffZara\u200d")).toBe("Zara");
    expect(cleanText("\u3164\u2800\uffa0")).toBe("");
  });

  it("trims and collapses every kind of whitespace to one space", () => {
    expect(cleanText("  Zara \u00a0\n Khan  ")).toBe("Zara Khan");
    expect(cleanText("a\u3000b\u2003c")).toBe("a b c");
  });
});
