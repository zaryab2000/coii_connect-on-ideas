export type HandleResult = { ok: true; value: string } | { ok: false; error: string };

const TELEGRAM_PREFIXES = [/^https?:\/\//i, /^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, /^@/];
const X_PREFIXES = [/^https?:\/\//i, /^(www\.)?(x\.com|twitter\.com)\//i, /^@/];

const TELEGRAM_PATTERN = /^[a-z][a-z0-9_]{4,31}$/i;
const X_PATTERN = /^[a-z0-9_]{1,15}$/i;

function stripPrefixes(input: string, prefixes: readonly RegExp[]): string {
  let value = input.trim();
  for (const prefix of prefixes) {
    value = value.replace(prefix, "");
  }
  return value.replace(/[/?#].*$/, "");
}

/** Accepts `@name`, `name`, `t.me/name` or a full URL and returns the bare username. */
export function normalizeTelegram(input: string): HandleResult {
  const value = stripPrefixes(input, TELEGRAM_PREFIXES);
  if (value.length === 0) {
    return { ok: false, error: "Add your Telegram username, like @priya_builds." };
  }
  if (!TELEGRAM_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Telegram usernames are 5–32 letters, numbers or underscores and start with a letter.",
    };
  }
  return { ok: true, value };
}

/** Accepts `@name`, `name`, `x.com/name` or a full URL and returns the bare handle. */
export function normalizeX(input: string): HandleResult {
  const value = stripPrefixes(input, X_PREFIXES);
  if (value.length === 0) {
    return { ok: false, error: "Add your X handle, like @priya_builds." };
  }
  if (!X_PATTERN.test(value)) {
    return { ok: false, error: "X handles are up to 15 letters, numbers or underscores." };
  }
  return { ok: true, value };
}

const URL_LIKE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|xyz|io|org|net|app|me|gg|co|in)\b)/i;

/** Free text shown publicly must not carry links (anti-phishing). */
export function containsLink(text: string): boolean {
  return URL_LIKE.test(text);
}
