import type { Person } from "@/data/types";

const MIN_TRIBE = 15;

function shared(a: Person, b: Person): number {
  return a.topics.filter((t) => b.topics.includes(t)).length;
}

/**
 * Your tribe (PRD §6.6): everyone sharing 2+ of your topics, falling back to 1+ when fewer
 * than 15 people qualify. Never includes you.
 */
export function tribeOf(you: Person, people: readonly Person[]): string[] {
  const others = people.filter((p) => p.id !== you.id && !p.isYou);
  const strict = others.filter((p) => shared(you, p) >= 2);
  const tribe = strict.length >= MIN_TRIBE ? strict : others.filter((p) => shared(you, p) >= 1);
  return tribe.map((p) => p.id);
}
