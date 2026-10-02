import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  boxesOverlap,
  bubbleBox,
  QUOTE_COOLDOWN,
  QUOTE_ZOOM,
  QuoteDirector,
  quoteCap,
  readingTime,
} from "@/engine/quotes";
import type { QuoteSpot } from "@/engine/quotes";

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const LINES: Record<number, readonly string[]> = {
  0: ["ask me why my agent has a credit score", "gm"],
  1: ["paying for vada pav onchain is my benchmark"],
  2: [],
};

function linesOf(agent: number): readonly string[] {
  return LINES[agent] ?? ["one-liner number " + agent];
}

function spread(count: number): QuoteSpot[] {
  return Array.from({ length: count }, (_, i) => ({
    agent: i,
    x: 150 + (i % 5) * 300,
    y: 200 + Math.floor(i / 5) * 160,
    weight: 1,
  }));
}

describe("quote rules", () => {
  it("shows one bubble in the overview and two or three up close", () => {
    expect(quoteCap(QUOTE_ZOOM - 0.01, 1400)).toBe(1);
    expect(quoteCap(QUOTE_ZOOM, 390)).toBe(2);
    expect(quoteCap(1.2, 1400)).toBe(3);
  });

  it("keeps a line up between 4 and 8 seconds, longer for longer lines", () => {
    expect(readingTime("gm")).toBe(4);
    expect(readingTime("a".repeat(80))).toBe(8);
    expect(readingTime("a".repeat(40))).toBeGreaterThan(readingTime("a".repeat(30)));
  });

  it("sizes a bubble around its anchor and wraps long lines", () => {
    const short = bubbleBox(100, 300, "gm");
    const long = bubbleBox(100, 300, "a".repeat(80));
    expect(short.y1).toBe(300);
    expect(short.x0 + short.x1).toBe(200);
    expect(long.y1 - long.y0).toBeGreaterThan(short.y1 - short.y0);
    expect(long.x1 - long.x0).toBeLessThanOrEqual(240 + 28);
  });
});

function noOverlaps(director: QuoteDirector): boolean {
  const boxes = director.active.map((q) => q.box);
  return boxes.every((a, i) => boxes.slice(i + 1).every((b) => !boxesOverlap(a, b, 0)));
}

/** Plays 200 seconds of quotes over fixed spots and checks every rule at every step. */
function runRespectsRules(
  seed: number,
  points: readonly { x: number; y: number }[],
  cap: number,
): boolean {
  const director = new QuoteDirector(seeded(seed));
  const spots = points.map((p, agent) => ({ agent, ...p, weight: 1 }));
  const spoke = new Map<number, number>();
  for (let t = 0; t < 200; t += 0.25) {
    director.expire(t);
    const quote = director.tryStart(t, cap, spots, linesOf);
    const last = quote ? spoke.get(quote.agent) : undefined;
    if (last !== undefined && t - last < QUOTE_COOLDOWN) return false;
    if (quote) spoke.set(quote.agent, t);
    if (director.active.length > cap || !noOverlaps(director)) return false;
  }
  return true;
}

describe("QuoteDirector", () => {
  it("waits a moment before the first line, then starts one", () => {
    const director = new QuoteDirector(seeded(1));
    expect(director.tryStart(0, 3, spread(3), linesOf)).toBeNull();
    const quote = director.tryStart(2, 3, spread(3), linesOf);
    expect(quote).not.toBeNull();
    expect(quote?.agent).not.toBe(2);
  });

  it("staggers starts instead of popping everyone at once", () => {
    const director = new QuoteDirector(seeded(2));
    expect(director.tryStart(2, 3, spread(10), linesOf)).not.toBeNull();
    expect(director.tryStart(2.5, 3, spread(10), linesOf)).toBeNull();
    expect(director.tryStart(5, 3, spread(10), linesOf)).not.toBeNull();
  });

  it("rotates through someone's lines on their next turn", () => {
    const director = new QuoteDirector(seeded(3));
    const only: QuoteSpot[] = [{ agent: 0, x: 400, y: 400, weight: 1 }];
    const first = director.tryStart(2, 1, only, linesOf);
    director.expire(100);
    const second = director.tryStart(100, 1, only, linesOf);
    expect(first?.line).toBe(LINES[0]?.[0]);
    expect(second?.line).toBe(LINES[0]?.[1]);
  });

  it("keeps clear of blocked boxes such as booth signs", () => {
    const director = new QuoteDirector(seeded(5));
    const spot: QuoteSpot = { agent: 1, x: 400, y: 400, weight: 1 };
    const sign = { x0: 380, y0: 350, x1: 420, y1: 390 };
    expect(director.tryStart(2, 3, [spot], linesOf, [sign])).toBeNull();
    expect(director.tryStart(3, 3, [spot], linesOf, [])).not.toBeNull();
  });

  it("ends the oldest quotes when the cap drops", () => {
    const director = new QuoteDirector(seeded(4));
    director.tryStart(2, 3, spread(10), linesOf);
    director.tryStart(5, 3, spread(10), linesOf);
    const ended = director.trim(1);
    expect(ended).toHaveLength(1);
    expect(director.active).toHaveLength(1);
  });

  it("never exceeds the cap, overlaps a bubble or repeats someone within the cooldown", () => {
    const point = fc.record({
      x: fc.integer({ min: 0, max: 1200 }),
      y: fc.integer({ min: 120, max: 800 }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.array(point, { minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 3 }),
        (seed, points, cap) => runRespectsRules(seed, points, cap),
      ),
      { numRuns: 60 },
    );
  });
});
