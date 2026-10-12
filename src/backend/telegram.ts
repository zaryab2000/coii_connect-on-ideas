/**
 * "Verify with Telegram" (docs/prd/database.md §9.2, pre-release tracker P8). Telegram's Login
 * Widget sends you back to `/telegram` with a signed payload in the address; the app passes it
 * to the `telegram-link` Edge Function, which checks the signature with the bot token.
 *
 * The widget runs in redirect mode (`data-auth-url`) rather than with a JavaScript callback: its
 * callback is a string the widget evaluates, which the Content-Security-Policy forbids.
 */

/** The bot whose domain is set to coii.decipherclub.com with BotFather's /setdomain. */
export const TELEGRAM_BOT = "coii_bot";

/** Where Telegram sends you back after you confirm. */
export const TELEGRAM_PATH = "/telegram";

/**
 * The fields Telegram signs. Only these are forwarded: the server's check covers every field it
 * receives, so anything extra would break the signature.
 */
const FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

export type TelegramLogin = Readonly<Record<string, string>>;

/** A Telegram login in this address (`/telegram?id=…&hash=…`), or null. */
export function readTelegramLogin(pathname: string, search: string): TelegramLogin | null {
  if (pathname.replace(/\/+$/, "").toLowerCase() !== TELEGRAM_PATH) return null;
  const params = new URLSearchParams(search);
  const login: Record<string, string> = {};
  for (const field of FIELDS) {
    const value = params.get(field);
    if (value !== null) login[field] = value;
  }
  return login["id"] && login["hash"] && login["auth_date"] ? login : null;
}

/**
 * Takes the login out of the address (so a reload doesn't send it again) and returns it. A
 * `/telegram` address without a valid login just goes back to the map.
 */
export function takeTelegramLogin(): TelegramLogin | null {
  const login = readTelegramLogin(location.pathname, location.search);
  if (location.pathname.replace(/\/+$/, "").toLowerCase() === TELEGRAM_PATH) {
    history.replaceState(null, "", `/${location.hash}`);
  }
  return login;
}

/** The widget's attributes: your bot, a big button, and the way back to this site. */
export function widgetAttributes(origin: string): Readonly<Record<string, string>> {
  return {
    "data-telegram-login": TELEGRAM_BOT,
    "data-size": "large",
    "data-radius": "12",
    "data-auth-url": `${origin}${TELEGRAM_PATH}`,
  };
}
