import { describe, expect, it } from "vitest";

import type { Chai } from "@/match/storage";
import { chaiNames, shownChai } from "@/ui/chaiBatch";

function chai(personId: string, seen = false): Chai {
  return { personId, seen, at: 1, status: "new", demo: false };
}

describe("chai celebration selection", () => {
  const people = new Set(["a", "b", "c"]);

  it("keeps the existing full card for one unseen chai", () => {
    expect(shownChai(null, [chai("a")], people)).toEqual({
      kind: "person",
      personId: "a",
      celebration: true,
    });
  });

  it("combines several unseen chais into one card", () => {
    expect(shownChai(null, [chai("a"), chai("b"), chai("c", true)], people)).toEqual({
      kind: "batch",
      personIds: ["a", "b"],
    });
  });

  it("lets a chai opened from the list override the celebration", () => {
    expect(shownChai("c", [chai("a"), chai("b"), chai("c", true)], people)).toEqual({
      kind: "person",
      personId: "c",
      celebration: false,
    });
  });

  it("formats the names on the combined card", () => {
    expect(chaiNames(["Bina"])).toBe("Bina");
    expect(chaiNames(["Bina", "Chetan"])).toBe("Bina & Chetan");
    expect(chaiNames(["Bina", "Chetan", "Dev"])).toBe("Bina, Chetan & Dev");
  });
});
