import type { InvitedRef } from "@/app/joinTypes";
import { isIntentId } from "@/data/intents";
import { isTopicId } from "@/data/topics";
import type { Avatar, IntentId, Person, TopicId } from "@/data/types";

/**
 * "Claim your bean" (docs-internal/prd/claim-your-bean.md): the claim link in the address, what
 * `claim_preview()` says about it, and the matching that offers an invited bean to the right
 * person. Pure functions; the controller does the calls.
 */

/** Claim links look like `https://coii.decipherclub.com/claim/<token>`. */
export const CLAIM_PATH = "/claim/";

/** A token as the server makes them: 32 random bytes, base64url, no padding (43 characters). */
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/** The claim token in this address (`/claim/<token>`), or null. */
export function readClaimToken(pathname: string): string | null {
  if (!pathname.toLowerCase().startsWith(CLAIM_PATH)) return null;
  const token = pathname.slice(CLAIM_PATH.length).replace(/\/+$/, "");
  return TOKEN.test(token) ? token : null;
}

/**
 * Takes a claim link out of the address before anything else runs (so it never reaches
 * analytics or browser history) and returns its token. `/claim/<garbage>` returns the garbage
 * as-is, so the claim screen can say the link doesn't work; a bare `/claim/` returns null.
 */
export function takeClaimToken(): string | null {
  const path = location.pathname;
  if (!path.toLowerCase().startsWith(CLAIM_PATH)) return null;
  history.replaceState(null, "", `/${location.search}${location.hash}`);
  const raw = path.slice(CLAIM_PATH.length).replace(/\/+$/, "");
  return raw.length > 0 ? raw : null;
}

/** A pasted claim link (or just its token), as typed into "I have a claim link". */
export function tokenFromInput(text: string): string | null {
  const trimmed = text.trim();
  if (TOKEN.test(trimmed)) return trimmed;
  try {
    return readClaimToken(new URL(trimmed).pathname);
  } catch {
    return null;
  }
}

export type ClaimStatus = "ready" | "claimed" | "expired" | "invalid";

/** The bean behind a claim link, without handles (they never leave the server). */
export interface ClaimPreview {
  readonly status: ClaimStatus;
  readonly personId: string | null;
  readonly name: string;
  readonly topics: readonly TopicId[];
  readonly intent: readonly IntentId[];
  readonly oneLiners: readonly string[];
  readonly avatar: Avatar;
}

type Raw = Record<string, unknown>;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const STATUSES: readonly ClaimStatus[] = ["ready", "claimed", "expired", "invalid"];

function rawOf(value: unknown): Raw {
  return typeof value === "object" && value !== null ? (value as Raw) : {};
}

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function avatarOf(value: unknown): Avatar {
  const look = Array.isArray(value) ? value.map(Number) : [];
  return {
    skin: look[0] ?? 0,
    hair: look[1] ?? 0,
    hairColor: look[2] ?? 0,
    accessory: look[3] ?? 0,
  };
}

/** Reads a `claim_preview()` result; anything unexpected reads as an invalid link. */
export function claimPreviewFrom(value: unknown): ClaimPreview {
  const raw = rawOf(value);
  const topics = strings(raw["topics"]).filter(isTopicId) as TopicId[];
  const personId = textOf(raw["person_id"]);
  const name = textOf(raw["name"]) ?? "";
  // A preview without a bean to show can only be explained as a link that doesn't work.
  const showable = personId !== null && name !== "" && topics.length > 0;
  const status = (showable && STATUSES.find((s) => s === raw["status"])) || "invalid";
  return {
    status,
    personId,
    name,
    topics,
    intent: strings(raw["intents"]).filter(isIntentId) as IntentId[],
    oneLiners: strings(raw["one_liners"]),
    avatar: avatarOf(raw["avatar"]),
  };
}

function normName(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Names compared the way people type them: case and extra spaces don't matter. */
export function sameName(a: string, b: string): boolean {
  return normName(a) !== "" && normName(a) === normName(b);
}

/** The unclaimed invited bean whose name is exactly this one (soft hint while joining), or null. */
export function invitedNamed(people: readonly Person[], name: string): Person | null {
  return people.find((p) => p.isInvited === true && sameName(p.name, name)) ?? null;
}

/** What the claim overlay shows (overlay "claim"). */
export type ClaimView =
  /** A claim link: its preview (null while loading). */
  | { readonly kind: "link"; readonly token: string; readonly preview: ClaimPreview | null }
  /**
   * An invited bean someone may be. `join`: their join hit its handle; `card`: "This is me" on a
   * profile card; `hint`: their typed name matched.
   */
  | {
      readonly kind: "panel";
      readonly invited: InvitedRef;
      readonly reason: "join" | "card" | "hint";
    };

/** The Telegram claim's consent tick, kept across the round trip to Telegram and back. */
export const TELEGRAM_CLAIM_KEY = "coii:telegram-claim:v1";

export function rememberTelegramClaim(storage: Storage | null, now = Date.now()): void {
  try {
    // The time it was ticked, so a round trip abandoned and resumed much later doesn't count.
    storage?.setItem(TELEGRAM_CLAIM_KEY, String(now));
  } catch {
    // Storage blocked: the round trip comes back without consent and says so.
  }
}

/** As long as a Telegram login itself stays valid (telegram-link's maximum age). */
const TELEGRAM_CLAIM_MS = 10 * 60 * 1000;

/** Whether this tab ticked consent before going to Telegram, recently; reading it forgets it. */
export function takeTelegramClaim(storage: Storage | null, now = Date.now()): boolean {
  try {
    const at = Number(storage?.getItem(TELEGRAM_CLAIM_KEY) ?? Number.NaN);
    storage?.removeItem(TELEGRAM_CLAIM_KEY);
    return Number.isFinite(at) && now - at >= 0 && now - at <= TELEGRAM_CLAIM_MS;
  } catch {
    return false;
  }
}
