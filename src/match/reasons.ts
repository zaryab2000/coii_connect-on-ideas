import { adjacentTopics } from "@/data/affinity";
import { intentById } from "@/data/intents";
import { topicById } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { bestComplement, WEIGHTS } from "@/match/score";
import type { ScoreParts } from "@/match/score";

function sharedTopics(viewer: Person, candidate: Person): TopicId[] {
  return viewer.topics.filter((t) => candidate.topics.includes(t));
}

function topicReason(viewer: Person, candidate: Person): string | null {
  const shared = sharedTopics(viewer, candidate);
  if (shared.length === 0) return null;
  return `You both: ${shared.map((t) => topicById(t).short).join(" · ")}`;
}

function intentReason(viewer: Person, candidate: Person): string | null {
  const { pair } = bestComplement(viewer, candidate);
  if (!pair) return null;
  const [yours, theirs] = pair;
  if (yours === theirs) return `You're both ${intentById(yours).phrase}`;
  return `They're ${intentById(theirs).phrase} · you're ${intentById(yours).phrase}`;
}

/** "Wildcard: DeFi is next door to Prediction" for a neighbouring-topic pick. */
export function wildcardReason(viewer: Person, candidate: Person): string {
  const theirs = candidate.topics[0];
  if (!theirs) return "Wildcard: someone from another corner of the adda";
  const next = viewer.topics.find((t) => adjacentTopics(t).includes(theirs)) ?? viewer.topics[0];
  const theirName = topicById(theirs).short;
  return next
    ? `Wildcard: ${theirName} is next door to ${topicById(next).short}`
    : `Wildcard: ${theirName}`;
}

/**
 * Up to two human reasons, strongest contribution first. The hidden "waved at you" boost is
 * never turned into a reason (PRD §6.5).
 */
export function reasonsFor(
  viewer: Person,
  candidate: Person,
  parts: ScoreParts,
  wildcard: boolean,
): string[] {
  const ranked: { weight: number; text: string | null }[] = [
    { weight: WEIGHTS.topic * parts.topic, text: topicReason(viewer, candidate) },
    { weight: WEIGHTS.intent * parts.intent, text: intentReason(viewer, candidate) },
    {
      weight: WEIGHTS.keywords * parts.keywords,
      text: parts.keyword ? `You both mention "${parts.keyword}"` : null,
    },
  ];
  const reasons = ranked
    .filter((r) => r.weight > 0 && r.text !== null)
    .toSorted((a, b) => b.weight - a.weight)
    .map((r) => r.text as string);
  if (wildcard) reasons.unshift(wildcardReason(viewer, candidate));
  if (reasons.length === 0) {
    const booth = candidate.topics[0];
    reasons.push(
      booth ? `Hangs out at the ${topicById(booth).short} booth` : "New face in the adda",
    );
  }
  return reasons.slice(0, 2);
}
