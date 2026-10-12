import { TOPICS } from "@/data/topics";
import type { Person } from "@/data/types";
import { NPC_OUTFIT } from "@/engine/palette";

/** What a bean wears: its shirt colour, and which row of far-zoom frames matches it. */
export interface Outfit {
  readonly shirt: number;
  /** Row in the atlas's far-zoom frames: one per topic, then the NPC grey. */
  readonly lodRow: number;
}

/**
 * Real and demo beans wear their primary topic's colour; NPCs wear one grey on every outfit part,
 * close up and far away (npc-beans.md §6.1).
 */
export function outfitFor(person: Person, primary: number): Outfit {
  if (person.isNpc) return { shirt: NPC_OUTFIT, lodRow: TOPICS.length };
  return { shirt: TOPICS[primary]?.color ?? 0xffffff, lodRow: primary };
}
