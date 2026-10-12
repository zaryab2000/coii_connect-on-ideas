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

/** Which of the join form's handles belongs to an invited bean. */
export type InvitedHandle = "telegram" | "x";

/** An invited bean someone may be (docs-internal/prd/claim-your-bean.md §7.3). */
export interface InvitedRef {
  readonly personId: string;
  /** The handle that matched, when a join hit it; null when we only guess (name, profile card). */
  readonly handle: InvitedHandle | null;
}

/** Why a join or a profile edit didn't go through, and which field to show it on (if any). */
export interface JoinProblem {
  readonly field: JoinField | null;
  readonly text: string;
  /** The handle belongs to an invited bean: show the claim panel instead of an error line. */
  readonly invited?: InvitedRef;
}

export type JoinOutcome =
  | { readonly ok: true; readonly person: Person }
  | { readonly ok: false; readonly problem: JoinProblem };
