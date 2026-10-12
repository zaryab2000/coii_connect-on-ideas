import { useApp } from "@/app/context";
import { trendsUrl } from "@/app/joinLink";
import type { RaceView } from "@/app/store";
import { topicById } from "@/data/topics";

export type RaceToday = RaceView;

/** The race over the last 24 hours, as the controller last counted it. */
export function useRaceToday(): RaceToday {
  return useApp((s) => s.race);
}

/** "people" for 2+, "person" for 1. */
export function peopleWord(n: number): string {
  return n === 1 ? "person" : "people";
}

/** The post that goes with a shared race: the top three and the hottest booth. */
export function raceShareText({ rows, hot }: RaceToday): string {
  const top = rows
    .slice(0, 3)
    .map((r, i) => `${i + 1}. ${topicById(r.topic).short} ${r.count}`)
    .join(" · ");
  const fire = hot ? ` 🔥 Rising fastest: ${topicById(hot).short}.` : "";
  return `The narrative race at Devcon 8, Mumbai, live on coii: ${top}.${fire} Which side are you on?`;
}

export { trendsUrl };
