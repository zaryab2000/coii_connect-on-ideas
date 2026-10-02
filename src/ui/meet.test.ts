import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { WAVES_PER_DAY } from "@/app/meet";
import type { MeetView } from "@/app/store";
import type { Chai } from "@/match/storage";
import {
  capitalize,
  cardState,
  firstName,
  formatCountdown,
  handDone,
  inboundText,
  meetBadge,
  meetTabLabel,
  swipeDecision,
  swipeThreshold,
  unrevealedCount,
  wavesLeftText,
  waveToast,
} from "@/ui/meet";

const MINUTE = 60_000;

function card(personId: string) {
  return { personId, wildcard: false, reasons: ["You both: Privacy"] };
}

function chai(personId: string, seen = true): Chai {
  return { personId, at: 0, status: "new", demo: true, seen };
}

function view(patch: Partial<MeetView> = {}): MeetView {
  return {
    day: "2026-11-03",
    resetAt: 0,
    hand: [card("a"), card("b"), card("c")],
    revealed: [],
    waved: [],
    wavesLeft: WAVES_PER_DAY,
    skipped: [],
    chais: [],
    inbound: 0,
    wavedAtYou: 0,
    celebrate: null,
    ...patch,
  };
}

describe("formatCountdown", () => {
  it("shows hours and minutes", () => {
    expect(formatCountdown((4 * 60 + 12) * MINUTE)).toBe("4h 12m");
  });

  it("drops zero minutes and zero hours", () => {
    expect(formatCountdown(3 * 60 * MINUTE)).toBe("3h");
    expect(formatCountdown(12 * MINUTE)).toBe("12m");
  });

  it("rounds up so a few seconds left never reads 0m", () => {
    expect(formatCountdown(5000)).toBe("1m");
    expect(formatCountdown(59 * MINUTE + 1)).toBe("1h");
  });

  it("says a moment once the reset is due", () => {
    expect(formatCountdown(0)).toBe("a moment");
    expect(formatCountdown(-MINUTE)).toBe("a moment");
  });

  it("never shows 0m or 60m (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 24 * 60 * MINUTE }), (ms) => {
        const text = formatCountdown(ms);
        expect(text).not.toMatch(/\b0m|\b60m/);
        expect(text).toMatch(/^(\d+h)?( ?\d+m)?$/);
      }),
    );
  });
});

describe("copy", () => {
  it("counts waves left with the right plural", () => {
    expect(wavesLeftText(14)).toBe("14 waves left today");
    expect(wavesLeftText(1)).toBe("1 wave left today");
    expect(wavesLeftText(0)).toBe("No waves left today");
  });

  it("teases inbound waves without naming anyone", () => {
    expect(inboundText(2)).toBe("2 people waved at you. They may show up in your next picks.");
    expect(inboundText(1)).toMatch(/^1 person waved/);
  });

  it("never says match", () => {
    const texts = [inboundText(3), wavesLeftText(3), meetTabLabel({ kind: "dot" })];
    for (const result of ["quota", "unavailable", "waved"] as const) {
      texts.push(waveToast(result, "Asha Rao", true)?.text ?? "");
    }
    for (const text of texts) expect(text.toLowerCase()).not.toContain("match");
  });

  it("uses first names and capitalised intent phrases", () => {
    expect(firstName("Asha Rao")).toBe("Asha");
    expect(firstName("Cher")).toBe("Cher");
    expect(capitalize("looking for a role")).toBe("Looking for a role");
    expect(capitalize("")).toBe("");
  });
});

