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

const HOUR_IN_IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  hourCycle: "h23",
});

/** Venue hours for meetups (IST). Outside them we suggest the next morning. */
const OPEN_HOUR = 9;
const CLOSE_HOUR = 19;

/**
 * About 30 minutes from now, rounded up to the next quarter hour, in Mumbai time
 * ("around 4:30 pm").
 * Outside venue hours it suggests a morning slot instead of the middle of the night.
 */
export function suggestedTime(now: number): string {
  const quarter = 15 * 60_000;
  const slot = Math.ceil((now + 30 * 60_000) / quarter) * quarter;
  const hour = Number(HOUR_IN_IST.format(slot));
  if (hour < OPEN_HOUR) return "today around 11:00 am";
  if (hour >= CLOSE_HOUR) return "tomorrow around 11:00 am";
  return `around ${TIME.format(slot).toLowerCase()}`;
}

function firstName(person: Person): string {
  return person.name.split(" ")[0] ?? person.name;
}

/** The first message we prefill in Telegram; the sender still reviews and sends it. */
export function openerText(you: Person, them: Person, spot: string, time: string): string {
  const shared = you.topics.filter((t) => them.topics.includes(t)).map((t) => topicById(t).short);
  const about = shared.length > 0 ? `we both like ${shared.join(" + ")}` : "we should meet";
  return `gm ${firstName(them)}! Adda says ${about}. Chai at ${spot} ${time}?`;
}

/** Opens their Telegram chat with the opener as an unsent draft (`t.me/<user>?text=`). */
export function telegramLink(handle: string, text: string): string {
  return `https://t.me/${encodeURIComponent(handle)}?text=${encodeURIComponent(text)}`;
}

export function xProfileLink(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle)}`;
}
