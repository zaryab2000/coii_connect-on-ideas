export type TelegramReturnSurface = "profile" | "chai";

export interface TelegramReturn {
  readonly personId: string;
  readonly surface: TelegramReturnSurface;
}

interface StoredTelegramReturn extends TelegramReturn {
  readonly at: number;
}

export const TELEGRAM_RETURN_KEY = "coii:telegram-return:v1";
const TELEGRAM_RETURN_MS = 10 * 60 * 1000;

/** Session storage is optional: privacy modes can block it without breaking the verify button. */
export function browserSessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isReturnSurface(value: unknown): value is TelegramReturnSurface {
  return value === "profile" || value === "chai";
}

function isRecent(at: unknown, now: number): at is number {
  if (typeof at !== "number") return false;
  const age = now - at;
  return age >= 0 && age <= TELEGRAM_RETURN_MS;
}

function validReturn(value: unknown, now: number): StoredTelegramReturn | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<StoredTelegramReturn>;
  if (typeof parsed.personId !== "string" || parsed.personId === "") return null;
  if (!isReturnSurface(parsed.surface)) return null;
  if (!isRecent(parsed.at, now)) return null;
  return parsed as StoredTelegramReturn;
}

function storedReturn(storage: Storage | null, now: number): StoredTelegramReturn | null {
  try {
    const raw = storage?.getItem(TELEGRAM_RETURN_KEY);
    if (!raw) return null;
    return validReturn(JSON.parse(raw) as unknown, now);
  } catch {
    return null;
  }
}

/** Remembers the exact person and screen before Telegram takes the browser away from coii. */
export function rememberTelegramReturn(
  storage: Storage | null,
  value: TelegramReturn,
  now = Date.now(),
): void {
  try {
    storage?.setItem(TELEGRAM_RETURN_KEY, JSON.stringify({ ...value, at: now }));
  } catch {
    // Verification can still continue; only the automatic return is unavailable.
  }
}

/** Used by the profile overlay to open directly on the existing Telegram verification step. */
export function hasTelegramReturn(storage: Storage | null, now = Date.now()): boolean {
  return storedReturn(storage, now) !== null;
}

/** Reads and forgets a recent return only after Telegram verification has succeeded. */
export function takeTelegramReturn(
  storage: Storage | null,
  now = Date.now(),
): TelegramReturn | null {
  const found = storedReturn(storage, now);
  try {
    storage?.removeItem(TELEGRAM_RETURN_KEY);
  } catch {
    // A blocked store had nothing reliable to return.
  }
  return found ? { personId: found.personId, surface: found.surface } : null;
}