describe("waveToast", () => {
  it("explains the daily limit", () => {
    expect(waveToast("quota", "Asha Rao", false)?.text).toBe(
      `You've used today's ${WAVES_PER_DAY} waves. They refill at 06:00.`,
    );
  });

  it("explains the point and the unlocked contact on your first wave only", () => {
    expect(waveToast("waved", "Asha Rao", true)?.text).toContain("+1 wave point for Asha");
    expect(waveToast("waved", "Asha Rao", false)).toBeNull();
  });

  it("stays quiet for a chai, which has its own moment", () => {
    expect(waveToast("chai", "Asha Rao", true)).toBeNull();
    expect(waveToast("already", "Asha Rao", true)).toBeNull();
  });

  it("explains a wave that could not happen", () => {
    expect(waveToast("unavailable", "Asha Rao", false)?.text).toMatch(/Couldn't wave at Asha/);
  });
});

describe("cardState and handDone", () => {
  it("keeps unrevealed cards hidden even if you waved from their profile", () => {
    const meet = view({ waved: ["a"] });
    expect(cardState(meet, "a")).toBe("hidden");
    expect(cardState({ ...meet, revealed: ["a"] }, "a")).toBe("waved");
  });

  it("prefers chai over waved", () => {
    const meet = view({ revealed: ["a"], waved: ["a"], chais: [chai("a")] });
    expect(cardState(meet, "a")).toBe("chai");
  });

  it("is open after reveal and skipped after a skip", () => {
    expect(cardState(view({ revealed: ["b"] }), "b")).toBe("open");
    expect(cardState(view({ revealed: ["b"], skipped: ["b"] }), "b")).toBe("skipped");
  });

  it("is done only when every card is flipped and answered", () => {
    expect(handDone(view())).toBe(false);
    expect(handDone(view({ revealed: ["a", "b", "c"], waved: ["a"], skipped: ["b"] }))).toBe(false);
    const done = view({ revealed: ["a", "b", "c"], waved: ["a", "c"], skipped: ["b"] });
    expect(handDone(done)).toBe(true);
  });

  it("is never done with an empty hand", () => {
    expect(handDone(view({ hand: [] }))).toBe(false);
  });
});

describe("meetBadge", () => {
  it("is empty before you join", () => {
    expect(meetBadge(null)).toBeNull();
  });

  it("counts face-down cards first", () => {
    const meet = view({ revealed: ["a"], chais: [chai("x", false)] });
    expect(unrevealedCount(meet)).toBe(2);
    expect(meetBadge(meet)).toEqual({ kind: "count", count: 2 });
    expect(meetTabLabel(meetBadge(meet))).toBe("Meet, 2 new");
  });

  it("shows a dot for an unseen chai once all cards are flipped", () => {
    const flipped = { revealed: ["a", "b", "c"] };
    expect(meetBadge(view({ ...flipped, chais: [chai("x", false)] }))).toEqual({ kind: "dot" });
    expect(meetBadge(view({ ...flipped, chais: [chai("x", true)] }))).toBeNull();
    expect(meetTabLabel(null)).toBe("Meet");
  });
});

describe("swipeDecision", () => {
  const width = 360;

  it("waves on a long drag right and skips on a long drag left", () => {
    expect(swipeDecision({ dx: 130, velocity: 0, width })).toBe("wave");
    expect(swipeDecision({ dx: -130, velocity: 0, width })).toBe("skip");
  });

  it("snaps back after a short slow drag", () => {
    expect(swipeDecision({ dx: 80, velocity: 0.1, width })).toBeNull();
  });

  it("commits on a quick flick outwards", () => {
    expect(swipeDecision({ dx: 50, velocity: 0.8, width })).toBe("wave");
    expect(swipeDecision({ dx: -50, velocity: -0.8, width })).toBe("skip");
  });

  it("ignores twitches and cards pulled back to the middle", () => {
    expect(swipeDecision({ dx: 20, velocity: 2, width })).toBeNull();
    expect(swipeDecision({ dx: 150, velocity: -0.9, width })).toBeNull();
  });

  it("caps the threshold on wide cards", () => {
    expect(swipeThreshold(300)).toBe(100);
    expect(swipeThreshold(900)).toBe(120);
  });

  it("is mirror-symmetric (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -400, max: 400, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 120, max: 900, noNaN: true }),
        (dx, velocity, w) => {
          const right = swipeDecision({ dx, velocity, width: w });
          const left = swipeDecision({ dx: -dx, velocity: -velocity, width: w });
          const mirrored = { wave: "skip", skip: "wave" } as const;
          expect(left).toBe(right === null ? null : mirrored[right]);
        },
      ),
    );
  });

  it("never commits under the minimum travel (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -39.9, max: 39.9, noNaN: true }),
        fc.double({ min: -5, max: 5, noNaN: true }),
        (dx, velocity) => {
          expect(swipeDecision({ dx, velocity, width })).toBeNull();
        },
      ),
    );
  });
});
