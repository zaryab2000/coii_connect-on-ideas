import type { Person } from "@/data/types";
import { topicOverlap } from "@/match/score";

export interface DemoReply {
  readonly wavesBack: boolean;
  readonly delayMs: number;
}

/**
 * Demo people answer waves so the Meet loop is playable before real sign-ups (PRD §9). The
 * odds rise with shared topics. Never used for real people.
 */
export function demoReply(viewer: Person, target: Person, random: () => number): DemoReply {
  const chance = 0.25 + 0.15 * topicOverlap(viewer, target);
  return { wavesBack: random() < chance, delayMs: 4000 + random() * 21_000 };
}

/**
 * A few demo people with something in common "already waved" at you; they stay hidden and are
 * only revealed by a mutual wave, like real inbound waves.
 */
export function demoInboundWaves(
  viewer: Person,
  people: readonly Person[],
  random: () => number,
): string[] {
  const candidates = people.filter((p) => p.isDemo && topicOverlap(viewer, p) > 0);
  const count = Math.floor(random() * 3);
  const picked = new Set<string>();
  for (let attempt = 0; attempt < 20 && picked.size < count && candidates.length > 0; attempt++) {
    const person = candidates[Math.floor(random() * candidates.length)];
    if (person) picked.add(person.id);
  }
  return [...picked];
}

/**
 * One demo person who shares a topic with you and hasn't waved yet waves at you now (the live
 * "someone waved at you" moment). Null when nobody suitable is left.
 */
export function demoWaveAtYou(
  viewer: Person,
  people: readonly Person[],
  exclude: ReadonlySet<string>,
  random: () => number,
): string | null {
  const candidates = people.filter(
    (p) => p.isDemo && !exclude.has(p.id) && topicOverlap(viewer, p) > 0,
  );
  return candidates[Math.floor(random() * candidates.length)]?.id ?? null;
}
