import { useSyncExternalStore } from "react";

import type { AddaInvite, AddaRef, JoinedAdda, MyAdda } from "@/adda/storage";
import type { ClaimView } from "@/app/claim";
import type { IconId, Person, TopicId } from "@/data/types";
import type { Card } from "@/match/hand";
import type { Chai } from "@/match/storage";
import type { TrendRow } from "@/match/trends";

export type Panel = "none" | "profile" | "booth" | "people" | "meet" | "adda";

/** Centred cards above everything else; the venue keeps moving behind them. */
export type Overlay =
  | "none"
  | "about"
  | "you"
  | "board"
  | "share"
  | "drop"
  | "invite"
  | "trends"
  | "privacy"
  | "claim";

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
  /** Today's 3 picks (more with bonus cards for in-person meetings). */
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
  /** Everyone who has waved at you, chais included: your wave points. */
  readonly wavedAtYou: number;
  /** Person whose "Chai's on!" moment should show now. */
  readonly celebrate: string | null;
}

/** Your addas (spec: docs/prd/iteration_v2_feature.md). Present once you have joined. */
export interface AddaView {
  /** Up to three; anyone who said no still shows as invited. */
  readonly addas: readonly MyAdda[];
  /** Invites waiting for your answer. */
  readonly invites: readonly AddaInvite[];
  /** Other people's addas you are in. */
  readonly joined: readonly JoinedAdda[];
  /** A joined adda shown on the map next to yours, or null. */
  readonly viewing: AddaRef | null;
}

/** You dropped someone on one of your tents before waving at and adding them. */
export interface AddaDrop {
  readonly personId: string;
  readonly addaId: string;
}

/** Live wave points on top of what is derived from people and Meet (see `pointsReader`). */
export interface PointsState {
  /** Waves the demo crowd gave each other while you watched, by person id. */
  readonly extra: ReadonlyMap<string, number>;
  /** Who got the latest point and when, so lists can flash it. */
  readonly lastBump: { readonly id: string; readonly at: number } | null;
}

/** The narrative race over the last 24 hours (recounted whenever someone joins or leaves). */
export interface RaceView {
  /** Every booth by people, with joins in the last 24 hours. */
  readonly rows: readonly TrendRow[];
  /** The fastest-rising booth, or null while nothing is moving. */
  readonly hot: TopicId | null;
}

/** The latest person to walk in, so the narrative race can flash "+1" on their booths. */
export interface Arrival {
  readonly id: string;
  /** First name, or "You". */
  readonly name: string;
  readonly topics: readonly TopicId[];
  readonly at: number;
}

/**
 * Demo mode: a generated crowd, everything kept in this browser. Backend mode: the shared
 * database (docs/prd/database.md §15).
 */
export type AppMode = "demo" | "backend";

/** Someone's wave points from the database: all-time and this Meet day. */
export interface Score {
  readonly p: number;
  readonly d: number;
}

/** Backend mode: your signed-in account. */
export interface AccountView {
  /** Google is linked, so the bean survives signing out and can be restored elsewhere. */
  readonly google: boolean;
  /** Your bean is hidden after reports: you can still see and edit it, but nobody else can. */
  readonly hidden: boolean;
}

export interface AppState {
  readonly mode: AppMode;
  /** Everyone currently in the venue: demo crowd, live arrivals and you. */
  readonly people: readonly Person[];
  /** Backend mode: wave points from the database, by person id. Null in demo mode. */
  readonly scores: ReadonlyMap<string, Score> | null;
  /** Backend mode: your session, or null when you have none (demo mode: always null). */
  readonly account: AccountView | null;
  /** Backend mode: Cloudflare Turnstile site key for the join form. */
  readonly turnstileSiteKey: string | null;
  /** A profile from demo mode in this browser, offered once to prefill the join form. */
  readonly joinPrefill: Person | null;
  readonly selectedId: string | null;
  readonly boothTopic: TopicId | null;
  readonly panel: Panel;
  /** About, or your own profile (join, view, edit). */
  readonly overlay: Overlay;
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
  /** Null until you join. */
  readonly adda: AddaView | null;
  /** What the "wave + add first" popup is about. */
  readonly addaDrop: AddaDrop | null;
  /** Booth the invite link starts at, when the invite card opens from a booth's race row. */
  readonly inviteTopic: TopicId | null;
  readonly lastArrival: Arrival | null;
  readonly race: RaceView;
  /** Which of your addas the share card shows. */
  readonly shareAddaId: string | null;
  /** Backend mode: what the claim overlay shows (a claim link, or an invited bean you may be). */
  readonly claim: ClaimView | null;
  /** Open your profile on the edit form (right after claiming a bean, to check it over). */
  readonly editYou: boolean;
  /** "My tribe" map mode: everyone sharing your topics glows, the rest dim. */
  readonly tribe: boolean;
  readonly points: PointsState;
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
