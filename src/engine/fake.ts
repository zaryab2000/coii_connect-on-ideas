import type { Person, TopicId } from "@/data/types";
import type { EngineApi, EngineEvents, EngineStats } from "@/engine/types";

/** In-memory stand-in for the venue engine, for UI work and tests without WebGL. */
export class FakeEngine implements EngineApi {
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly present = new Map<string, Person>();
  private readonly listeners: { [K in keyof EngineEvents]: Set<EngineEvents[K]> } = {
    select: new Set(),
    boothTap: new Set(),
    ready: new Set(),
  };

  private log(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  setPeople(people: readonly Person[]): void {
    this.log("setPeople", people.length);
    for (const p of people) this.present.set(p.id, p);
  }
  mount(): void {
    this.log("mount");
    for (const listener of this.listeners.ready) listener();
  }
  unmount(): void {
    this.log("unmount");
  }
  spawn(person: Person, fromGate: boolean): void {
    this.log("spawn", person.id, fromGate);
    this.present.set(person.id, person);
  }
  remove(personId: string): void {
    this.log("remove", personId);
    this.present.delete(personId);
  }
  select(personId: string | null): void {
    this.log("select", personId);
  }
  locate(personId: string): void {
    this.log("locate", personId);
  }
  focusBooth(topic: TopicId): void {
    this.log("focusBooth", topic);
  }
  highlightTopics(topics: readonly TopicId[]): void {
    this.log("highlightTopics", [...topics]);
  }
  fit(): void {
    this.log("fit");
  }
  highlightPeople(personIds: readonly string[]): void {
    this.log("highlightPeople", [...personIds]);
  }
  setPicks(personIds: readonly string[]): void {
    this.log("setPicks", [...personIds]);
  }
  chaiMoment(aId: string, bId: string): void {
    this.log("chaiMoment", aId, bId);
  }
  greet(personId: string): void {
    this.log("greet", personId);
  }

  pointPop(personId: string): void {
    this.log("pointPop", personId);
  }

  setCrowns(personIds: readonly string[]): void {
    this.log("setCrowns", [...personIds]);
  }
  setInsets(top: number): void {
    this.log("setInsets", top);
  }
  pause(): void {
    this.log("pause");
  }
  resume(): void {
    this.log("resume");
  }
  setReducedMotion(reduced: boolean): void {
    this.log("setReducedMotion", reduced);
  }
  stats(): EngineStats {
    return { fps: 60, frameMs: 1, simMs: 0.5, beans: this.present.size, particles: 0, zoom: 1 };
  }
  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void {
    const set = this.listeners[event] as Set<EngineEvents[K]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Simulate a tap on a bean in the map. */
  emitSelect(personId: string | null): void {
    for (const listener of this.listeners.select) listener(personId);
  }

  emitBoothTap(topic: TopicId): void {
    for (const listener of this.listeners.boothTap) listener(topic);
  }
}
