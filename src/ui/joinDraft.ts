import type { JoinInput } from "@/app/controller";
import { containsLink, normalizeTelegram, normalizeX } from "@/data/handles";
import type { Avatar, Person, TopicId } from "@/data/types";

export const NAME_MAX = 40;
export const ONE_LINER_MAX = 80;
export const TOPICS_MAX = 3;

/** What the join form holds while you type. */
export interface JoinDraft {
  readonly name: string;
  readonly telegram: string;
  readonly x: string;
  readonly topics: readonly TopicId[];
  readonly oneLiner: string;
  readonly avatar: Avatar;
  readonly consent: boolean;
}

export type JoinField = "name" | "handles" | "telegram" | "x" | "topics" | "oneLiner" | "consent";

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
  "oneLiner",
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

function checkOneLiner(oneLiner: string): string | undefined {
  if (oneLiner.length > ONE_LINER_MAX) return `Keep it to ${ONE_LINER_MAX} characters.`;
  if (containsLink(oneLiner)) return "Links aren't allowed here. Add your handles above instead.";
  return undefined;
}

/**
 * Validates the join form. Returns the cleaned `JoinInput` or one message per problem field.
 * At least one handle is required; each handle that is filled in must be valid.
 */
export function validateJoin(draft: JoinDraft): JoinResult {
  const errors: JoinErrors = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) errors.name = "Add your name.";
  else if (name.length > NAME_MAX) errors.name = `Keep your name to ${NAME_MAX} characters.`;

  const telegram = handle(draft.telegram, normalizeTelegram);
  const x = handle(draft.x, normalizeX);
  if (telegram instanceof Error) errors.telegram = telegram.message;
  if (x instanceof Error) errors.x = x.message;
  if (telegram === null && x === null) errors.handles = "Add a Telegram username or an X handle.";

  const topicError = checkTopics(draft.topics);
  if (topicError) errors.topics = topicError;
  const oneLiner = draft.oneLiner.trim();
  const oneLinerError = checkOneLiner(oneLiner);
  if (oneLinerError) errors.oneLiner = oneLinerError;
  if (!draft.consent) errors.consent = "Tick this so people can see your bean.";

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
      oneLiner: oneLiner.length > 0 ? oneLiner : null,
      avatar: draft.avatar,
    },
  };
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
  const base: readonly TopicId[] = you ? you.topics : [];
  const topics = extraTopic && !base.includes(extraTopic) ? toggleTopic(base, extraTopic) : base;
  return {
    name: you?.name ?? "",
    telegram: you?.telegram ?? "",
    x: you?.x ?? "",
    topics,
    oneLiner: you?.oneLiner ?? "",
    avatar: you?.avatar ?? avatar,
    consent: you !== null,
  };
}
