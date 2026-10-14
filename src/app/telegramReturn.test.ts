import { describe, expect, it } from "vitest";

import {
  hasTelegramReturn,
  rememberTelegramReturn,
  takeTelegramReturn,
  TELEGRAM_RETURN_KEY,
} from "@/app/telegramReturn";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Telegram verification return", () => {
  it("returns to the exact person and surface once", () => {
    const storage = memoryStorage();
    rememberTelegramReturn(storage, { personId: "person-1", surface: "chai" }, 1000);
    expect(hasTelegramReturn(storage, 2000)).toBe(true);
    expect(takeTelegramReturn(storage, 2000)).toEqual({ personId: "person-1", surface: "chai" });
    expect(takeTelegramReturn(storage, 2000)).toBeNull();
  });

  it("rejects expired, future and malformed values", () => {
    const storage = memoryStorage();
    rememberTelegramReturn(storage, { personId: "person-1", surface: "profile" }, 1000);
    expect(takeTelegramReturn(storage, 1000 + 10 * 60 * 1000 + 1)).toBeNull();
    rememberTelegramReturn(storage, { personId: "person-1", surface: "profile" }, 2000);
    expect(takeTelegramReturn(storage, 1999)).toBeNull();
    storage.setItem(TELEGRAM_RETURN_KEY, "not json");
    expect(takeTelegramReturn(storage, 2000)).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    expect(() =>
      rememberTelegramReturn(null, { personId: "person-1", surface: "chai" }),
    ).not.toThrow();
    expect(hasTelegramReturn(null)).toBe(false);
    expect(takeTelegramReturn(null)).toBeNull();
  });
});
