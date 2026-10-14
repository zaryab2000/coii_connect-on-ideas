import type { InvitedRef, JoinProblem } from "@/app/joinTypes";
import { CONTACT_EMAIL } from "@/content/privacy";

/** What to tell someone when a backend call fails, and which join-form field it belongs to. */
export type ErrorCopy = JoinProblem;

const GENERIC = "That didn't work. Reload the page and try again.";
const SERVER = "Something went wrong on our side. Try again in a moment.";
export const OFFLINE = "Can't reach coii right now. Check your connection and try again.";

/** Every `coii:<code>` the database and Edge Functions raise (PRD §8.7, adda, §9). */
const COPY: Readonly<Record<string, ErrorCopy>> = {
  not_signed_in: { field: null, text: "Your session ended. Reload the page and join again." },
  no_profile: { field: null, text: "Join coii first to do that." },
  already_joined: { field: null, text: "You're already on coii. Reload to see your bean." },
  invalid_name: { field: "name", text: "Add a name of up to 40 characters." },
  name_blocked: {
    field: "name",
    text: "That name isn't allowed here. Use the name people know you by.",
  },
  name_link_not_allowed: {
    field: "name",
    text: "Names can't contain links. Add your handles below instead.",
  },
  invalid_topics: { field: "topics", text: "Pick 1 to 3 topics." },
  invalid_intents: { field: null, text: "Pick up to 2 reasons you're here." },
  invalid_one_liner: {
    field: "oneLiners",
    text: "Keep each one-liner to 80 characters, at most 3 of them.",
  },
  link_not_allowed: {
    field: "oneLiners",
    text: "Links aren't allowed here. Add your handles above instead.",
  },
  mention_not_allowed: {
    field: "oneLiners",
    text: "No @usernames here. Your handles show after someone waves.",
  },
  invalid_telegram: {
    field: "telegram",
    text: "Telegram usernames are 5–32 letters, numbers or underscores and start with a letter.",
  },
  invalid_x: { field: "x", text: "X handles are up to 15 letters, numbers or underscores." },
  handle_required: { field: "handles", text: "Add a Telegram username or an X handle." },
  handle_taken: {
    field: "handles",
    text: "That username is already on coii. If it's yours, verify with Telegram to claim it.",
  },
  // Claim your bean (docs-internal/prd/claim-your-bean.md §7.7).
  handle_invited: {
    field: null,
    text: "You're already on coii: the coii team added a bean with that handle. Claim it instead of making a new one.",
  },
  claim_invalid: {
    field: null,
    text: `This claim link doesn't work. Check you copied all of it, or ask for a new one: ${CONTACT_EMAIL}`,
  },
  claim_expired: {
    field: null,
    text: `This claim link has expired. Ask for a new one: ${CONTACT_EMAIL}`,
  },
  claim_used: {
    field: null,
    text: "This bean has already been claimed. If it was you, sign in with Google.",
  },
  not_invited: { field: null, text: "That bean isn't waiting to be claimed any more." },
  consent_required: { field: "consent", text: "Tick this so people can see your bean." },
  invalid_avatar: { field: null, text: "Your bean's look didn't save. Pick it again." },
  no_chai: { field: null, text: "That chai has ended." },
  not_in_hand: { field: null, text: "That card isn't in today's picks any more." },
  telegram_taken: {
    field: null,
    text: "That Telegram account already verified another bean.",
  },
  telegram_no_username: { field: null, text: "Set a Telegram username first, then verify." },
  telegram_bad_signature: {
    field: null,
    text: "Telegram couldn't confirm it was you. Try again.",
  },
  telegram_expired: { field: null, text: "That Telegram login expired. Try again." },
  too_many_addas: { field: null, text: "You already have 3 addas." },
  no_adda: { field: null, text: "That adda is gone." },
  invalid_style: { field: null, text: "Pick a tent style and a colour." },
  invalid_color: { field: null, text: "Pick a tent style and a colour." },
  invalid_place: { field: null, text: "That spot doesn't work for a tent." },
  // Feature requests (docs-internal/prd/feature-requests.md §4).
  too_many_requests: { field: null, text: "You've sent 3 ideas today. Send more tomorrow!" },
  invalid_request: { field: null, text: "Write 10–300 characters." },
  server_error: { field: null, text: SERVER },
  origin_not_allowed: { field: null, text: SERVER },
  method_not_allowed: { field: null, text: SERVER },
};

