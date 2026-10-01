import { topicById } from "@/data/topics";
import type { Person } from "@/data/types";

/**
 * Placeholder meeting spots until the organizers share real Jio World Centre spots
 * (PRD §13, question 5). Swap this list; nothing else depends on the names.
 */
export const VENUE_SPOTS: readonly string[] = [
  "the main entrance",
  "the Hall 1 food court",
  "the coffee lounge",
  "the registration desk",
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable spot for a pair, so both people see the same suggestion. */
export function suggestedSpot(aId: string, bId: string): string {
  const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
  return VENUE_SPOTS[hash(key) % VENUE_SPOTS.length] ?? "the main entrance";
}

const TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** About 30 minutes from now, rounded up to the next quarter hour, in Mumbai time ("4:30 pm"). */
export function suggestedTime(now: number): string {
  const quarter = 15 * 60_000;
  return TIME.format(Math.ceil((now + 30 * 60_000) / quarter) * quarter).toLowerCase();
}

function firstName(person: Person): string {
  return person.name.split(" ")[0] ?? person.name;
}

/** The first message we prefill in Telegram; the sender still reviews and sends it. */
export function openerText(you: Person, them: Person, spot: string, time: string): string {
  const shared = you.topics.filter((t) => them.topics.includes(t)).map((t) => topicById(t).short);
  const about = shared.length > 0 ? `we both like ${shared.join(" + ")}` : "we should meet";
  return `gm ${firstName(them)}! Adda says ${about}. Chai at ${spot} around ${time}?`;
}

/** Opens their Telegram chat with the opener as an unsent draft (`t.me/<user>?text=`). */
export function telegramLink(handle: string, text: string): string {
  return `https://t.me/${encodeURIComponent(handle)}?text=${encodeURIComponent(text)}`;
}

export function xProfileLink(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle)}`;
}
