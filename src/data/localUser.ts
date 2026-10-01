import { isTopicId } from "@/data/topics";
import type { Person } from "@/data/types";

const KEY = "adda:you:v1";

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p["id"] === "string" &&
    typeof p["name"] === "string" &&
    Array.isArray(p["topics"]) &&
    p["topics"].length > 0 &&
    p["topics"].every((t) => typeof t === "string" && isTopicId(t)) &&
    typeof p["avatar"] === "object" &&
    p["isYou"] === true
  );
}

/** Your own profile from this browser, if you joined before. Storage may be unavailable. */
export function loadYou(): Person | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPerson(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveYou(person: Person): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(person));
    return true;
  } catch {
    return false;
  }
}

export function clearYou(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode); nothing was saved, so there is nothing to clear.
  }
}
