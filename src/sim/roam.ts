/**
 * NPC beans (docs-internal/prd/npc-beans.md §6.2) have no home booth: they walk between the chai
 * hub and random booths, dwell a while, then move on.
 */

/** Share of trips that go to the chai hub (the central plaza). */
export const HUB_CHANCE = 0.4;
export const DWELL_MIN_S = 8;
export const DWELL_MAX_S = 20;

/**
 * Where an NPC goes next: the hub 40% of the time, otherwise any booth (not tied to its topics),
 * never where it already is.
 */
export function nextRoamZone(
  current: number,
  boothCount: number,
  plazaIndex: number,
  random: () => number,
): number {
  if (current !== plazaIndex && random() < HUB_CHANCE) return plazaIndex;
  if (boothCount <= 1) return current === plazaIndex ? 0 : plazaIndex;
  const booth = Math.floor(random() * boothCount);
  // Skip the booth it's at by shifting to the next one, so every other booth stays equally likely.
  return booth === current ? (booth + 1) % boothCount : booth;
}

/** How long an NPC idles at a stop, in seconds. */
export function roamDwell(random: () => number): number {
  return DWELL_MIN_S + random() * (DWELL_MAX_S - DWELL_MIN_S);
}
