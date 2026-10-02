import type { MeetClock } from "@/app/meet";
import type { AppState, PointsState, Store } from "@/app/store";
import type { Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";
import { demoBasePoints, demoWaveTarget, leaderboard, topIds } from "@/match/points";

const KEY = "coii:points:v1";
const CROWNS = 3;

const readers = new WeakMap<AppState, (person: Person) => number>();

/**
 * Anyone's live wave points in this state: their starting points, plus waves the demo crowd
 * gave them, plus one if you waved. Yours are everyone who waved at you. Cached per state.
 */
export function pointsReader(state: AppState): (person: Person) => number {
  const cached = readers.get(state);
  if (cached) return cached;
  const waved = new Set(state.meet?.waved ?? []);
  const yours = state.meet?.wavedAtYou ?? 0;
  const { extra } = state.points;
  const reader = (person: Person): number => {
    if (person.isYou) return yours;
    return demoBasePoints(person) + (extra.get(person.id) ?? 0) + (waved.has(person.id) ? 1 : 0);
  };
  readers.set(state, reader);
  return reader;
}

/** Demo waves remembered in this browser, so the board doesn't reset on reload. */
export function loadPoints(): PointsState {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const entries = Object.entries((parsed as { extra?: unknown } | null)?.extra ?? {});
    const extra = new Map(entries.filter((e): e is [string, number] => typeof e[1] === "number"));
    return { extra, lastBump: null };
  } catch {
    return { extra: new Map(), lastBump: null };
  }
}

function savePoints(points: PointsState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ extra: Object.fromEntries(points.extra) }));
  } catch {
    // Storage blocked: the board still works, it just starts over next visit.
  }
}

export interface PointsController {
  /** Someone just got a point: "+1" pops over their bean and the crowns catch up. */
  bump(personId: string): void;
  /** The demo crowd waves at each other every few seconds; returns a stop function. */
  startDemoWaves(): () => void;
  /** Puts crowns on the current top three. */
  refreshCrowns(): void;
}

class Points implements PointsController {
  private crowned = "";

  constructor(
    private readonly engine: EngineApi,
    private readonly store: Store<AppState>,
    private readonly clock: MeetClock,
  ) {}

  readonly bump = (personId: string): void => {
    this.store.set((s) => ({
      points: { ...s.points, lastBump: { id: personId, at: this.clock.now() } },
    }));
    this.engine.pointPop(personId);
    this.refreshCrowns();
  };

  readonly refreshCrowns = (): void => {
    const state = this.store.get();
    const ids = topIds(leaderboard(state.people, pointsReader(state)), CROWNS);
    const key = ids.join(",");
    if (key === this.crowned) return;
    this.crowned = key;
    this.engine.setCrowns(ids);
  };

  readonly startDemoWaves = (): (() => void) => {
    let cancel: (() => void) | null = null;
    const next = (): void => {
      cancel = this.clock.schedule(
        () => {
          this.demoWave();
          next();
        },
        2500 + this.clock.random() * 3500,
      );
    };
    next();
    return () => cancel?.();
  };

  /** One demo person waves at another: +1 for the target. */
  private demoWave(): void {
    const state = this.store.get();
    const target = demoWaveTarget(state.people, pointsReader(state), this.clock.random);
    if (!target) return;
    const extra = new Map(state.points.extra);
    extra.set(target.id, (extra.get(target.id) ?? 0) + 1);
    const points: PointsState = { extra, lastBump: state.points.lastBump };
    this.store.set({ points });
    savePoints(points);
    this.bump(target.id);
  }
}

export function createPoints(
  engine: EngineApi,
  store: Store<AppState>,
  clock: MeetClock,
): PointsController {
  return new Points(engine, store, clock);
}
