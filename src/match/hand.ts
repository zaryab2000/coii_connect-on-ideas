import { adjacentTopics } from "@/data/affinity";
import type { Person } from "@/data/types";
import { reasonsFor } from "@/match/reasons";
import { isEligible, scoreParts, totalScore } from "@/match/score";
import type { Eligibility, ScoreContext, ScoreParts } from "@/match/score";

/** One card in today's 3 picks. */
export interface Card {
  readonly personId: string;
  readonly wildcard: boolean;
  readonly reasons: readonly string[];
}

export interface HandRequest {
  readonly viewer: Person;
  readonly people: readonly Person[];
  /** Meet day (`meetDay`), so the same hand comes back all day. */
  readonly day: string;
  /** Usually 3; bonus cards for in-person meetings raise it. */
  readonly size: number;
  readonly context: ScoreContext;
  readonly eligibility: Eligibility;
  /** Cards already dealt today; kept in place when bonus cards are added. */
  readonly keep?: readonly Card[];
  /**
   * How often each person was already dealt today across everyone's hands. People at the cap
   * are skipped so attention spreads out (PRD §6.4; the server supplies real counts).
   */
  readonly exposure?: Exposure;
}

export interface Exposure {
  readonly counts: ReadonlyMap<string, number>;
  readonly cap: number;
}

/** "No person in more than 2% of all hands that day", with a floor so small days still work. */
export function exposureCap(handsToday: number): number {
  return Math.max(3, Math.ceil(handsToday * 0.02));
}

function overexposed(req: HandRequest, id: string): boolean {
  const exposure = req.exposure;
  return exposure !== undefined && (exposure.counts.get(id) ?? 0) >= exposure.cap;
}

interface Scored {
  readonly person: Person;
  readonly parts: ScoreParts;
  readonly total: number;
}

/** Stable per (viewer, day, candidate) noise in [0, 0.3) so equal scores vary day to day. */
function jitter(viewerId: string, day: string, candidateId: string): number {
  let hash = 2166136261;
  const key = `${viewerId}|${day}|${candidateId}`;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (((hash >>> 0) % 10_000) / 10_000) * 0.3;
}

function rank(req: HandRequest): Scored[] {
  const scored: Scored[] = [];
  for (const person of req.people) {
    if (!isEligible(req.viewer, person, req.eligibility) || overexposed(req, person.id)) continue;
    const parts = scoreParts(req.viewer, person, req.context);
    scored.push({
      person,
      parts,
      total: totalScore(parts) + jitter(req.viewer.id, req.day, person.id),
    });
  }
  return scored.toSorted((a, b) => b.total - a.total || a.person.id.localeCompare(b.person.id));
}

function topicKey(person: Person): string {
  return person.topics.toSorted().join("+");
}

/** Next best candidate, preferring a new topic mix if one scores within 10% of the top. */
function nextBest(
  ranked: readonly Scored[],
  taken: ReadonlySet<string>,
  usedKeys: ReadonlySet<string>,
): Scored | null {
  const remaining = ranked.filter((s) => !taken.has(s.person.id));
  const top = remaining[0];
  if (!top) return null;
  if (!usedKeys.has(topicKey(top.person))) return top;
  const floor = top.total - Math.abs(top.total) * 0.1;
  return remaining.find((s) => s.total >= floor && !usedKeys.has(topicKey(s.person))) ?? top;
}

function pickBest(ranked: readonly Scored[], count: number, taken: Set<string>): Scored[] {
  const picks: Scored[] = [];
  const usedKeys = new Set<string>();
  while (picks.length < count) {
    const choice = nextBest(ranked, taken, usedKeys);
    if (!choice) break;
    picks.push(choice);
    taken.add(choice.person.id);
    usedKeys.add(topicKey(choice.person));
  }
  return picks;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Best person from a neighbouring topic who shares none of the viewer's topics. */
function pickWildcard(
  viewer: Person,
  ranked: readonly Scored[],
  taken: ReadonlySet<string>,
  floor: number,
): Scored | null {
  const near = new Set(viewer.topics.flatMap((t) => adjacentTopics(t)));
  for (const s of ranked) {
    const primary = s.person.topics[0];
    if (taken.has(s.person.id) || !primary || !near.has(primary)) continue;
    if (s.person.topics.some((t) => viewer.topics.includes(t))) continue;
    return s.total >= floor ? s : null;
  }
  return null;
}

function toCard(viewer: Person, s: Scored, wildcard: boolean): Card {
  return {
    personId: s.person.id,
    wildcard,
    reasons: reasonsFor(viewer, s.person, s.parts, wildcard),
  };
}

/**
 * Today's 3 picks (PRD §6.2): the best two people plus one wildcard from an adjacent topic,
 * deterministic for (viewer, day). Fewer cards only when fewer people are eligible.
 */
export function buildHand(req: HandRequest): Card[] {
  const keep = req.keep ?? [];
  const taken = new Set(keep.map((c) => c.personId));
  const open = req.size - keep.length;
  if (open <= 0) return [...keep];
  const ranked = rank(req);
  const wantWildcard = keep.length === 0 && req.size >= 3;
  const best = pickBest(ranked, open - (wantWildcard ? 1 : 0), taken);
  const cards = [...keep, ...best.map((s) => toCard(req.viewer, s, false))];
  if (!wantWildcard) return cards;
  const floor = 0.5 * median(best.map((s) => s.total));
  const wildcard = pickWildcard(req.viewer, ranked, taken, floor);
  if (wildcard) return [...cards, toCard(req.viewer, wildcard, true)];
  return [...cards, ...pickBest(ranked, 1, taken).map((s) => toCard(req.viewer, s, false))];
}
