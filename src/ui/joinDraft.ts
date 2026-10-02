import type { JoinInput } from "@/app/controller";
import { cleanText, nameHasLink, normalizeTelegram, normalizeX } from "@/data/handles";
import { INTENTS_MAX } from "@/data/intents";
import { oneLinerError, ONE_LINERS_MAX } from "@/data/oneLinerRules";
import type { Avatar, IntentId, Person, TopicId } from "@/data/types";

export const NAME_MAX = 40;
export const TOPICS_MAX = 3;

/** What the join form holds while you type. */
export interface JoinDraft {
  readonly name: string;
  readonly telegram: string;
  readonly x: string;
  readonly topics: readonly TopicId[];
  readonly intent: readonly IntentId[];
  /** One input per line, 1 to 3 of them; blank lines are dropped on submit. */
  readonly oneLiners: readonly string[];
  readonly avatar: Avatar;
  readonly consent: boolean;
}

export type JoinField = "name" | "handles" | "telegram" | "x" | "topics" | "oneLiners" | "consent";

export type JoinErrors = Partial<Record<JoinField, string>>;

export type JoinResult =
  | { readonly ok: true; readonly input: JoinInput }
  | { readonly ok: false; readonly errors: JoinErrors };

/** Field order, used to focus the first problem after a submit. */
export const JOIN_FIELDS: readonly JoinField[] = [
  "name",
  "telegram",
  "x",
  "handles",
  "topics",
  "oneLiners",
  "consent",
];

function handle(raw: string, normalize: typeof normalizeTelegram): string | null | Error {
  if (raw.trim().length === 0) return null;
  const result = normalize(raw);
  return result.ok ? result.value : new Error(result.error);
}

function checkTopics(topics: readonly TopicId[]): string | undefined {
  if (topics.length === 0) return "Pick at least one topic.";
  if (topics.length > TOPICS_MAX) return `Pick up to ${TOPICS_MAX} topics.`;
  return undefined;
}

/** One message per one-liner input (undefined where the line is fine or blank). */
export function lineErrors(lines: readonly string[]): (string | undefined)[] {
  return lines.map((line) => oneLinerError(cleanText(line)));
}

/** The lines you actually wrote: trimmed, blanks and repeats dropped, at most three. */
function cleanLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of lines) {
    const line = cleanText(raw);
    const key = line.toLowerCase();
    if (line.length === 0 || seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
  }
  return kept.slice(0, ONE_LINERS_MAX);
}

function checkName(name: string): string | undefined {
  if (name.length === 0) return "Add your name.";
  if (name.length > NAME_MAX) return `Keep your name to ${NAME_MAX} characters.`;
  if (nameHasLink(name)) return "Names can't contain links. Add your handles below instead.";
  return undefined;
}

type Handle = string | null | Error;

/** Error messages for the two handle fields; at least one valid handle is required. */
function handleErrors(telegram: Handle, x: Handle): JoinErrors {
  const errors: JoinErrors = {};
  if (telegram instanceof Error) errors.telegram = telegram.message;
  if (x instanceof Error) errors.x = x.message;
  if (telegram === null && x === null) errors.handles = "Add a Telegram username or an X handle.";
  return errors;
}

function fieldErrors(name: string, draft: JoinDraft): JoinErrors {
  const errors: JoinErrors = {};
  const nameError = checkName(name);
  if (nameError) errors.name = nameError;
  const topicError = checkTopics(draft.topics);
  if (topicError) errors.topics = topicError;
  if (lineErrors(draft.oneLiners).some(Boolean))
    errors.oneLiners = "Fix the one-liner marked below.";
  if (!draft.consent) errors.consent = "Tick this so people can see your bean.";
  return errors;
}

/**
 * Validates the join form. Returns the cleaned `JoinInput` or one message per problem field.
 * At least one handle is required; each handle that is filled in must be valid.
 */
export function validateJoin(draft: JoinDraft): JoinResult {
  const name = cleanText(draft.name);
  const telegram = handle(draft.telegram, normalizeTelegram);
  const x = handle(draft.x, normalizeX);
  const errors: JoinErrors = {
    ...fieldErrors(name, draft),
    ...handleErrors(telegram, x),
  };
  if (Object.keys(errors).length > 0 || telegram instanceof Error || x instanceof Error) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      name,
      telegram,
      x,
      topics: [...draft.topics],
      intent: draft.intent.slice(0, INTENTS_MAX),
      oneLiners: cleanLines(draft.oneLiners),
      avatar: draft.avatar,
    },
  };
}

/** A copy of the one-liner inputs with line `index` set to `value` (newlines become spaces). */
export function setLine(lines: readonly string[], index: number, value: string): string[] {
  return lines.map((line, i) => (i === index ? value.replace(/\n/g, " ") : line));
}

/** Adds an empty one-liner input, up to the maximum. */
export function addLine(lines: readonly string[]): readonly string[] {
  return lines.length >= ONE_LINERS_MAX ? lines : [...lines, ""];
}

/** Removes one-liner input `index`, always leaving at least one input. */
export function removeLine(lines: readonly string[], index: number): readonly string[] {
  const rest = lines.filter((_, i) => i !== index);
  return rest.length > 0 ? rest : [""];
}

/** Adds `intent` as the newest pick, or removes it when already picked. Never exceeds two. */
export function toggleIntent(intent: readonly IntentId[], id: IntentId): readonly IntentId[] {
  if (intent.includes(id)) return intent.filter((i) => i !== id);
  if (intent.length >= INTENTS_MAX) return intent;
  return [...intent, id];
}

/** Adds `topic` as the newest pick, or removes it when already picked. Never exceeds the max. */
export function toggleTopic(topics: readonly TopicId[], topic: TopicId): readonly TopicId[] {
  if (topics.includes(topic)) return topics.filter((t) => t !== topic);
  if (topics.length >= TOPICS_MAX) return topics;
  return [...topics, topic];
}

/** A draft prefilled from your current profile (for editing), with `extraTopic` added if room. */
export function draftFrom(
  you: Person | null,
  extraTopic: TopicId | null,
  avatar: Avatar,
): JoinDraft {
  const draft = you ? draftOf(you) : emptyDraft(avatar);
  const addExtra = extraTopic !== null && !draft.topics.includes(extraTopic);
  return addExtra ? { ...draft, topics: toggleTopic(draft.topics, extraTopic) } : draft;
}

function draftOf(you: Person): JoinDraft {
  return {
    name: you.name,
    telegram: you.telegram ?? "",
    x: you.x ?? "",
    topics: you.topics,
    intent: you.intent,
    oneLiners: you.oneLiners.length > 0 ? [...you.oneLiners] : [""],
    avatar: you.avatar,
    consent: true,
  };
}

function emptyDraft(avatar: Avatar): JoinDraft {
  return {
    name: "",
    telegram: "",
    x: "",
    topics: [],
    intent: [],
    oneLiners: [""],
    avatar,
    consent: false,
  };
}
