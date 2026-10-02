import { containsLink } from "@/data/handles";

/** Most one-liners a person can show over their bean. */
export const ONE_LINERS_MAX = 3;
/** Longest a single one-liner may be; anything longer stops being readable in a bubble. */
export const ONE_LINER_MAX = 80;

/** Why a one-liner can't be used, or undefined when it is fine. */
export function oneLinerError(line: string): string | undefined {
  if (line.length > ONE_LINER_MAX) return `Keep it to ${ONE_LINER_MAX} characters.`;
  if (containsLink(line)) return "Links aren't allowed here. Add your handles above instead.";
  return undefined;
}
