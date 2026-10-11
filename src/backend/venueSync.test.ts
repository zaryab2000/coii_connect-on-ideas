import { describe, expect, it } from "vitest";

import { encodeState, parseSnapshot } from "@/backend/venue";
import { VenueSync } from "@/backend/venueSync";

/** Just enough of `Storage` for the venue cache. */
function memoryStorage(entries: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const YESTERDAY = parseSnapshot({
  v: 1,
  cursor: "2026-11-03T20:00:00Z",
  day: "2026-11-03",
  id: ["a"],
  n: ["Asha"],
  t: [["privacy"]],
  i: [[]],
  o: [[]],
  a: [[0, 0, 0, 0]],
  f: [0],
  p: [9],
  d: [4],
  j: [1_793_678_400],
});

const EMPTY = { id: [], n: [], t: [], i: [], o: [], a: [], f: [], p: [], d: [], j: [] };

describe("VenueSync.load", () => {
  it("catches a cached venue from an earlier Meet day up, with today's points back at zero", async () => {
    const storage = memoryStorage({ "coii:venue:v1": JSON.stringify(encodeState(YESTERDAY)) });
    const asked: string[] = [];
    const sync = new VenueSync(
      {
        snapshot: () => Promise.reject(new Error("the cache should be enough")),
        changes: (since) => {
          asked.push(since);
          return Promise.resolve({
            v: 1,
            full: false,
            cursor: "2026-11-04T01:00:00Z",
            day: "2026-11-04",
            people: EMPTY,
            points: { id: [], p: [], d: [] },
            removed: [],
          });
        },
      },
      storage,
    );
    const state = await sync.load();
    expect(asked).toEqual(["2026-11-03T20:00:00Z"]);
    expect(state.day).toBe("2026-11-04");
    expect(state.entries.get("a")).toMatchObject({ p: 9, d: 0 });
    // And the cache now holds the caught-up venue.
    const cached = parseSnapshot(JSON.parse(storage.getItem("coii:venue:v1") ?? "null"));
    expect(cached.entries.get("a")).toMatchObject({ p: 9, d: 0 });
  });

  it("falls back to the cache when the delta can't be fetched", async () => {
    const storage = memoryStorage({ "coii:venue:v1": JSON.stringify(encodeState(YESTERDAY)) });
    const sync = new VenueSync(
      {
        snapshot: () => Promise.reject(new Error("offline")),
        changes: () => Promise.reject(new Error("offline")),
      },
      storage,
    );
    expect((await sync.load()).entries.get("a")).toMatchObject({ p: 9, d: 4 });
  });

  it("loads the snapshot when there's no cache, and throws when it can't", async () => {
    const offline = new VenueSync(
      {
        snapshot: () => Promise.reject(new Error("offline")),
        changes: () => Promise.reject(new Error("offline")),
      },
      memoryStorage(),
    );
    await expect(offline.load()).rejects.toThrow("offline");
    const online = new VenueSync(
      { snapshot: () => Promise.resolve(encodeState(YESTERDAY)), changes: () => Promise.reject() },
      memoryStorage(),
    );
    expect((await online.load()).entries.size).toBe(1);
  });
});
