import type { MeetView } from "@/app/store";
import type { Card } from "@/match/hand";
import type { Chai, ChaiStatus } from "@/match/storage";

/** What `get_meet_state()` returns (docs/prd/database.md §8.6). */
export interface MeetState {
  readonly day: string;
  readonly resetAt: number;
  readonly points: number;
  readonly todayPoints: number;
  readonly wavesLeft: number;
  readonly waved: readonly string[];
  readonly skipped: readonly string[];
  readonly blocked: readonly string[];
  readonly inbound: number;
  readonly chais: readonly Chai[];
  readonly hand: { readonly cards: readonly Card[]; readonly revealed: readonly string[] };
  readonly dealNeeded: boolean;
}

type Raw = Record<string, unknown>;

function raw(value: unknown): Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function ids(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === "string");
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

const STATUSES: readonly ChaiStatus[] = ["new", "messaged", "met"];

function chaiOf(value: unknown): Chai | null {
  const c = raw(value);
  const personId = c["person_id"];
  if (typeof personId !== "string") return null;
  const status = STATUSES.find((s) => s === c["status"]) ?? "new";
  const at = Date.parse(typeof c["at"] === "string" ? c["at"] : "");
  return { personId, at: Number.isNaN(at) ? 0 : at, status, demo: false, seen: c["seen"] === true };
}

function cardOf(value: unknown): Card | null {
  const c = raw(value);
  if (typeof c["personId"] !== "string") return null;
  return {
    personId: c["personId"],
    wildcard: c["wildcard"] === true,
    reasons: ids(c["reasons"]),
  };
}

/** Reads a `get_meet_state()` result; malformed parts become empty, never fatal. */
export function parseMeetState(value: unknown): MeetState {
  const s = raw(value);
  const hand = raw(s["hand"]);
  const resetAt = Date.parse(typeof s["reset_at"] === "string" ? s["reset_at"] : "");
  return {
    day: typeof s["day"] === "string" ? s["day"] : "",
    resetAt: Number.isNaN(resetAt) ? Date.now() + 86_400_000 : resetAt,
    points: num(s["points"]),
    todayPoints: num(s["today_points"]),
    wavesLeft: num(s["waves_left"]),
    waved: ids(s["waved"]),
    skipped: ids(s["skipped"]),
    blocked: ids(s["blocked"]),
    inbound: num(s["inbound"]),
    chais: list(s["chais"]).flatMap((c) => chaiOf(c) ?? []),
    hand: {
      cards: list(hand["cards"]).flatMap((c) => cardOf(c) ?? []),
      revealed: ids(hand["revealed"]),
    },
    dealNeeded: s["deal_needed"] === true,
  };
}

/** The Meet tab's view of the server state. Your wave points are everyone who waved at you. */
export function meetViewOf(state: MeetState): MeetView {
  return {
    day: state.day,
    resetAt: state.resetAt,
    hand: state.hand.cards,
    revealed: state.hand.revealed,
    waved: state.waved,
    wavesLeft: state.wavesLeft,
    skipped: state.skipped,
    chais: state.chais,
    inbound: state.inbound,
    wavedAtYou: state.points,
    celebrate: state.chais.find((c) => !c.seen)?.personId ?? null,
  };
}

/** Handles someone revealed to you by a wave. */
export interface Contact {
  readonly telegram: string | null;
  readonly x: string | null;
  /**
   * They have a Telegram username, held back until your own Telegram is verified (Telegram is a
   * private DM; X is a public profile). Migration 20261013120000.
   */
  readonly telegramLocked: boolean;
}

function handleOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reads the `contacts` part of a `wave()` result, or a row of `get_contacts()`. */
export function contactOf(value: unknown): Contact | null {
  const c = raw(value);
  const contact = {
    telegram: handleOf(c["telegram"]),
    x: handleOf(c["x"]),
    telegramLocked: c["telegram_locked"] === true,
  };
  return contact.telegram || contact.x || contact.telegramLocked ? contact : null;
}

/** `get_contacts()` rows by person id. */
export function parseContacts(value: unknown): Map<string, Contact> {
  const found = new Map<string, Contact>();
  for (const row of list(value)) {
    const id = raw(row)["id"];
    const contact = contactOf(row);
    if (typeof id === "string" && contact) found.set(id, contact);
  }
  return found;
}
