import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { containsLink, normalizeTelegram, normalizeX } from "@/data/handles";

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

  it("allows ordinary sentences", () => {
    expect(containsLink("building private payments on Ethereum")).toBe(false);
    expect(containsLink("cricket prediction markets, anyone?")).toBe(false);
  });
});
