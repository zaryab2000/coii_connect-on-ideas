import { TOPIC_IDS } from "@/data/types";
import type { TopicId } from "@/data/types";

/** The public site; shared links point here. */
export const SITE_URL = "https://coii.decipherclub.com";

/** The path a shared "Join coii" link opens: the join form, over the live venue. */
export const JOIN_PATH = "/join";

/** `https://coii.decipherclub.com/join`, or `/join/defi` to preselect a booth. */
export function joinUrl(topic: TopicId | null = null): string {
  return `${SITE_URL}${JOIN_PATH}${topic ? `/${topic}` : ""}`;
}

function asTopic(value: string | null | undefined): TopicId | null {
  const id = (value ?? "").toLowerCase();
  return TOPIC_IDS.find((t) => t === id) ?? null;
}

/**
 * Whether this address is a join link and which booth it preselects. Accepts `/join`,
 * `/join/<topic>` and `?join` / `?join=<topic>`; an unknown topic still opens the form.
 */
export function readJoinLink(pathname: string, search: string): { topic: TopicId | null } | null {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  if (path === JOIN_PATH || path.startsWith(`${JOIN_PATH}/`)) {
    return { topic: asTopic(path.slice(JOIN_PATH.length + 1)) };
  }
  const params = new URLSearchParams(search);
  if (!params.has("join")) return null;
  return { topic: asTopic(params.get("join")) };
}

/** The path a shared narrative race link opens: the race, over the live venue. */
export const TRENDS_PATH = "/trends";

export function trendsUrl(): string {
  return `${SITE_URL}${TRENDS_PATH}`;
}

/** Whether this address is a narrative race link: `/trends` or `?trends`. */
export function readTrendsLink(pathname: string, search: string): boolean {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  return path === TRENDS_PATH || new URLSearchParams(search).has("trends");
}

const LINK_PARAMS = new Set(["join", "trends"]);

/**
 * The same address with a join or race link taken out, so a reload doesn't reopen the form or
 * the race.
 */
export function withoutShareLink(pathname: string, search: string, hash: string): string {
  // Kept as written: bare flags like `?still` stay bare.
  const rest = search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => part !== "" && !LINK_PARAMS.has(decodeURIComponent(part.split("=")[0] ?? "")))
    .join("&");
  const path = readJoinLink(pathname, "") || readTrendsLink(pathname, "") ? "/" : pathname;
  return `${path}${rest ? `?${rest}` : ""}${hash}`;
}
