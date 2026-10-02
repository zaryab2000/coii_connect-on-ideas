import { telegramHash } from "@functions/_shared/telegram.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALLOWED_ORIGIN,
  call,
  cleanup,
  join,
  PUBLISHABLE_KEY,
  SUPABASE_URL,
  TEST_BOT_TOKEN,
} from "./helpers";
import type { Me, Member } from "./helpers";

/** The Edge Functions over HTTP, served locally by `pnpm test:db` (docs/prd/database.md §9). */

const created: string[] = [];

async function member(overrides = {}): Promise<Member & { me: Me }> {
  const m = await join(overrides);
  created.push(m.userId);
  return m;
}

async function token(m: Member): Promise<string> {
  const { data } = await m.client.auth.getSession();
  const access = data.session?.access_token;
  if (!access) throw new Error("member has no session");
  return access;
}

async function post(
  fn: string,
  m: Member | null,
  body: unknown = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Origin: ALLOWED_ORIGIN,
      ...(m ? { Authorization: `Bearer ${await token(m)}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

interface Hand {
  readonly cards: readonly { personId: string; wildcard: boolean; reasons: string[] }[];
}

let crowd: (Member & { me: Me })[] = [];

beforeAll(async () => {
  crowd = await Promise.all(
    ["privacy", "privacy", "core", "defi", "ai"].map((topic) => member({ topics: [topic] })),
  );
});

afterAll(async () => {
  await cleanup(created);
});

describe("deal-hand", () => {
  it("deals today's hand once and returns the same cards on every later call", async () => {
    const asha = await member({ topics: ["privacy", "core"] });
    const before = await call<{ deal_needed: boolean }>(asha.client, "get_meet_state");
    expect(before.deal_needed).toBe(true);

    const first = await post("deal-hand", asha);
    expect(first.status).toBe(200);
    expect(first.headers.get("Access-Control-Allow-Origin")).not.toBeNull();
    const hand = (await first.json()) as Hand;
    expect(hand.cards.length).toBeGreaterThan(0);
    expect(hand.cards.map((c) => c.personId)).not.toContain(asha.me.id);

    const again = (await (await post("deal-hand", asha)).json()) as Hand;
    expect(again.cards).toEqual(hand.cards);
    const after = await call<{ deal_needed: boolean; hand: Hand }>(asha.client, "get_meet_state");
    expect(after.deal_needed).toBe(false);
    expect(after.hand.cards).toEqual(hand.cards);
  });

  it("needs a session and refuses origins that aren't allowed", async () => {
    expect((await post("deal-hand", null)).status).toBe(401);
    const asha = crowd[0];
    if (!asha) throw new Error("crowd not ready");
    const evil = await post("deal-hand", asha, {}, { Origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const preflight = await fetch(`${SUPABASE_URL}/functions/v1/deal-hand`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    // Locally the API gateway answers preflights itself (with `*`); in production the
    // function's own allow-list headers apply. Either way an allowed origin gets through.
    expect(preflight.ok).toBe(true);
  });
});

/** A Telegram login payload signed with the local fake bot token. */
async function signedLogin(username: string, id: number): Promise<Record<string, unknown>> {
  const fields = { id, first_name: "Test", username, auth_date: Math.floor(Date.now() / 1000) };
  return { ...fields, hash: await telegramHash(fields, TEST_BOT_TOKEN) };
}

describe("telegram-link", () => {
  it("verifies a signed login and adds the badge", async () => {
    const asha = await member();
    const username = `tgv${Date.now().toString(36)}`;
    const res = await post("telegram-link", asha, await signedLogin(username, Date.now()));
    expect(res.status).toBe(200);
    const me = (await res.json()) as Me & { telegram_verified: boolean };
    expect(me).toMatchObject({ telegram: username, telegram_verified: true });
  });

  it("refuses a tampered login", async () => {
    const asha = await member();
    const login = await signedLogin(`tgt${Date.now().toString(36)}`, Date.now() + 1);
    const res = await post("telegram-link", asha, { ...login, username: "someone_else" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "coii:telegram_bad_signature" });
  });
});

describe("delete-account", () => {
  it("removes the bean and signs the person out for good", async () => {
    const leaving = await member();
    const res = await post("delete-account", leaving);
    expect(res.status).toBe(204);
    // Without CORS headers a browser would report this success as a network error.
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBeNull();
    const venue = await call<{ id: string[] }>(crowd[0]?.client ?? leaving.client, "get_venue");
    expect(venue.id).not.toContain(leaving.me.id);
    const me = await leaving.client.rpc("get_me");
    expect(me.data ?? null).toBeNull();
  });
});
