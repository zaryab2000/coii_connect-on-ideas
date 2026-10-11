import { describe, expect, it } from "vitest";

import { readTelegramLogin, widgetAttributes } from "@/backend/telegram";

describe("Telegram login in the address", () => {
  it("keeps exactly the fields Telegram signs", () => {
    const login = readTelegramLogin(
      "/telegram",
      "?id=42&first_name=Asha&username=asha_builds&auth_date=1793678400&hash=abc&utm_source=x",
    );
    expect(login).toEqual({
      id: "42",
      first_name: "Asha",
      username: "asha_builds",
      auth_date: "1793678400",
      hash: "abc",
    });
  });

  it("needs the /telegram path, an id, a date and a hash", () => {
    expect(readTelegramLogin("/", "?id=1&auth_date=2&hash=h")).toBeNull();
    expect(readTelegramLogin("/telegram/", "?id=1&auth_date=2")).toBeNull();
    expect(readTelegramLogin("/TELEGRAM", "?id=1&auth_date=2&hash=h")).not.toBeNull();
  });

  it("sends Telegram back to this site's /telegram", () => {
    expect(widgetAttributes("https://coii.decipherclub.com")).toMatchObject({
      "data-telegram-login": "coii_bot",
      "data-auth-url": "https://coii.decipherclub.com/telegram",
    });
  });
});
