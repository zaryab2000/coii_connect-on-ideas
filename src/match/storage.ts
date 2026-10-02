import type { Card } from "@/match/hand";

export type ChaiStatus = "new" | "messaged" | "met";

/** A mutual wave ("Chai's on!"). */
export interface Chai {
  readonly personId: string;
  readonly at: number;
  readonly status: ChaiStatus;
  /** Simulated reply from a demo person. */
  readonly demo: boolean;
  /** You have seen the "Chai's on!" moment. */
  readonly seen: boolean;
}

export interface DayHand {
  readonly day: string;
  readonly cards: readonly Card[];
  readonly revealed: readonly string[];
  readonly bonus: number;
}

export interface Wave {
  readonly to: string;
  readonly at: number;
  readonly day: string;
}

export interface Skip {
  readonly id: string;
  /** Meet day after which this person may appear again. */
  readonly until: string;
}

/** Everything Meet remembers for you in this browser (demo phase; the server owns it later). */
export interface MeetSave {
  readonly version: 1;
  readonly personId: string;
  readonly hands: readonly DayHand[];
  readonly waves: readonly Wave[];
  readonly skips: readonly Skip[];
  readonly chais: readonly Chai[];
  /** Hidden: who already waved at you. Only ever revealed through a mutual wave. */
  readonly inbound: readonly string[];
  /** Day the hidden inbound waves were last topped up. */
  readonly inboundDay: string | null;
}

const KEY = "coii:meet:v1";
const KEEP_DAYS = 7;

export function emptySave(personId: string): MeetSave {
  return {
    version: 1,
    personId,
    hands: [],
    waves: [],
    skips: [],
    chais: [],
    inbound: [],
    inboundDay: null,
  };
}

function isSave(value: unknown, personId: string): value is MeetSave {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const lists = ["hands", "waves", "skips", "chais", "inbound"].every((k) => Array.isArray(v[k]));
  return v["version"] === 1 && v["personId"] === personId && lists;
}

/** Your saved Meet state, or a fresh one if none exists, it belongs to someone else, or storage fails. */
export function loadMeet(personId: string): MeetSave {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isSave(parsed, personId) ? parsed : emptySave(personId);
  } catch {
    return emptySave(personId);
  }
}

export function saveMeet(save: MeetSave): boolean {
  try {
    const trimmed = { ...save, hands: save.hands.slice(-KEEP_DAYS) };
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false;
  }
}

export function clearMeet(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked; nothing was saved, so there is nothing to clear.
  }
}
