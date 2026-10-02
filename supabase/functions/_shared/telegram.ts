// Verifies a Telegram Login Widget payload (docs/prd/database.md §9.2). Pure WebCrypto, so it
// runs the same in Deno and in tests.

export interface TelegramPayload {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly photo_url?: string;
  readonly auth_date: number;
  readonly hash: string;
}

export type TelegramCheck =
  | { readonly ok: true; readonly id: number; readonly username: string }
  | {
      readonly ok: false;
      readonly code: "telegram_bad_signature" | "telegram_expired" | "telegram_no_username";
    };

/** A login older than this is refused. */
const MAX_AGE_S = 24 * 60 * 60;
/** Clocks drift; a login up to this far in the future is tolerated. */
const MAX_SKEW_S = 5 * 60;

/** `key=value` lines for every field except `hash`, sorted by key (Telegram's rule). */
export function dataCheckString(payload: Readonly<Record<string, unknown>>): string {
  return Object.keys(payload)
    .filter((key) => key !== "hash" && payload[key] !== undefined && payload[key] !== null)
    .toSorted()
    .map((key) => `${key}=${String(payload[key])}`)
    .join("\n");
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** hex(HMAC-SHA-256(SHA-256(botToken), dataCheckString)): what Telegram signs with. */
export async function telegramHash(
  payload: Readonly<Record<string, unknown>>,
  botToken: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const secret = await crypto.subtle.digest("SHA-256", encoder.encode(botToken));
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(dataCheckString(payload))));
}

/** Compares two strings in time that doesn't depend on where they differ. */
function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Checks signature, then freshness, then that the account has a username. */
export async function checkTelegram(
  payload: TelegramPayload,
  botToken: string,
  nowSeconds: number,
): Promise<TelegramCheck> {
  const expected = await telegramHash(payload as unknown as Record<string, unknown>, botToken);
  if (typeof payload.hash !== "string" || !sameString(expected, payload.hash.toLowerCase())) {
    return { ok: false, code: "telegram_bad_signature" };
  }
  const age = nowSeconds - Number(payload.auth_date);
  if (!Number.isFinite(age) || age > MAX_AGE_S || age < -MAX_SKEW_S) {
    return { ok: false, code: "telegram_expired" };
  }
  if (!payload.username) return { ok: false, code: "telegram_no_username" };
  return { ok: true, id: Number(payload.id), username: payload.username };
}
