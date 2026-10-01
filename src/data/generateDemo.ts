import {
  ACCESSORY_WEIGHTS,
  HAIR_STYLE_WEIGHTS,
  hairColorWeights,
  skinWeights,
} from "@/data/avatar";
import { INDIAN_REGIONS, INTERNATIONAL_REGIONS } from "@/data/names";
import type { NameRegion } from "@/data/names";
import { ONE_LINERS } from "@/data/oneLiners";
import { createRng } from "@/data/rng";
import type { Rng } from "@/data/rng";
import { TOPIC_IDS } from "@/data/types";
import type { Avatar, Origin, Person, TopicId } from "@/data/types";

export const INDIA_SHARE = 0.7;

const DAY_MS = 86_400_000;

const TOPIC_POPULARITY: Readonly<Record<TopicId, number>> = {
  ai: 22,
  defi: 14,
  stablecoins: 12,
  privacy: 11,
  prediction: 9,
  core: 8,
  security: 7,
  wallets: 7,
  consumer: 6,
  jobs: 5,
};

/** Extra pull between topics that tend to be picked together. Unlisted pairs have affinity 1. */
const AFFINITY_PAIRS: ReadonlyArray<readonly [TopicId, TopicId, number]> = [
  ["ai", "stablecoins", 4],
  ["ai", "wallets", 2],
  ["ai", "consumer", 1.6],
  ["defi", "prediction", 4],
  ["defi", "stablecoins", 2.6],
  ["defi", "security", 2],
  ["privacy", "core", 2.6],
  ["privacy", "security", 2.2],
  ["privacy", "wallets", 1.6],
  ["stablecoins", "wallets", 2],
  ["core", "security", 1.6],
  ["consumer", "wallets", 2],
];

const TOPIC_COUNT_WEIGHTS = [35, 45, 20];

function affinity(a: TopicId, b: TopicId): number {
  for (const [x, y, weight] of AFFINITY_PAIRS) {
    if ((x === a && y === b) || (x === b && y === a)) return weight;
  }
  return 1;
}

function pickTopics(rng: Rng): TopicId[] {
  const count = rng.weighted(TOPIC_COUNT_WEIGHTS) + 1;
  const chosen: TopicId[] = [];
  while (chosen.length < count) {
    const weights = TOPIC_IDS.map((id) => {
      if (chosen.includes(id)) return 0;
      let weight = TOPIC_POPULARITY[id];
      for (const picked of chosen) weight *= affinity(picked, id);
      return weight;
    });
    chosen.push(TOPIC_IDS[rng.weighted(weights)] as TopicId);
  }
  return chosen;
}

function pickRegion(rng: Rng, regions: readonly NameRegion[]): NameRegion {
  return regions[rng.weighted(regions.map((r) => r.weight))] as NameRegion;
}

export function asciiSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function uniqueHandle(base: string, used: Set<string>, rng: Rng, maxLength: number): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const digits = attempt < 25 ? rng.int(90) + 10 : rng.int(9000) + 1000;
    const suffix = String(digits);
    const handle = `${base.slice(0, maxLength - suffix.length)}${suffix}`;
    if (!used.has(handle)) {
      used.add(handle);
      return handle;
    }
  }
  throw new Error(`Could not create a unique handle from "${base}" after 50 attempts`);
}

function pickAvatar(rng: Rng, origin: Origin): Avatar {
  return {
    skin: rng.weighted(skinWeights(origin)),
    hair: rng.weighted(HAIR_STYLE_WEIGHTS),
    hairColor: rng.weighted(hairColorWeights(origin)),
    accessory: rng.weighted(ACCESSORY_WEIGHTS),
  };
}

interface PersonContext {
  readonly rng: Rng;
  readonly seed: number;
  readonly now: number;
  readonly usedTelegram: Set<string>;
  readonly usedX: Set<string>;
}

function generatePerson(ctx: PersonContext, index: number, origin: Origin): Person {
  const { rng } = ctx;
  const region = pickRegion(rng, origin === "india" ? INDIAN_REGIONS : INTERNATIONAL_REGIONS);
  const first = rng.pick(region.first);
  const last = rng.pick(region.last);
  const slug = `${asciiSlug(first)}${asciiSlug(last).slice(0, 1)}`;
  const topics = pickTopics(rng);
  const primary = topics[0] as TopicId;

  return {
    id: `demo-${ctx.seed.toString(36)}-${index.toString(36)}`,
    name: `${first} ${last}`,
    telegram: uniqueHandle(`demo_${slug}`, ctx.usedTelegram, rng, 32),
    x: rng.chance(0.6) ? uniqueHandle(`${asciiSlug(first)}_`, ctx.usedX, rng, 15) : null,
    topics,
    oneLiner: rng.chance(0.85) ? rng.pick(ONE_LINERS[primary]) : null,
    avatar: pickAvatar(rng, origin),
    telegramVerified: rng.chance(0.4),
    ticketVerified: rng.chance(0.2),
    isDemo: true,
    isYou: false,
    origin,
    joinedAt: Math.round(ctx.now - rng.range(0, 10) * DAY_MS),
  };
}

function originsFor(rng: Rng, count: number): Origin[] {
  const india = Math.round(count * INDIA_SHARE);
  const origins: Origin[] = [];
  for (let i = 0; i < count; i++) origins.push(i < india ? "india" : "intl");
  return rng.shuffle(origins);
}

export interface DemoCrowd {
  readonly people: Person[];
  readonly reserve: Person[];
}

export interface DemoOptions {
  readonly seed: number;
  readonly count: number;
  readonly reserve: number;
  readonly now: number;
}

/** Deterministic demo crowd: `count` people present at load plus a `reserve` that arrives live. */
export function generateDemo(options: DemoOptions): DemoCrowd {
  const rng = createRng(options.seed);
  const ctx: PersonContext = {
    rng,
    seed: options.seed,
    now: options.now,
    usedTelegram: new Set(),
    usedX: new Set(),
  };
  const people = originsFor(rng, options.count).map((origin, i) => generatePerson(ctx, i, origin));
  const reserve = originsFor(rng, options.reserve).map((origin, i) =>
    generatePerson(ctx, options.count + i, origin),
  );
  return { people, reserve };
}
