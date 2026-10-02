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

/**
 * Invisible and blank-rendering characters: soft hyphen, Hangul fillers, zero-width spaces and
 * joiners, bidi controls, word joiners, the Braille blank, BOM. They'd let "Dev<ZWSP>con" or "scam<ZWSP>.xyz" past the blocklist and link filter
 * while looking identical, so they're removed. Same list as private.strip_invisible().
 */
const INVISIBLE =
  /[\u00ad\u115f\u1160\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u2800\u3164\ufeff\uffa0]/g;

/** Every whitespace character JavaScript knows, matched the same way by private.clean_name(). */
const SPACES = /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;

/** Public text as it will be stored: invisible characters gone, whitespace trimmed and collapsed. */
export function cleanText(text: string): string {
  return text.replace(INVISIBLE, "").replace(SPACES, " ").trim();
}

/**
 * Anything that reads as a link: http(s)://, www., or word.word where the part after the dot is
 * 2+ letters (claimdrop.ai, t.me, uniswap.org). Numbers after the dot are fine (v2.0, 3.5).
 * Same rule as private.has_link(). Trade-off: "Node.js" is refused too; the error says why.
 */
const URL_LIKE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b)/i;

/**
 * Links in names: http(s)://, www., the short domains people actually paste (t.me, x.com, t.co),
 * or 2+ characters, a dot and an all-lowercase or all-caps ending (mint-now.xyz, claimdrop.ai).
 * Initials pass: K.Ravi Kumar, S.Priya, A.R.Rahman, Dr.Anita Rao. Same rule as
 * private.name_has_link(). One-liners use the stricter containsLink().
 */
const NAME_LINK_ANY_CASE = /(https?:\/\/|www\.|\b(t\.me|x\.com|t\.co)\b)/i;
const NAME_LINK_DOMAIN = /\b[A-Za-z0-9-]{2,}\.([a-z]{2,}|[A-Z]{2,})\b/;

export function nameHasLink(name: string): boolean {
  return NAME_LINK_ANY_CASE.test(name) || NAME_LINK_DOMAIN.test(name);
}

/** Free text shown publicly must not carry links (anti-phishing). */
export function containsLink(text: string): boolean {
  return URL_LIKE.test(text);
}
