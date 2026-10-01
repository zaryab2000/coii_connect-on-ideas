import { describe, expect, it } from "vitest";

import { TOPICS } from "@/data/topics";
import { contrastRatio, textOn } from "@/ui/color";

describe("textOn", () => {
  it("uses white on dark fills and ink on light ones", () => {
    expect(textOn("#1e1538")).toBe("#ffffff");
    expect(textOn("#3a3570")).toBe("#ffffff");
    expect(textOn("#ffc93c")).toBe("#1e1538");
    expect(textOn("#ffffff")).toBe("#1e1538");
  });

  it("meets WCAG AA for small text on every topic colour", () => {
    for (const topic of TOPICS) {
      expect(contrastRatio(textOn(topic.css), topic.css)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1);
  });
});
