import { beforeEach, describe, expect, it } from "vitest";

import { resetWelcomeSession, takeWelcome, WELCOME_KEY } from "@/app/decipher";
import { DECIPHER, decipherUrl, TELEGRAM_INVITE_URL, telegramInvite } from "@/content/decipher";

/** Just enough of `Storage` for the welcome flag. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

function fail(): never {
  throw new DOMException("blocked", "SecurityError");
}

/** Storage that throws on every call, like a browser with site data blocked. */
function blockedStorage(): Storage {
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe("decipherUrl", () => {
  it("tags the website with coii and the spot it was tapped from", () => {
    expect(decipherUrl("welcome")).toBe(
      "https://www.decipherclub.com/?utm_source=coii&utm_medium=welcome",
    );
    expect(decipherUrl("about")).toBe(
      "https://www.decipherclub.com/?utm_source=coii&utm_medium=about",
    );
    expect(decipherUrl("hud")).toBe("https://www.decipherclub.com/?utm_source=coii&utm_medium=hud");
  });
});

describe("telegramInvite", () => {
  it("is the coii invite when it's set", () => {
    expect(telegramInvite()).toBe(TELEGRAM_INVITE_URL);
    expect(TELEGRAM_INVITE_URL).toMatch(/^https:\/\/t\.me\/\+/);
  });

  it("is null (the button hides) when the invite is empty or blank", () => {
    expect(telegramInvite("")).toBeNull();
    expect(telegramInvite("   ")).toBeNull();
  });
});

describe("the pitch", () => {
  it("is the owner's wording, word for word", () => {
    expect(DECIPHER.pitch).toBe(
      "Built by Decipher Club: a research-driven publication by builders for builders.",
    );
  });
});

describe("takeWelcome", () => {
  beforeEach(() => resetWelcomeSession());

  it("shows once per browser, and remembers it straight away", () => {
    const storage = memoryStorage();
    expect(takeWelcome(storage)).toBe(true);
    expect(storage.getItem(WELCOME_KEY)).not.toBeNull();
    expect(takeWelcome(storage)).toBe(false);
  });

  it("never shows again once this browser has seen it (a reload, a later claim)", () => {
    const storage = memoryStorage();
    storage.setItem(WELCOME_KEY, "seen");
    expect(takeWelcome(storage)).toBe(false);
  });

  it("falls back to once per session when storage is blocked or missing", () => {
    expect(takeWelcome(blockedStorage())).toBe(true);
    expect(takeWelcome(blockedStorage())).toBe(false);
    resetWelcomeSession();
    expect(takeWelcome(null)).toBe(true);
    expect(takeWelcome(null)).toBe(false);
  });
});
