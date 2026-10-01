import { useSyncExternalStore } from "react";

import type { IconId, Person, TopicId } from "@/data/types";

export type Panel = "none" | "profile" | "booth" | "people" | "join";

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly icon: IconId | null;
  readonly tone: "arrival" | "info" | "success";
}

export interface AppState {
  /** Everyone currently in the venue: demo crowd, live arrivals and you. */
  readonly people: readonly Person[];
  readonly selectedId: string | null;
  readonly boothTopic: TopicId | null;
  readonly panel: Panel;
  readonly highlight: readonly TopicId[];
  readonly you: Person | null;
  readonly toasts: readonly Toast[];
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
