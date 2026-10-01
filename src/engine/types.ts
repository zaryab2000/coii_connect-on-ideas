import type { Person, TopicId } from "@/data/types";

export interface EngineEvents {
  /** A bean was tapped (person id) or the selection was cleared on the map (null). */
  select: (personId: string | null) => void;
  boothTap: (topic: TopicId) => void;
  ready: () => void;
}

export interface EngineStats {
  readonly fps: number;
  readonly frameMs: number;
  readonly simMs: number;
  readonly beans: number;
  readonly particles: number;
  readonly zoom: number;
}

/**
 * Everything the React UI may ask of the venue. The real engine renders with PixiJS; a fake
 * implementation backs UI tests.
 */
export interface EngineApi {
  /** People present when the venue opens. Must be called before the first `mount`. */
  setPeople(people: readonly Person[]): void;
  mount(el: HTMLElement): void;
  unmount(): void;
  spawn(person: Person, fromGate: boolean): void;
  remove(personId: string): void;
  select(personId: string | null): void;
  locate(personId: string): void;
  focusBooth(topic: TopicId): void;
  highlightTopics(topics: readonly TopicId[]): void;
  fit(): void;
  /** Screen pixels at the top of the map covered by UI, so framing keeps content visible. */
  setInsets(top: number): void;
  pause(): void;
  resume(): void;
  setReducedMotion(reduced: boolean): void;
  stats(): EngineStats;
  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void;
}
