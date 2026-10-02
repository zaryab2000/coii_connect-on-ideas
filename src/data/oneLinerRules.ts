import { containsLink } from "@/data/handles";

/** Most one-liners a person can show over their bean. */
export const ONE_LINERS_MAX = 3;
/** Longest a single one-liner may be; anything longer stops being readable in a bubble. */
export const ONE_LINER_MAX = 80;

/** "@" followed by a letter, digit or underscore: an @username. Same rule as the server. */
const MENTION = /@[a-z0-9_]/i;

/** One-liners can't name handles: handles only show after someone waves (wave-to-reveal). */
export function containsMention(text: string): boolean {
  return MENTION.test(text);
}

/** Why a one-liner can't be used, or undefined when it is fine. */
export function oneLinerError(line: string): string | undefined {
  if (line.length > ONE_LINER_MAX) return `Keep it to ${ONE_LINER_MAX} characters.`;
  if (containsLink(line)) return "Links aren't allowed here. Add your handles above instead.";
  if (containsMention(line)) return "No @usernames here. Your handles show after someone waves.";
  return undefined;
}
