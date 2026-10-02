import { WAVES_PER_DAY } from "@/app/meet";
import type { WaveResult } from "@/app/meet";
import type { MeetView, Toast } from "@/app/store";
import type { IconId } from "@/data/types";
import type { ChaiStatus } from "@/match/storage";

const MINUTE_MS = 60_000;

/**
 * Time left until the next hand, rounded up to the minute so it never reads "0m" early:
 * "4h 12m", "3h", "12m", or "a moment" once it is due.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "a moment";
  const minutes = Math.ceil(ms / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function wavesLeftText(left: number): string {
  if (left <= 0) return "No waves left today";
  return `${left} ${left === 1 ? "wave" : "waves"} left today`;
}

/** The hidden-waves teaser. A count only: it never says who. */
export function inboundText(count: number): string {
  const who = count === 1 ? "1 person" : `${count} people`;
  return `${who} waved at you. They may show up in your next picks.`;
}

export const QUOTA_TEXT = `You've used today's ${WAVES_PER_DAY} waves. They refill at 06:00.`;

/** Where one of today's cards stands. */
export type CardState = "hidden" | "open" | "waved" | "chai" | "skipped";

/** A card stays face down until flipped, even if you already waved from their profile. */
export function cardState(meet: MeetView, personId: string): CardState {
  if (!meet.revealed.includes(personId)) return "hidden";
  if (meet.chais.some((c) => c.personId === personId)) return "chai";
  if (meet.waved.includes(personId)) return "waved";
  if (meet.skipped.includes(personId)) return "skipped";
  return "open";
}

/** Every card is flipped and answered with a wave or a skip. */
export function handDone(meet: MeetView): boolean {
  if (meet.hand.length === 0) return false;
  return meet.hand.every((card) => {
    const state = cardState(meet, card.personId);
    return state !== "hidden" && state !== "open";
  });
}

export function unrevealedCount(meet: MeetView): number {
  return meet.hand.filter((card) => !meet.revealed.includes(card.personId)).length;
}

export type MeetBadge =
  | { readonly kind: "count"; readonly count: number }
  | { readonly kind: "dot" }
  | null;

/** Meet tab badge: cards still face down today, else a dot for a chai you haven't seen. */
export function meetBadge(meet: MeetView | null): MeetBadge {
  if (!meet) return null;
  const count = unrevealedCount(meet);
  if (count > 0) return { kind: "count", count };
  return meet.chais.some((c) => !c.seen) ? { kind: "dot" } : null;
}

/** Accessible name for the Meet tab, including its badge. */
export function meetTabLabel(badge: MeetBadge): string {
  if (badge?.kind === "count") return `Meet, ${badge.count} new`;
  if (badge?.kind === "dot") return "Meet, new chai";
  return "Meet";
}

export interface ToastSpec {
  readonly text: string;
  readonly icon: IconId;
  readonly tone: Toast["tone"];
}

/** What to tell you after a wave, if anything. A chai shows its own moment instead. */
export function waveToast(result: WaveResult, name: string, firstWave: boolean): ToastSpec | null {
  const first = firstName(name);
  switch (result) {
    case "quota":
      return { text: QUOTA_TEXT, icon: "hot_beverage", tone: "info" };
    case "unavailable":
      return {
        text: `Couldn't wave at ${first}. They may have left the venue.`,
        icon: "waving_hand",
        tone: "info",
      };
    case "waved":
      return firstWave
        ? {
            text: `Wave sent! ${first} only finds out if they wave back.`,
            icon: "waving_hand",
            tone: "success",
          }
        : null;
    case "chai":
    case "already":
      return null;
  }
}

export function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

/** "looking for a role" → "Looking for a role", for intent chips. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const CHAI_STATUS_LABEL: Readonly<Record<ChaiStatus, string>> = {
  new: "New",
  messaged: "Messaged",
  met: "Met",
};

export type SwipeVerdict = "wave" | "skip" | null;

export interface SwipeInput {
  /** Horizontal travel in px; positive is to the right. */
  readonly dx: number;
  /** Release velocity in px/ms; positive is to the right. */
  readonly velocity: number;
  /** Card width in px. */
  readonly width: number;
}

/** A flick this fast commits even before the distance threshold. */
const FLICK_VELOCITY = 0.5;
/** A flick still has to travel this far, so a twitch never waves at anyone. */
const FLICK_MIN_PX = 40;

/** How far a card must be dragged to commit: a third of its width, at most 120px. */
export function swipeThreshold(width: number): number {
  return Math.min(120, width / 3);
}

/**
 * What a released card swipe means: right is a wave, left is a skip. Commits past the
 * distance threshold or on a quick flick outwards; a card being pulled back towards the
 * middle, or barely moved, snaps back.
 */
export function swipeDecision({ dx, velocity, width }: SwipeInput): SwipeVerdict {
  const fast = Math.abs(velocity) >= FLICK_VELOCITY;
  const pullingBack = fast && Math.sign(velocity) === -Math.sign(dx);
  if (pullingBack || Math.abs(dx) < FLICK_MIN_PX) return null;
  if (!fast && Math.abs(dx) < swipeThreshold(width)) return null;
  return dx > 0 ? "wave" : "skip";
}
