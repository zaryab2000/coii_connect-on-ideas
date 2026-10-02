// Turns `hand_inputs()` (docs/prd/database.md §9.1) into today's hand, using the same
// buildHand as the demo. Pure: no Deno APIs, so it is unit-tested from vitest as well.
import type { IntentId, Person, TopicId } from "./data/types.ts";
import { daysBetween } from "./match/day.ts";
import { buildHand, exposureCap } from "./match/hand.ts";
import type { Card } from "./match/hand.ts";
import type { ScoreContext } from "./match/score.ts";

/** A bean as `hand_inputs()` returns it (public fields only, no handles). */
export interface InputPerson {
  readonly id: string;
  readonly name: string;
  readonly topics: readonly string[];
  readonly intents: readonly string[];
  readonly one_liners: readonly string[];
  readonly joined_at: string;
  readonly source: "self" | "demo";
}

export interface HandInputs {
  readonly day: string;
  readonly now: string;
  readonly viewer: InputPerson;
  readonly candidates: readonly InputPerson[];
  readonly excluded: readonly string[];
  readonly recent_hands: readonly { readonly day: string; readonly cards: readonly Card[] }[];
  readonly waved_at_viewer: readonly string[];
  readonly inbound: Readonly<Record<string, number>>;
  readonly exposure: Readonly<Record<string, number>>;
  readonly hands_today: number;
  readonly hand: { readonly cards: readonly Card[]; readonly bonus: number } | null;
}

/** What `hand_inputs()` returns: the current hand when no deal is needed, else the inputs. */
export type HandInputsResult =
  | { readonly ready: true; readonly hand: unknown }
  | ({ readonly ready: false } & HandInputs);

/** The base hand; each in-person meeting confirmed today adds one card. */
export const HAND_SIZE = 3;

export function toPerson(p: InputPerson, isYou: boolean): Person {
  return {
    id: p.id,
    name: p.name,
    telegram: null,
    x: null,
    topics: p.topics as TopicId[],
    intent: p.intents as IntentId[],
    oneLiners: p.one_liners,
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    telegramVerified: false,
    ticketVerified: false,
    isDemo: p.source === "demo",
    isYou,
    origin: null,
    joinedAt: Date.parse(p.joined_at),
  };
}

/** People seen in hands 1–3 days ago fade back in, exactly like the demo's contextFor(). */
function shownBefore(inputs: HandInputs): Map<string, number> {
  const shown = new Map<string, number>();
  for (const hand of inputs.recent_hands) {
    const ago = daysBetween(hand.day, inputs.day);
    if (ago < 1 || ago > 3) continue;
    for (const card of hand.cards) {
      shown.set(card.personId, Math.max(shown.get(card.personId) ?? 0, 1 - (ago - 1) / 3));
    }
  }
  return shown;
}

/** Today's hand for the viewer: `3 + bonus` cards, keeping any already dealt today. */
export function dealFromInputs(inputs: HandInputs): Card[] {
  const viewer = toPerson(inputs.viewer, true);
  const context: ScoreContext = {
    now: Date.parse(inputs.now),
    shownBefore: shownBefore(inputs),
    wavedAtViewer: new Set(inputs.waved_at_viewer),
    inbound: new Map(Object.entries(inputs.inbound)),
  };
  return buildHand({
    viewer,
    people: [viewer, ...inputs.candidates.map((p) => toPerson(p, false))],
    day: inputs.day,
    size: HAND_SIZE + (inputs.hand?.bonus ?? 0),
    context,
    eligibility: { excluded: new Set(inputs.excluded), allowDemo: true },
    ...(inputs.hand ? { keep: inputs.hand.cards } : {}),
    exposure: {
      counts: new Map(Object.entries(inputs.exposure)),
      cap: exposureCap(inputs.hands_today),
    },
  });
}
