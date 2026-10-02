import type { Origin } from "@/data/types";

export const SKIN_TONES: readonly number[] = [
  0xf6d2b8, 0xebb894, 0xd9a066, 0xc68642, 0x9c6b43, 0x6b4430,
];

const SKIN_WEIGHTS: Readonly<Record<Origin, readonly number[]>> = {
  india: [1, 4, 8, 8, 5, 2],
  intl: [5, 4, 3, 3, 3, 3],
};

export const HAIR_STYLES = [
  "short",
  "spiky",
  "long",
  "bun",
  "curly",
  "ponytail",
  "bald",
  "sidepart",
  "cap",
  "beanie",
  "headscarf",
  "turban",
] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];

export const HAIR_STYLE_WEIGHTS: readonly number[] = [16, 8, 14, 8, 8, 8, 3, 12, 8, 4, 4, 3];

const HEADWEAR = new Set<HairStyle>(["cap", "beanie", "headscarf", "turban"]);

export function isHeadwear(style: HairStyle): boolean {
  return HEADWEAR.has(style);
}

export const HAIR_COLORS: readonly number[] = [
  0x1b1515, 0x3b2418, 0x6b3e26, 0xb07a3b, 0xe8c07d, 0xc1440e, 0xd8d8d8, 0xff4fa0, 0x4d7cff,
];

const HAIR_COLOR_WEIGHTS: Readonly<Record<Origin, readonly number[]>> = {
  india: [14, 8, 2, 0.3, 0.2, 0.3, 1, 0.6, 0.4],
  intl: [6, 6, 5, 2, 3, 1.5, 1, 0.6, 0.5],
};

/** Headwear uses its own palette; the avatar's `hairColor` index is reused to pick from it. */
export const HEADWEAR_COLORS: readonly number[] = [
  0xff2e88, 0xffb31a, 0x0fa3a3, 0x1e1538, 0xffffff, 0x7c4dff, 0xff7a1a, 0x22b573, 0x3366ff,
];

export const ACCESSORIES = ["none", "glasses", "sunglasses", "headphones"] as const;

export type Accessory = (typeof ACCESSORIES)[number];

export const ACCESSORY_WEIGHTS: readonly number[] = [10, 4, 1.5, 2];

export function skinWeights(origin: Origin): readonly number[] {
  return SKIN_WEIGHTS[origin];
}

export function hairColorWeights(origin: Origin): readonly number[] {
  return HAIR_COLOR_WEIGHTS[origin];
}

export function hairStyleAt(index: number): HairStyle {
  return HAIR_STYLES[index] ?? "short";
}

export function accessoryAt(index: number): Accessory {
  return ACCESSORIES[index] ?? "none";
}

export function hairTint(styleIndex: number, colorIndex: number): number {
  const palette = isHeadwear(hairStyleAt(styleIndex)) ? HEADWEAR_COLORS : HAIR_COLORS;
  return palette[colorIndex % palette.length] ?? 0x1b1515;
}
