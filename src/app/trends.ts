import type { MeetClock } from "@/app/meet";
import type { AppState, Store } from "@/app/store";
import type { Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";
import { heatLevel, hottest, TREND_DAY_MS, trendRows } from "@/match/trends";

export interface TrendsController {
  /** Recounts the race and redraws the booth-sign badges. */
  sync(): void;
  /** Someone just walked in: their booths get a "+1 Name" and the race moves. */
  arrived(person: Person): void;
}

/** Feeds the narrative race to the map: flames and joins today on each booth sign. */
export function createTrends(deps: {
  readonly engine: EngineApi;
  readonly store: Store<AppState>;
  readonly clock: MeetClock;
}): TrendsController {
  const { engine, store, clock } = deps;
  const sync = (): void => {
    const rows = trendRows(store.get().people, clock.now() - TREND_DAY_MS);
    const hot = hottest(rows);
    store.set({ race: { rows, hot } });
    engine.setBoothHeat(
      rows.map((row) => ({
        topic: row.topic,
        today: row.recent,
        level: heatLevel(row, rows),
        hottest: row.topic === hot,
      })),
    );
  };
  return {
    sync,
    arrived(person) {
      const who = person.isYou ? "You" : (person.name.split(" ")[0] ?? person.name);
      for (const topic of person.topics) engine.boothPop(topic, `+1 ${who}`);
      store.set({
        lastArrival: { id: person.id, name: who, topics: person.topics, at: clock.now() },
      });
      sync();
    },
  };
}
