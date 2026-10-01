export const TOPIC_IDS = [
  "ai",
  "prediction",
  "defi",
  "privacy",
  "stablecoins",
  "core",
  "security",
  "wallets",
  "consumer",
  "jobs",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export type IconId =
  | "robot"
  | "crystal_ball"
  | "water_wave"
  | "locked"
  | "dollar_banknote"
  | "chains"
  | "shield"
  | "purse"
  | "video_game"
  | "briefcase"
  | "hot_beverage"
  | "light_bulb"
  | "fire"
  | "party_popper"
  | "dizzy"
  | "sparkles"
  | "red_heart"
  | "admission_tickets"
  | "rocket"
  | "waving_hand"
  | "handshake"
  | "speech_balloon";

export interface Topic {
  readonly id: TopicId;
  readonly label: string;
  readonly short: string;
  readonly color: number;
  readonly css: string;
  readonly icon: IconId;
}

export type Origin = "india" | "intl";

/** Indexes into the palettes defined in `@/data/avatar`. */
export interface Avatar {
  readonly skin: number;
  readonly hair: number;
  readonly hairColor: number;
  readonly accessory: number;
}

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly telegram: string | null;
  readonly x: string | null;
  readonly topics: readonly TopicId[];
  readonly oneLiner: string | null;
  readonly avatar: Avatar;
  readonly telegramVerified: boolean;
  readonly ticketVerified: boolean;
  readonly isDemo: boolean;
  readonly isYou: boolean;
  /** Name pool used for demo people; null for real people. */
  readonly origin: Origin | null;
  readonly joinedAt: number;
}
