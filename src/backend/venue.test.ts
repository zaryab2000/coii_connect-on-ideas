import { describe, expect, it } from "vitest";

import {
  applyChanges,
  decodeColumns,
  diffStates,
  encodeState,
  IDLE_POLL_MS,
  nextPollDelay,
  parseChanges,
  parseSnapshot,
  POLL_MS,
} from "@/backend/venue";
import type { VenueChanges, VenueColumns, VenueState } from "@/backend/venue";

interface Row {
  readonly id: string;
  readonly name?: string;
  readonly topics?: string[];
  readonly flags?: number;
  readonly p?: number;
  readonly d?: number;
}

function columns(rows: readonly Row[]): VenueColumns {
  return {
    id: rows.map((r) => r.id),
    n: rows.map((r) => r.name ?? `Person ${r.id}`),
    t: rows.map((r) => r.topics ?? ["privacy"]),
    i: rows.map(() => ["building"]),
    o: rows.map(() => ["hello"]),
    a: rows.map(() => [1, 2, 3, 0]),
    f: rows.map((r) => r.flags ?? 0),
    p: rows.map((r) => r.p ?? 0),
    d: rows.map((r) => r.d ?? 0),
    j: rows.map(() => 1_793_678_400),
  };
}

function snapshot(rows: readonly Row[], day = "2026-11-03"): VenueState {
  return parseSnapshot({ v: 1, cursor: "2026-11-03T10:00:00Z", day, ...columns(rows) });
}

function changes(
  people: readonly Row[],
  extra: Partial<Extract<VenueChanges, { full: false }>> = {},
): VenueChanges {
  return {
    v: 1,
    full: false,
    cursor: "2026-11-03T10:01:00Z",
    day: "2026-11-03",
    people: columns(people),
    points: { id: [], p: [], d: [] },
    removed: [],
    ...extra,
  };
}

describe("venue columns", () => {
  it("decodes a row into a person, flags included", () => {
    const [entry] = decodeColumns(columns([{ id: "a", name: "Asha", flags: 5, p: 3, d: 1 }]));
    expect(entry).toMatchObject({
      p: 3,
      d: 1,
      person: {
        id: "a",
        name: "Asha",
        telegram: null,
        x: null,
        topics: ["privacy"],
        intent: ["building"],
        oneLiners: ["hello"],
        avatar: { skin: 1, hair: 2, hairColor: 3, accessory: 0 },
        telegramVerified: true,
        ticketVerified: false,
        isDemo: true,
        isYou: false,
        joinedAt: 1_793_678_400_000,
      },
    });
  });

  it("skips malformed rows instead of failing the whole venue", () => {
    const cols = columns([{ id: "a" }, { id: "b", topics: ["nope"] }, { id: "c" }]);
    // b's topic is unknown and its name isn't text: only b is dropped.
    const ids = decodeColumns({ ...cols, n: ["A", 7, "C"] }).map((e) => e.person.id);
    expect(ids).toEqual(["a", "c"]);
    expect(decodeColumns(null)).toEqual([]);
  });

  it("refuses snapshots it doesn't understand", () => {
    expect(() => parseSnapshot({ v: 2 })).toThrow(/unknown format/);
    expect(() => parseSnapshot({ v: 1, ...columns([]) })).toThrow(/cursor/);
  });

  it("round-trips through the cache format", () => {
    const state = snapshot([{ id: "a", flags: 3, p: 4, d: 2 }, { id: "b" }]);
    expect(parseSnapshot(encodeState(state))).toEqual(state);
  });
});

describe("venue deltas", () => {
  it("reports arrivals, edits, removals and point gains", () => {
    const before = snapshot([{ id: "a", p: 1 }, { id: "b" }, { id: "c" }]);
    const update = applyChanges(
      before,
      changes([{ id: "b", name: "Renamed" }, { id: "n" }], {
        points: { id: ["a"], p: [2], d: [1] },
        removed: ["c"],
      }),
    );
    expect(update.arrived.map((p) => p.id)).toEqual(["n"]);
    expect(update.updated.map((p) => p.id)).toEqual(["b"]);
    expect(update.removed).toEqual(["c"]);
    expect(update.gained).toEqual(["a"]);
    expect([...update.state.entries.keys()]).toEqual(["a", "b", "n"]);
    expect(update.changed).toBe(true);
  });

  it("is idempotent: the overlapping cursor can deliver a row twice", () => {
    const before = snapshot([{ id: "a", p: 1 }]);
    const update = applyChanges(before, changes([{ id: "a", p: 1 }]));
    expect(update).toMatchObject({ arrived: [], updated: [], gained: [], changed: false });
  });

  it("ignores removals and points for people it never had", () => {
    const update = applyChanges(
      snapshot([{ id: "a" }]),
      changes([], { points: { id: ["ghost"], p: [9], d: [9] }, removed: ["ghost"] }),
    );
    expect(update.changed).toBe(false);
  });

  it("zeroes today's points when the Meet day rolls over", () => {
    const before = snapshot([{ id: "a", p: 5, d: 3 }]);
    const update = applyChanges(before, changes([], { day: "2026-11-04" }));
    expect(update.state.entries.get("a")).toMatchObject({ p: 5, d: 0 });
    expect(update.changed).toBe(true);
  });

  it("can't apply a full-reload answer as a delta", () => {
    expect(() => applyChanges(snapshot([]), { v: 1, full: true })).toThrow(/full reload/);
  });

  it("reads `full: true` and well-formed deltas", () => {
    expect(parseChanges({ v: 1, full: true })).toEqual({ v: 1, full: true });
    expect(parseChanges({ v: 1, full: false, cursor: "c", day: "d" })).toMatchObject({
      people: {},
      points: { id: [], p: [], d: [] },
      removed: [],
    });
    expect(() => parseChanges({ v: 1, full: false })).toThrow(/cursor/);
  });

  it("describes a fresh snapshot against the old one", () => {
    const before = snapshot([{ id: "a", p: 1 }, { id: "gone" }]);
    const fresh = snapshot([{ id: "a", p: 2 }, { id: "new" }]);
    const update = diffStates(before, fresh);
    expect(update.arrived.map((p) => p.id)).toEqual(["new"]);
    expect(update.removed).toEqual(["gone"]);
    expect(update.gained).toEqual(["a"]);
    expect(update.updated).toEqual([]);
  });
});

describe("venue polling", () => {
  it("polls every minute, every 5 minutes when idle, never while hidden", () => {
    expect(nextPollDelay(false, 0)).toBe(POLL_MS);
    expect(nextPollDelay(false, 299_999)).toBe(POLL_MS);
    expect(nextPollDelay(false, 300_000)).toBe(IDLE_POLL_MS);
    expect(nextPollDelay(true, 0)).toBeNull();
  });
});
