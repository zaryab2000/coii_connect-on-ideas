/** Small deterministic PRNG (mulberry32) so the demo crowd is identical on every device. */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  range(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted(weights: readonly number[]): number;
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(maxExclusive: number): number {
    return Math.floor(next() * maxExclusive);
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("rng.pick called with an empty list");
    }
    return items[int(items.length)] as T;
  }

  function weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) {
      throw new Error("rng.weighted needs at least one positive weight");
    }
    let roll = next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  return {
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick,
    weighted,
    shuffle,
  };
}