/** Supabase Auth error codes people can actually hit while joining or saving their bean. */
const AUTH_COPY: Readonly<Record<string, string>> = {
  captcha_failed: "The robot check didn't go through. Try it again.",
  over_request_rate_limit:
    "Lots of people are joining from this network right now. Try again in a minute.",
  over_anonymous_sign_in_rate_limit:
    "Lots of people are joining from this network right now. Try again in a minute.",
  identity_already_exists: "That Google account already has a bean on coii.",
  anonymous_provider_disabled: SERVER,
};

/** The `<code>` in a `coii:<code>` message, or null. */
export function coiiCode(message: string | undefined): string | null {
  return /coii:([a-z_]+)/.exec(message ?? "")?.[1] ?? null;
}

/** Copy for a backend error code; unknown codes get a generic line, never silence. */
export function errorCopy(code: string | null): ErrorCopy {
  if (code === null) return { field: null, text: GENERIC };
  return COPY[code] ?? { field: null, text: AUTH_COPY[code] ?? GENERIC };
}

/** A failed backend call, carrying the code the server sent (`coii:<code>` or an auth code). */
export class BackendError extends Error {
  constructor(
    readonly code: string | null,
    message: string,
    /** The database error's DETAIL (handle_invited: the invited bean's id), if any. */
    readonly detail: string | null = null,
    /** The database error's HINT (handle_invited: "telegram" or "x"), if any. */
    readonly hint: string | null = null,
  ) {
    super(message);
    this.name = "BackendError";
  }

  get copy(): ErrorCopy {
    return this.code === "offline" ? { field: null, text: OFFLINE } : errorCopy(this.code);
  }
}

const OFFLINE_NAMES = new Set(["TypeError", "AuthRetryableFetchError", "FunctionsFetchError"]);
/** Chrome, Firefox and Safari's wording for a failed fetch. */
const OFFLINE_MESSAGE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

interface ErrorLike {
  readonly message?: string;
  readonly code?: string;
  readonly name?: string;
  /** PostgREST passes a database error's DETAIL and HINT through as these. */
  readonly details?: unknown;
  readonly hint?: unknown;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isOffline(e: ErrorLike, message: string): boolean {
  return OFFLINE_NAMES.has(e.name ?? "") || OFFLINE_MESSAGE.test(message);
}

/** An auth error code we have copy for (`captcha_failed`, rate limits, …), or null. */
function authCode(e: ErrorLike): string | null {
  return typeof e.code === "string" && e.code in AUTH_COPY ? e.code : null;
}

/** Turns whatever a Supabase call failed with into a `BackendError` with its code. */
export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const e = (error ?? {}) as ErrorLike;
  const message = e.message ?? String(error);
  // fetch() rejects with a TypeError when the network is down or the server can't be reached;
  // supabase-js passes that on as an error object or as its message.
  if (isOffline(e, message)) return new BackendError("offline", message);
  return new BackendError(coiiCode(message) ?? authCode(e), message, text(e.details), text(e.hint));
}

/** The invited bean behind a `coii:handle_invited` error, or null for any other error. */
export function invitedRef(error: BackendError): InvitedRef | null {
  if (error.code !== "handle_invited" || !error.detail) return null;
  const handle = error.hint === "telegram" || error.hint === "x" ? error.hint : null;
  return { personId: error.detail, handle };
}
