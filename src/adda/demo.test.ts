import { describe, expect, it } from "vitest";

import { demoAnswer, demoCrew, demoInviter, demoLook } from "@/adda/demo";
import { ADDA_COLORS, ADDA_STYLES, addaTier, isAddaLook } from "@/data/adda";
import { generateDemo } from "@/data/generateDemo";
import { createRng } from "@/data/rng";

const PEOPLE = generateDemo({ seed: 9, count: 200, reserve: 0, now: 0 }).people;
const [A, B] = PEOPLE;

describe("adda demo helpers", () => {
  it("a demo owner's tent always looks the same and is a valid look", () => {
    for (const p of PEOPLE.slice(0, 40)) {
      const look = demoLook(p.id);
      expect(look).toEqual(demoLook(p.id));
      expect(isAddaLook(look)).toBe(true);
    }
    const styles = new Set(PEOPLE.map((p) => demoLook(p.id).style));
    expect(styles.size).toBe(ADDA_STYLES.length);
  });

  it("answers within 5 to 30 seconds, more often yes than no", () => {
    if (!A || !B) throw new Error("expected demo people");
    // Seeded, so the yes count is the same every run (it used to flake around the threshold).
    const rng = createRng(7);
    let yes = 0;
    for (let i = 0; i < 200; i++) {
      const answer = demoAnswer(A, B, () => rng.next());
      expect(answer.delayMs).toBeGreaterThanOrEqual(5000);
      expect(answer.delayMs).toBeLessThanOrEqual(30_000);
      if (answer.joins) yes++;
    }
    expect(yes).toBeGreaterThan(80);
  });

  it("only demo people who share a topic invite you, never someone excluded", () => {
    if (!A) throw new Error("expected demo people");
    const exclude = new Set(PEOPLE.slice(1, 150).map((p) => p.id));
    const rng = createRng(11);
    for (let i = 0; i < 30; i++) {
      const inviter = demoInviter(A, PEOPLE, exclude, () => rng.next());
      if (!inviter) continue;
      expect(exclude.has(inviter.id)).toBe(false);
      expect(inviter.topics.some((t) => A.topics.includes(t))).toBe(true);
    }
  });

  it("a demo crew shares the owner's first topic and leaves out you and the owner", () => {
    if (!A || !B) throw new Error("expected demo people");
    const crew = demoCrew(A, PEOPLE, B.id);
    expect(crew.length).toBeGreaterThan(0);
    expect(crew).not.toContain(A.id);
    expect(crew).not.toContain(B.id);
    for (const id of crew) {
      expect(PEOPLE.find((p) => p.id === id)?.topics).toContain(A.topics[0]);
    }
  });

  it("tent tiers step up at 6 and 16 members, and colours are distinct", () => {
    expect([1, 5, 6, 15, 16, 30].map(addaTier)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(new Set(ADDA_COLORS.map((c) => c.id)).size).toBe(ADDA_COLORS.length);
  });
});
