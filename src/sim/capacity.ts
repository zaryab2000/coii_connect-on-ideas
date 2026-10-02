const PLAZA_SHARE = 0.04;
const HEADROOM = 1.25;
const MIN_EXTRA = 14;

/**
 * Expected number of people standing in each booth zone (plus the plaza, last), with headroom.
 * Mirrors the zone choice weights in the world: 55% primary topic, the rest shared by the others.
 */
export function zoneCapacities(
  topicLists: readonly (readonly number[])[],
  boothCount: number,
): number[] {
  const expected: number[] = Array.from({ length: boothCount + 1 }, () => 0);
  for (const topics of topicLists) {
    if (topics.length === 0) continue;
    if (topics.length === 1) {
      expected[topics[0] ?? 0] = (expected[topics[0] ?? 0] ?? 0) + (1 - PLAZA_SHARE);
      continue;
    }
    topics.forEach((topic, i) => {
      const share = i === 0 ? 0.55 : 0.45 / (topics.length - 1);
      expected[topic] = (expected[topic] ?? 0) + share * (1 - PLAZA_SHARE);
    });
  }
  expected[boothCount] = topicLists.length * PLAZA_SHARE * 2;
  return expected.map((count) => Math.ceil(count * HEADROOM + MIN_EXTRA));
}
