/**
 * Decipher Club, who build coii: every link and word of its plugs in one place, so the owner can
 * edit them without touching components (docs-internal/prd/decipher-club-plugs.md).
 */

/** Where each plug sits; it becomes the link's `utm_medium`. */
export type DecipherSpot = "welcome" | "about" | "hud";

const SITE = "https://www.decipherclub.com/";

/**
 * The coii-only invite to Decipher Club's Telegram group. Leave it empty to hide every Telegram
 * button (a broken invite is worse than none).
 */
export const TELEGRAM_INVITE_URL = "https://t.me/+mtMGHzBxC7BjOGY1";

export const DECIPHER = {
  pitch: "Built by Decipher Club: a research-driven publication by builders for builders.",
  /** The welcome card after joining or claiming. */
  heading: "Built by Decipher Club",
  line: "A research-driven publication by builders for builders.",
  subscribe: "Subscribe",
  telegram: "Join our Telegram",
  dismiss: "Dismiss",
  /** The HUD credit on the wordmark; phones drop "Club". */
  credit: "by Decipher",
  creditEnd: " Club",
} as const;

/** The Decipher Club website, tagged with the spot the visit came from. */
export function decipherUrl(spot: DecipherSpot): string {
  const url = new URL(SITE);
  url.searchParams.set("utm_source", "coii");
  url.searchParams.set("utm_medium", spot);
  return url.toString();
}

/** The Telegram invite, or null while there isn't one (the button stays hidden). */
export function telegramInvite(invite: string = TELEGRAM_INVITE_URL): string | null {
  const trimmed = invite.trim();
  return trimmed === "" ? null : trimmed;
}
