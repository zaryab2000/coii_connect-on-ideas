import type { Avatar, IntentId, Person, TopicId } from "@/data/types";

/** A valid join form, cleaned and ready to save. */
export interface JoinInput {
  readonly name: string;
  readonly telegram: string | null;
  readonly x: string | null;
  readonly topics: readonly TopicId[];
  readonly intent: readonly IntentId[];
  readonly oneLiners: readonly string[];
  readonly avatar: Avatar;
}

export type JoinField = "name" | "handles" | "telegram" | "x" | "topics" | "oneLiners" | "consent";

/** Why a join or a profile edit didn't go through, and which field to show it on (if any). */
export interface JoinProblem {
  readonly field: JoinField | null;
  readonly text: string;
}

export type JoinOutcome =
  | { readonly ok: true; readonly person: Person }
  | { readonly ok: false; readonly problem: JoinProblem };
