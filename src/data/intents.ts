import type { IconId, IntentId } from "@/data/types";
import { INTENT_IDS } from "@/data/types";

export interface Intent {
  readonly id: IntentId;
  /** Chip text in the join form, e.g. "Looking for a role". */
  readonly label: string;
  /** Short form for cards and reasons, e.g. "looking for a role". */
  readonly phrase: string;
  readonly icon: IconId;
}

export const INTENTS: readonly Intent[] = [
  { id: "building", label: "Building something", phrase: "building", icon: "laptop" },
  { id: "hiring", label: "Hiring", phrase: "hiring", icon: "megaphone" },
  {
    id: "job_hunting",
    label: "Looking for a role",
    phrase: "looking for a role",
    icon: "page_facing_up",
  },
  {
    id: "cofounder",
    label: "Looking for a co-founder",
    phrase: "looking for a co-founder",
    icon: "handshake",
  },
  { id: "raising", label: "Raising", phrase: "raising", icon: "rocket" },
  { id: "investing", label: "Investing", phrase: "investing", icon: "briefcase" },
  { id: "researching", label: "Researching", phrase: "researching", icon: "magnifying_glass" },
  { id: "learning", label: "First Devcon / learning", phrase: "learning", icon: "seedling" },
  { id: "vibing", label: "Just here for chai", phrase: "here for chai", icon: "hot_beverage" },
];

/** At most two intents per person keeps the signal meaningful. */
export const INTENTS_MAX = 2;

const BY_ID = new Map<IntentId, Intent>(INTENTS.map((intent) => [intent.id, intent]));

export function intentById(id: IntentId): Intent {
  const intent = BY_ID.get(id);
  if (!intent) {
    throw new Error(`Unknown intent "${id}". Expected one of: ${INTENT_IDS.join(", ")}`);
  }
  return intent;
}

export function isIntentId(value: unknown): value is IntentId {
  return typeof value === "string" && (INTENT_IDS as readonly string[]).includes(value);
}
