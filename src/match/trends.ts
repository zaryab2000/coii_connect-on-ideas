import { TOPICS } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";

/**
 * The narrative race: which booths (topics) people are lining up behind, and which ones are
 * picking up speed. Someone with three topics counts once in each.
 */
export interface TrendRow {
  readonly topic: TopicId;
  /** Everyone who picked this topic. */
  readonly count: number;
  /** Of those, how many joined since `since`. */
  readonly recent: number;
  /** 1-based place by `count`; ties share a place. */
  readonly rank: number;
}

/** How long "today" is for the race: a rolling 24 hours. */
export const TREND_DAY_MS = 24 * 60 * 60 * 1000;

/** A booth needs this many recent joins before it can be the hottest (no 1-person spikes). */
const HOT_MIN_RECENT = 3;

/** Counts per topic, biggest first; ties keep the booth order so rows don't flicker. */
export function trendRows(people: readonly Person[], since: number): TrendRow[] {
  const count = new Map<TopicId, number>();
  const recent = new Map<TopicId, number>();
  for (const person of people) {
    const isRecent = person.joinedAt >= since;
    for (const topic of person.topics) {
      count.set(topic, (count.get(topic) ?? 0) + 1);
      if (isRecent) recent.set(topic, (recent.get(topic) ?? 0) + 1);
    }
  }
  const rows = TOPICS.map((t) => ({
    topic: t.id,
    count: count.get(t.id) ?? 0,
    recent: recent.get(t.id) ?? 0,
  }));
  return ranked(
    rows.toSorted((a, b) => b.count - a.count),
    (r) => r.count,
  );
}

/** Numbers sorted rows 1, 2, 3…; rows with the same score share a place. */
function ranked(
  sorted: readonly Omit<TrendRow, "rank">[],
  score: (row: Omit<TrendRow, "rank">) => number,
): TrendRow[] {
  let rank = 0;
  return sorted.map((row, i) => {
    const prev = sorted[i - 1];
    if (!prev || score(row) !== score(prev)) rank = i + 1;
    return { topic: row.topic, count: row.count, recent: row.recent, rank };
  });
}

/** Growth over the window: recent joins against the crowd the booth had before them. */
export function growth(row: TrendRow): number {
  return row.recent / Math.max(1, row.count - row.recent);
}

/**
 * The fastest-rising booth, not the biggest: the best growth among booths with at least a few
 * recent joins (more recent joins break ties). Null while nothing is moving.
 */
export function hottest(rows: readonly TrendRow[]): TopicId | null {
  let best: TrendRow | null = null;
  for (const row of rows) if (row.recent >= HOT_MIN_RECENT && beats(row, best)) best = row;
  return best?.topic ?? null;
}

function beats(row: TrendRow, best: TrendRow | null): boolean {
  if (!best) return true;
  const g = growth(row);
  const b = growth(best);
  return g > b || (g === b && row.recent > best.recent);
}

/** The same rows ordered by recent joins, for "Rising fastest"; ranks follow that order. */
export function risingRows(rows: readonly TrendRow[]): TrendRow[] {
  return ranked(
    rows.toSorted((a, b) => b.recent - a.recent || b.count - a.count),
    (r) => r.recent,
  );
}

/** 0 (quiet) to 3 (on fire): recent joins against the busiest booth's. */
export type HeatLevel = 0 | 1 | 2 | 3;

export function heatLevel(row: TrendRow, rows: readonly TrendRow[]): HeatLevel {
  if (row.recent <= 0) return 0;
  const top = Math.max(...rows.map((r) => r.recent));
  const share = row.recent / Math.max(1, top);
  if (share >= 2 / 3) return 3;
  if (share >= 1 / 3) return 2;
  return 1;
}

/** Who a booth chases next: the booth just above it and how many people it needs to pass. */
export function chaseOf(
  rows: readonly TrendRow[],
  topic: TopicId,
): { readonly row: TrendRow; readonly ahead: TrendRow | null; readonly need: number } | null {
  const index = rows.findIndex((r) => r.topic === topic);
  const row = rows[index];
  if (!row) return null;
  const ahead = rows.slice(0, index).findLast((r) => r.count > row.count) ?? null;
  return { row, ahead, need: ahead ? ahead.count - row.count + 1 : 0 };
}
