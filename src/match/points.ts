import type { Person } from "@/data/types";

/**
 * Wave points: every person who waves at you is one point. These helpers are pure; the app
 * keeps the live counts.
 */

function unitHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * Points a demo person already had when the demo opened: a long tail (most have a handful, a
 * few have dozens), nudged up by catchy one-liners. Real people start at zero.
 */
export function demoBasePoints(person: Person): number {
  if (!person.isDemo) return 0;
  return Math.floor(42 * unitHash(person.id) ** 2.6) + person.oneLiners.length * 2;
}

export interface BoardRow {
  readonly person: Person;
  readonly points: number;
  /** 1-based; people with equal points share a rank (1, 2, 2, 4). */
  readonly rank: number;
}

/** Everyone ranked by wave points, most first; ties share a rank and list alphabetically. */
export function leaderboard(
  people: readonly Person[],
  pointsOf: (person: Person) => number,
): BoardRow[] {
  const scored = people.map((person) => ({ person, points: pointsOf(person) }));
  scored.sort((a, b) => b.points - a.points || a.person.name.localeCompare(b.person.name));
  const rows: BoardRow[] = [];
  for (const [i, entry] of scored.entries()) {
    const previous = rows[i - 1];
    const rank = previous && previous.points === entry.points ? previous.rank : i + 1;
    rows.push({ ...entry, rank });
  }
  return rows;
}

/** Ids of the top `count` people (for crowns on the map); nobody with zero points. */
export function topIds(rows: readonly BoardRow[], count: number): string[] {
  return rows
    .slice(0, count)
    .filter((row) => row.points > 0)
    .map((row) => row.person.id);
}

/**
 * Who a simulated demo wave goes to. Catchy one-liners draw more waves, and so does being
 * popular already, but anyone can get one.
 */
export function demoWaveTarget(
  people: readonly Person[],
  pointsOf: (person: Person) => number,
  random: () => number,
): Person | null {
  const demo = people.filter((p) => p.isDemo);
  const weights = demo.map((p) => 1 + p.oneLiners.length * 1.5 + Math.sqrt(pointsOf(p)));
  let roll = random() * weights.reduce((sum, w) => sum + w, 0);
  for (const [i, person] of demo.entries()) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return person;
  }
  return demo[demo.length - 1] ?? null;
}

/** Where `person` stands: 1 + how many people have more points (ties share a rank). */
export function rankOf(
  people: readonly Person[],
  pointsOf: (person: Person) => number,
  person: Person,
): number {
  const mine = pointsOf(person);
  let ahead = 0;
  for (const other of people) if (pointsOf(other) > mine) ahead++;
  return ahead + 1;
}

/** The nearest person ahead of `id` on the board and how many more points pass them. */
export function chaseTarget(
  rows: readonly BoardRow[],
  id: string,
): { readonly person: Person; readonly need: number } | null {
  const at = rows.findIndex((row) => row.person.id === id);
  const mine = rows[at];
  if (!mine) return null;
  for (let i = at - 1; i >= 0; i--) {
    const row = rows[i];
    if (row && row.points > mine.points)
      return { person: row.person, need: row.points - mine.points + 1 };
  }
  return null;
}
