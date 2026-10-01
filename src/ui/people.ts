import type { IntentId, Person, TopicId } from "@/data/types";

export type TopicMatch = "any" | "all";
export type SortKey = "newest" | "name" | "match";

export interface PeopleQuery {
  readonly search: string;
  readonly topics: readonly TopicId[];
  readonly match: TopicMatch;
  /** People here for any of these (empty: everyone). */
  readonly intents: readonly IntentId[];
  readonly sort: SortKey;
}

const searchCache = new WeakMap<Person, string>();

function searchText(person: Person): string {
  let text = searchCache.get(person);
  if (text === undefined) {
    text = [person.name, person.telegram ?? "", person.x ?? "", person.oneLiner ?? ""]
      .join("\n")
      .toLowerCase();
    searchCache.set(person, text);
  }
  return text;
}

/** Lower-cased search terms; a leading "@" is ignored so handles match as typed. */
export function searchTerms(search: string): string[] {
  return search
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^@/, ""))
    .filter((term) => term.length > 0);
}

function matchesTopics(person: Person, topics: readonly TopicId[], match: TopicMatch): boolean {
  if (topics.length === 0) return true;
  return match === "all"
    ? topics.every((t) => person.topics.includes(t))
    : topics.some((t) => person.topics.includes(t));
}

/** How many topics two people share. */
export function sharedTopicCount(a: Person, b: Person): number {
  let count = 0;
  for (const topic of a.topics) if (b.topics.includes(topic)) count += 1;
  return count;
}

function matchesIntents(person: Person, intents: readonly IntentId[]): boolean {
  return intents.length === 0 || intents.some((i) => person.intent.includes(i));
}

function newest(a: Person, b: Person): number {
  return b.joinedAt - a.joinedAt;
}

function compareFor(sort: SortKey, you: Person | null): (a: Person, b: Person) => number {
  if (sort === "name") return (a, b) => a.name.localeCompare(b.name, "en");
  if (sort === "match" && you) {
    return (a, b) => sharedTopicCount(b, you) - sharedTopicCount(a, you) || newest(a, b);
  }
  return newest;
}

/**
 * Filters and sorts people for the list. Search matches every term against name, handles and
 * one-liner; the intent filter keeps people here for any picked intent. "Best match" ranks by topics shared with `you` and falls back to newest when you
 * have not joined. You are never listed as your own best match.
 */
export function queryPeople(
  people: readonly Person[],
  query: PeopleQuery,
  you: Person | null,
): Person[] {
  const terms = searchTerms(query.search);
  const result = people.filter((person) => {
    if (query.sort === "match" && person.isYou) return false;
    if (!matchesTopics(person, query.topics, query.match)) return false;
    if (!matchesIntents(person, query.intents)) return false;
    if (terms.length === 0) return true;
    const text = searchText(person);
    return terms.every((term) => text.includes(term));
  });
  return result.toSorted(compareFor(query.sort, you));
}

/** Everyone interested in `topic`, newest first. */
export function peopleInTopic(people: readonly Person[], topic: TopicId): Person[] {
  return people.filter((p) => p.topics.includes(topic)).toSorted(newest);
}
