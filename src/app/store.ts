import { useSyncExternalStore } from "react";

import type { IconId, Person, TopicId } from "@/data/types";
import type { Card } from "@/match/hand";
import type { Chai } from "@/match/storage";

export type Panel = "none" | "profile" | "booth" | "people" | "join" | "meet";

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly icon: IconId | null;
  readonly tone: "arrival" | "info" | "success";
}

/** Everything the Meet tab shows (PRD: Who should I meet). Present once you have joined. */
export interface MeetView {
  /** Meet day the hand belongs to; days run 06:00–06:00 IST. */
  readonly day: string;
  /** When the next hand is dealt (epoch ms). */
  readonly resetAt: number;
  /** Today's Adda 3 (more with bonus cards for in-person meetings). */
  readonly hand: readonly Card[];
  /** People whose card you flipped today. */
  readonly revealed: readonly string[];
  /** Everyone you have waved at. */
  readonly waved: readonly string[];
  readonly wavesLeft: number;
  /** People you skipped who are hidden from hands for now. */
  readonly skipped: readonly string[];
  readonly chais: readonly Chai[];
  /** How many people waved at you without a chai yet. A count only, never who. */
  readonly inbound: number;
  /** Person whose "Chai's on!" moment should show now. */
  readonly celebrate: string | null;
}

export interface AppState {
  /** Everyone currently in the venue: demo crowd, live arrivals and you. */
  readonly people: readonly Person[];
  readonly selectedId: string | null;
  readonly boothTopic: TopicId | null;
  readonly panel: Panel;
  readonly highlight: readonly TopicId[];
  /**
   * True while the camera is centred on the selected person or booth (after `locate` or a booth
   * tap). The phone layout then lifts the map so that point stays visible above a sheet.
   */
  readonly framed: boolean;
  /** Topic to preselect when the join form opens (from a booth's "Join this booth"). */
  readonly joinTopic: TopicId | null;
  readonly you: Person | null;
  readonly toasts: readonly Toast[];
  /** Null until you join. */
  readonly meet: MeetView | null;
  /** "My tribe" map mode: everyone sharing your topics glows, the rest dim. */
  readonly tribe: boolean;
  readonly reducedMotion: boolean;
  readonly ready: boolean;
}

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const patch = typeof update === "function" ? update(state) : update;
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
