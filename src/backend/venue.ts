import { isIntentId } from "@/data/intents";
import { isTopicId } from "@/data/topics";
import type { IntentId, Person, TopicId } from "@/data/types";

/**
 * The venue in backend mode (docs/prd/database.md §8.2, §8.3, §13): a column-oriented snapshot,
 * cached in this browser, kept fresh with small deltas. Pure functions first, then the poller.
 */

/** Column-oriented people, all arrays the same length (§8.2). */
export interface VenueColumns {
  readonly id: readonly string[];
  readonly n: readonly string[];
  readonly t: readonly (readonly string[])[];
  readonly i: readonly (readonly string[])[];
  readonly o: readonly (readonly string[])[];
  readonly a: readonly (readonly number[])[];
  readonly f: readonly number[];
  readonly p: readonly number[];
  readonly d: readonly number[];
  readonly j: readonly number[];
}

export interface VenueSnapshot extends VenueColumns {
  readonly v: 1;
  readonly cursor: string;
  readonly day: string;
}

export interface PointColumns {
  readonly id: readonly string[];
  readonly p: readonly number[];
  readonly d: readonly number[];
}

export type VenueChanges =
  | { readonly v: 1; readonly full: true }
  | {
      readonly v: 1;
      readonly full: false;
      readonly cursor: string;
      readonly day: string;
      readonly people: VenueColumns;
      readonly points: PointColumns;
      readonly removed: readonly string[];
    };

/** Someone in the venue with their wave points: all-time `p` and this Meet day's `d`. */
export interface VenueEntry {
  readonly person: Person;
  readonly p: number;
  readonly d: number;
}

/** What the browser knows about the venue: who's here, as of `cursor`, on Meet day `day`. */
export interface VenueState {
  readonly cursor: string;
  readonly day: string;
  /** In arrival order. */
  readonly entries: ReadonlyMap<string, VenueEntry>;
}

/** What one delta changed, for animations: walk-ins, edits, walk-outs and points. */
export interface VenueUpdate {
  readonly state: VenueState;
  readonly arrived: readonly Person[];
  readonly updated: readonly Person[];
  readonly removed: readonly string[];
  /** People whose all-time points went up (for the "+1" pop). */
  readonly gained: readonly string[];
  /** Any change at all, points included. */
  readonly changed: boolean;
}

const FLAG_TELEGRAM = 1;
const FLAG_TICKET = 2;
const FLAG_DEMO = 4;
/** An invited bean nobody has claimed yet (docs-internal/prd/claim-your-bean.md §6.1). */
const FLAG_INVITED = 8;
/** A background NPC bean (docs-internal/prd/npc-beans.md). */
const FLAG_NPC = 16;

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return array(value).filter((item): item is string => typeof item === "string");
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** The `f` bit mask (§8.2) as the person's flags; `isNpc` only when set. */
function flagsOf(
  bits: number,
): Pick<Person, "telegramVerified" | "ticketVerified" | "isDemo" | "isNpc" | "isInvited"> {
  // Rare flags are only set when true, so most people don't carry them.
  return {
    telegramVerified: (bits & FLAG_TELEGRAM) !== 0,
    ticketVerified: (bits & FLAG_TICKET) !== 0,
    isDemo: (bits & FLAG_DEMO) !== 0,
    ...((bits & FLAG_INVITED) !== 0 && { isInvited: true }),
    ...((bits & FLAG_NPC) !== 0 && { isNpc: true }),
  };
}

