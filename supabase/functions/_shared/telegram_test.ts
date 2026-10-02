import { assertEquals } from "jsr:@std/assert@1.0.13";

import { checkTelegram, dataCheckString, telegramHash } from "./telegram.ts";
import type { TelegramPayload } from "./telegram.ts";

const TOKEN = "local-test-bot-token";
const NOW = 1_793_700_000;

async function signed(fields: Omit<TelegramPayload, "hash">): Promise<TelegramPayload> {
  return { ...fields, hash: await telegramHash(fields, TOKEN) };
}

const ASHA = { id: 4242, first_name: "Asha", username: "asha_builds", auth_date: NOW - 60 };

Deno.test("builds Telegram's data-check string: sorted, no hash, no empty fields", () => {
  assertEquals(
    dataCheckString({ username: "a", id: 1, hash: "x", auth_date: 2, last_name: undefined }),
    "auth_date=2\nid=1\nusername=a",
  );
});

Deno.test("accepts a fresh, correctly signed login", async () => {
  assertEquals(await checkTelegram(await signed(ASHA), TOKEN, NOW), {
    ok: true,
    id: 4242,
    username: "asha_builds",
  });
});

Deno.test("refuses a tampered payload", async () => {
  const payload = { ...(await signed(ASHA)), username: "someone_else" };
  assertEquals(await checkTelegram(payload, TOKEN, NOW), {
    ok: false,
    code: "telegram_bad_signature",
  });
});

Deno.test("refuses a payload signed with another bot's token", async () => {
  const payload = { ...ASHA, hash: await telegramHash(ASHA, "other-token") };
  assertEquals((await checkTelegram(payload, TOKEN, NOW)).ok, false);
});

Deno.test("refuses logins older than a day or from the future", async () => {
  const stale = await signed({ ...ASHA, auth_date: NOW - 86_401 });
  const future = await signed({ ...ASHA, auth_date: NOW + 301 });
  assertEquals(await checkTelegram(stale, TOKEN, NOW), { ok: false, code: "telegram_expired" });
  assertEquals(await checkTelegram(future, TOKEN, NOW), { ok: false, code: "telegram_expired" });
});

Deno.test("needs a Telegram username", async () => {
  const { username: _drop, ...noName } = ASHA;
  assertEquals(await checkTelegram(await signed(noName), TOKEN, NOW), {
    ok: false,
    code: "telegram_no_username",
  });
});
