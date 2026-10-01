import type { Person } from "@/data/types";

/** Where new people come from. Today: a demo timer. Later: a real backend subscription. */
export interface PeopleSource {
  /** Starts delivering arrivals; returns a function that stops them. */
  start(onArrive: (person: Person) => void): () => void;
}

export interface DemoSourceOptions {
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
}

/** Releases the demo reserve one person at a time, pausing while the tab is hidden. */
export function demoSource(reserve: readonly Person[], options: DemoSourceOptions): PeopleSource {
  return {
    start(onArrive) {
      let next = 0;
      let timer: number | undefined;
      const schedule = (): void => {
        const delay =
          options.minDelayMs + Math.random() * (options.maxDelayMs - options.minDelayMs);
        timer = window.setTimeout(tick, delay);
      };
      const tick = (): void => {
        if (next >= reserve.length) return;
        if (!document.hidden) {
          const person = reserve[next++];
          if (person) onArrive({ ...person, joinedAt: Date.now() });
        }
        schedule();
      };
      schedule();
      return () => window.clearTimeout(timer);
    },
  };
}