/** One row of the columns as a `Person`, or null when the row is malformed. */
function personAt(cols: Raw, row: number): VenueEntry | null {
  const id = array(cols["id"])[row];
  const name = array(cols["n"])[row];
  if (typeof id !== "string" || typeof name !== "string") return null;
  const topics = strings(array(cols["t"])[row]).filter(isTopicId) as TopicId[];
  if (topics.length === 0) return null;
  const intent = strings(array(cols["i"])[row]).filter(isIntentId) as IntentId[];
  const look = array(array(cols["a"])[row]).map(count);
  const bits = count(array(cols["f"])[row]);
  const person: Person = {
    id,
    name,
    telegram: null,
    x: null,
    topics,
    intent,
    oneLiners: strings(array(cols["o"])[row]),
    avatar: {
      skin: look[0] ?? 0,
      hair: look[1] ?? 0,
      hairColor: look[2] ?? 0,
      accessory: look[3] ?? 0,
    },
    ...flagsOf(bits),
    isYou: false,
    origin: null,
    joinedAt: count(array(cols["j"])[row]) * 1000,
  };
  return { person, p: count(array(cols["p"])[row]), d: count(array(cols["d"])[row]) };
}

/** Every well-formed row of a column block; malformed rows are skipped, never fatal. */
export function decodeColumns(cols: unknown): VenueEntry[] {
  if (!isRaw(cols)) return [];
  const entries: VenueEntry[] = [];
  const rows = array(cols["id"]).length;
  for (let row = 0; row < rows; row++) {
    const entry = personAt(cols, row);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Reads a `get_venue()` result; throws on anything that isn't a version-1 snapshot. */
export function parseSnapshot(value: unknown): VenueState {
  if (!isRaw(value) || value["v"] !== 1)
    throw new Error("The venue snapshot has an unknown format");
  const cursor = value["cursor"];
  const day = value["day"];
  if (typeof cursor !== "string" || typeof day !== "string") {
    throw new Error("The venue snapshot is missing its cursor or day");
  }
  const entries = new Map<string, VenueEntry>();
  for (const entry of decodeColumns(value)) entries.set(entry.person.id, entry);
  return { cursor, day, entries };
}

/** Reads a `get_venue_changes()` result; `full: true` means "load the snapshot instead". */
export function parseChanges(value: unknown): VenueChanges {
  if (!isRaw(value) || value["v"] !== 1)
    throw new Error("The venue changes have an unknown format");
  if (value["full"] === true) return { v: 1, full: true };
  const { cursor, day } = value;
  if (typeof cursor !== "string" || typeof day !== "string") {
    throw new Error("The venue changes are missing their cursor or day");
  }
  const points = isRaw(value["points"]) ? value["points"] : {};
  return {
    v: 1,
    full: false,
    cursor,
    day,
    people: (isRaw(value["people"]) ? value["people"] : {}) as unknown as VenueColumns,
    points: {
      id: strings(points["id"]),
      p: array(points["p"]).map(count),
      d: array(points["d"]).map(count),
    },
    removed: strings(value["removed"]),
  };
}

function zeroToday(entries: ReadonlyMap<string, VenueEntry>): Map<string, VenueEntry> {
  const next = new Map<string, VenueEntry>();
  for (const [id, entry] of entries) next.set(id, entry.d === 0 ? entry : { ...entry, d: 0 });
  return next;
}

function samePerson(a: Person, b: Person): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Walk-ins, edits and point gains, collected while a delta or a snapshot is applied. */
interface Changes {
  readonly arrived: Person[];
  readonly updated: Person[];
  readonly gained: string[];
}

/** Sorts one incoming row against what was there before. */
function sortEntry(old: VenueEntry | undefined, entry: VenueEntry, out: Changes): void {
  if (!old) out.arrived.push(entry.person);
  else if (!samePerson(old.person, entry.person)) out.updated.push(entry.person);
  if (old && entry.p > old.p) out.gained.push(entry.person.id);
}

function sameEntry(old: VenueEntry | undefined, entry: VenueEntry): boolean {
  return (
    old !== undefined &&
    old.p === entry.p &&
    old.d === entry.d &&
    samePerson(old.person, entry.person)
  );
}

/** Point-only changes for people already here; returns whether anything changed. */
function applyPoints(
  entries: Map<string, VenueEntry>,
  points: PointColumns,
  out: Changes,
): boolean {
  let changed = false;
  points.id.forEach((id, row) => {
    const old = entries.get(id);
    if (!old) return;
    const next = { ...old, p: points.p[row] ?? old.p, d: points.d[row] ?? old.d };
    if (sameEntry(old, next)) return;
    sortEntry(old, next, out);
    entries.set(id, next);
    changed = true;
  });
  return changed;
}

/**
 * Applies a delta. Idempotent by id (the server's cursor overlaps by 5 s), so a row seen twice
 * changes nothing. A new Meet day zeroes everyone's today points first (§8.3).
 */
export function applyChanges(state: VenueState, changes: VenueChanges): VenueUpdate {
  if (changes.full) throw new Error("A full reload can't be applied as a delta");
  const newDay = changes.day !== state.day;
  const entries = newDay ? zeroToday(state.entries) : new Map(state.entries);
  const out: Changes = { arrived: [], updated: [], gained: [] };
  let changed = newDay;
  for (const entry of decodeColumns(changes.people)) {
    const old = entries.get(entry.person.id);
    sortEntry(old, entry, out);
    changed ||= !sameEntry(old, entry);
    entries.set(entry.person.id, entry);
  }
  changed = applyPoints(entries, changes.points, out) || changed;
  const removed = changes.removed.filter((id) => entries.delete(id));
  return {
    state: { cursor: changes.cursor, day: changes.day, entries },
    ...out,
    removed,
    changed: changed || removed.length > 0,
  };
}

/** A fresh snapshot replacing what the browser had, described as one delta. */
export function diffStates(before: VenueState | null, fresh: VenueState): VenueUpdate {
  const out: Changes = { arrived: [], updated: [], gained: [] };
  for (const entry of fresh.entries.values()) {
    sortEntry(before?.entries.get(entry.person.id), entry, out);
  }
  const removed = [...(before?.entries.keys() ?? [])].filter((id) => !fresh.entries.has(id));
  return { state: fresh, ...out, removed, changed: true };
}

// ---- cache (coii:venue:v1) --------------------------------------------------------------------

const CACHE_KEY = "coii:venue:v1";

function flags(p: Person): number {
  return (
    (p.telegramVerified ? FLAG_TELEGRAM : 0) |
    (p.ticketVerified ? FLAG_TICKET : 0) |
    (p.isDemo ? FLAG_DEMO : 0) |
    (p.isInvited ? FLAG_INVITED : 0) |
    (p.isNpc ? FLAG_NPC : 0)
  );
}

/** The state back in the snapshot's column form, which is also how it's cached. */
export function encodeState(state: VenueState): VenueSnapshot {
  const rows = [...state.entries.values()];
  return {
    v: 1,
    cursor: state.cursor,
    day: state.day,
    id: rows.map((e) => e.person.id),
    n: rows.map((e) => e.person.name),
    t: rows.map((e) => e.person.topics),
    i: rows.map((e) => e.person.intent),
    o: rows.map((e) => e.person.oneLiners),
    a: rows.map(({ person: { avatar } }) => [
      avatar.skin,
      avatar.hair,
      avatar.hairColor,
      avatar.accessory,
    ]),
    f: rows.map((e) => flags(e.person)),
    p: rows.map((e) => e.p),
    d: rows.map((e) => e.d),
    j: rows.map((e) => Math.floor(e.person.joinedAt / 1000)),
  };
}

/** The cached venue, or null when there is none or it's unreadable. */
export function loadVenueCache(storage: Storage | null): VenueState | null {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    return raw ? parseSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveVenueCache(storage: Storage | null, state: VenueState): void {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(encodeState(state)));
  } catch {
    // Storage full or blocked: the next visit loads the snapshot again, which is fine.
  }
}

export function clearVenueCache(storage: Storage | null): void {
  try {
    storage?.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked; nothing was cached.
  }
}

// ---- polling (§13) -----------------------------------------------------------------------------

export const POLL_MS = 60_000;
export const IDLE_POLL_MS = 300_000;
export const IDLE_AFTER_MS = 300_000;

/** How long to wait before the next poll, or null while the tab is hidden (no polling at all). */
export function nextPollDelay(hidden: boolean, idleForMs: number): number | null {
  if (hidden) return null;
  return idleForMs >= IDLE_AFTER_MS ? IDLE_POLL_MS : POLL_MS;
}
