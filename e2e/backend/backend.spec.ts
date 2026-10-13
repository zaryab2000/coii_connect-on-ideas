import { expect, test } from "@playwright/test";

import {
  closeBrowsers,
  closeChaiCards,
  join,
  openProfile,
  personRow,
  refresh,
  sql,
  sqlNumber,
  telegramLogin,
  visitor,
  waitForPresence,
} from "./helpers";

/**
 * Backend mode against the local stack (docs/prd/database.md §17 acceptance criteria). The
 * database starts from the 1,500-bean seed; tests run in order and the purge runs last.
 */
test.describe.configure({ mode: "serial" });
test.afterEach(closeBrowsers);

const SEED = 1500;

function pointsOf(id: string): number {
  return Number(personRow(id, "wave_points"));
}
/** §8.2 budget: bytes per bean in the uncompressed snapshot. */
const BYTES_PER_BEAN = 260;

test("AC1: a visitor sees the seeded venue from one small snapshot, with no session", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const direct: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc/get_venue?") || r.url().endsWith("/rpc/get_venue")) {
      direct.push(r.url());
    }
  });
  // The snapshot comes through the same-origin cached route (P15), never straight from Supabase.
  const snapshot = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/venue");
  await page.goto("/");
  const response = await snapshot;
  expect(response.headers()["cache-control"]).toBe(
    "public, s-maxage=60, stale-while-revalidate=60",
  );
  const body = await response.body();
  expect(body.length).toBeLessThanOrEqual(SEED * BYTES_PER_BEAN);
  await page.waitForFunction(() => window.__coii?.controller.store.get().people.length === 1500);
  const state = await page.evaluate(() => {
    const s = window.__coii?.controller.store.get();
    return { mode: s?.mode, account: s?.account, demo: s?.people.every((p) => p.isDemo) };
  });
  expect(state).toEqual({ mode: "backend", account: null, demo: true });
  expect(direct).toEqual([]);
  // Browsing never creates an account (§10.2).
  expect(sqlNumber("select count(*) from auth.users")).toBe(0);
  await expect(page.getByRole("button", { name: /Demo crowd/ })).toBeVisible();
  await context.close();
});

test("AC2 + AC3: joining makes one account and one bean that survive a reload and reach other maps", async ({
  browser,
}) => {
  const observer = await visitor(browser);
  const asha = await join(browser, "Asha Rao");
  expect(sqlNumber("select count(*) from auth.users")).toBe(1);
  expect(sqlNumber("select count(*) from private.people where source = 'self'")).toBe(1);
  expect(personRow(asha.id, "name")).toBe("Asha Rao");

  await asha.page.reload();
  await asha.page.waitForFunction(
    () => window.__coii?.controller.store.get().you?.name === "Asha Rao",
  );
  expect(sqlNumber("select count(*) from auth.users")).toBe(1);

  // Another browser picks the new bean up on its next venue poll, without reloading.
  await waitForPresence(observer.page, asha.id, true);
  expect([...asha.errors, ...observer.errors]).toEqual([]);
});

test("AC4 + AC5: a wave unlocks handles and pings the target anonymously; waving back is one chai", async ({
  browser,
}) => {
  const ravi = await join(browser, "Ravi Kumar");
  const meera = await join(browser, "Meera Iyer");
  await refresh(ravi.page);

  await openProfile(ravi.page, meera.id);
  const profile = ravi.page.locator(".profile");
  await expect(profile.getByText("Wave to see their handles")).toBeVisible();
  await profile.getByRole("button", { name: "Wave to connect" }).click();
  await expect(profile.getByText(`@${meera.telegram}`)).toBeVisible();
  await expect(profile.getByRole("link", { name: "Message on Telegram" })).toHaveAttribute(
    "href",
    `https://t.me/${meera.telegram}`,
  );

  // Meera hears about it within 5 s (realtime), as a count only.
  await meera.page.waitForFunction(
    () => window.__coii?.controller.store.get().meet?.inbound === 1,
    undefined,
    {
      timeout: 5000,
    },
  );
  // A count only: nothing in Meera's state says the wave was Ravi's.
  const meeraMeet = await meera.page.evaluate(() => {
    const meet = window.__coii?.controller.store.get().meet;
    return { waved: meet?.waved, chais: meet?.chais.length, celebrate: meet?.celebrate };
  });
  expect(meeraMeet).toEqual({ waved: [], chais: 0, celebrate: null });
  await expect(meera.page.getByText("Someone waved at you! +1 wave point").first()).toBeVisible();
  expect(Number(personRow(meera.id, "wave_points"))).toBe(1);

  // Meera waves back: a chai for both, exactly one row.
  await openProfile(meera.page, ravi.id);
  await meera.page.locator(".profile").getByRole("button", { name: "Wave to connect" }).click();
  for (const member of [meera, ravi]) {
    await expect(member.page.getByRole("dialog", { name: /Chai's on/ })).toBeVisible({
      timeout: 8000,
    });
  }
  expect(
    sqlNumber(
      `select count(*) from private.chais where a_id = least('${ravi.id}'::uuid, '${meera.id}'::uuid)
         and b_id = greatest('${ravi.id}'::uuid, '${meera.id}'::uuid)`,
    ),
  ).toBe(1);
  expect([...ravi.errors, ...meera.errors]).toEqual([]);
});

test("AC6: the 51st wave in a Meet day is refused", async ({ browser }) => {
  const zara = await join(browser, "Zara Khan");
  const results = await zara.page.evaluate(async () => {
    const hook = window.__coii;
    if (!hook) return [];
    const targets = hook.controller.store
      .get()
      .people.filter((p) => p.isDemo)
      .slice(0, 51);
    const out: string[] = [];
    for (const target of targets) out.push(await hook.controller.actions.wave(target.id));
    return out;
  });
  expect(results.slice(0, 50).filter((r) => r !== "waved" && r !== "chai")).toEqual([]);
  expect(results[50]).toBe("quota");
  expect(sqlNumber(`select count(*) from private.waves where from_id = '${zara.id}'`)).toBe(50);
  expect(zara.errors).toEqual([]);
});

test("AC7: unmatch and block take back both waves and both points", async ({ browser }) => {
  const a = await join(browser, "Kabir Shah");
  const b = await join(browser, "Lina Das");
  const c = await join(browser, "Omar Ali");
  for (const [from, to] of [
    [a, b],
    [b, a],
    [a, c],
    [c, a],
  ] as const) {
    await from.page.evaluate((id) => window.__coii?.controller.actions.wave(id), to.id);
  }
  expect([pointsOf(a.id), pointsOf(b.id), pointsOf(c.id)]).toEqual([2, 1, 1]);

  const handleOf = (id: string) =>
    a.page.evaluate(
      (pid) =>
        window.__coii?.controller.store.get().people.find((p) => p.id === pid)?.telegram ?? null,
      id,
    );
  await refresh(a.page);
  await closeChaiCards(a.page);
  await expect.poll(() => handleOf(b.id)).toBe(b.telegram);

  // Unmatch from the chai card: the handles lock again at once.
  await a.page.evaluate((id) => window.__coii?.controller.actions.unmatch(id), b.id);
  await expect.poll(() => handleOf(b.id)).toBeNull();
  await expect
    .poll(() =>
      sqlNumber(
        `select count(*) from private.waves where '${a.id}' in (from_id, to_id) and '${b.id}' in (from_id, to_id)`,
      ),
    )
    .toBe(0);
  expect([pointsOf(a.id), pointsOf(b.id)]).toEqual([1, 0]);

  // Block from the profile's safety menu.
  await openProfile(a.page, c.id);
  const profile = a.page.locator(".profile");
  await profile.getByRole("button", { name: "Report or block Omar" }).click();
  await profile.getByRole("button", { name: "Block Omar" }).click();
  await expect
    .poll(() =>
      sqlNumber(
        `select count(*) from private.waves where '${a.id}' in (from_id, to_id) and '${c.id}' in (from_id, to_id)`,
      ),
    )
    .toBe(0);
  expect([pointsOf(a.id), pointsOf(c.id)]).toEqual([0, 0]);
  await waitForPresence(a.page, c.id, false, 5000);
  expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
});

test("AC8: three reports hide a bean from every map within 60 s", async ({ browser }) => {
  const observer = await visitor(browser);
  const target = await join(browser, "Spam Sam");
  const reporters = [
    await join(browser, "Rita Paul"),
    await join(browser, "Dev Joshi"),
    await join(browser, "Neha Bose"),
  ];
  // Reports only count from beans at least 24 h old (§2): age the reporters.
  sql(
    `update private.people set joined_at = now() - interval '25 hours'
      where id in (${reporters.map((r) => `'${r.id}'`).join(",")})`,
  );
  await refresh(observer.page);
  await waitForPresence(observer.page, target.id, true);
  for (const reporter of reporters) {
    await refresh(reporter.page);
    await openProfile(reporter.page, target.id);
    const profile = reporter.page.locator(".profile");
    await profile.getByRole("button", { name: "Report or block Spam" }).click();
    await profile.getByLabel("Spam or ads").check();
    await profile.getByRole("button", { name: "Report", exact: true }).click();
    await expect(profile.getByText("Thanks. The moderators will take a look.")).toBeVisible();
  }
  expect(personRow(target.id, "status")).toBe("hidden");
  await waitForPresence(observer.page, target.id, false);
  // The hidden bean still sees itself, with a note about why.
  await target.page.reload();
  await target.page.waitForFunction(
    () => window.__coii?.controller.store.get().account?.hidden === true,
  );
  expect([...observer.errors, ...reporters.flatMap((r) => r.errors)]).toEqual([]);
});

test("AC9: leaving deletes every row and the bean leaves other maps within 60 s", async ({
  browser,
}) => {
  const observer = await visitor(browser);
  const friend = await join(browser, "Tara Sen");
  const leaver = await join(browser, "Leo Fernandes");
  await leaver.page.evaluate((id) => window.__coii?.controller.actions.wave(id), friend.id);
  await refresh(observer.page);
  await waitForPresence(observer.page, leaver.id, true);
  expect(Number(personRow(friend.id, "wave_points"))).toBe(1);

  // A join link opens your own profile once you're in.
  await leaver.page.goto("/join");
  const you = leaver.page.getByRole("dialog", { name: "You're in" });
  await you.getByRole("button", { name: "Leave coii" }).click();
  await you.getByRole("button", { name: "Yes, leave" }).click();
  await leaver.page.waitForFunction(() => window.__coii?.controller.store.get().you === null);

  const rows = sql(
    `select (select count(*) from private.people where id = '${leaver.id}')
          + (select count(*) from private.contacts where person_id = '${leaver.id}')
          + (select count(*) from private.waves where '${leaver.id}' in (from_id, to_id))
          + (select count(*) from private.daily_hands where person_id = '${leaver.id}')`,
  );
  expect(Number(rows)).toBe(0);
  expect(Number(personRow(friend.id, "wave_points"))).toBe(0);
  await waitForPresence(observer.page, leaver.id, false);
  // After the account is deleted, supabase-js's local sign-out call is refused (403) and the
  // session is cleared anyway; the browser logs that response. Anything else is a failure.
  const expected = "Failed to load resource: the server responded with a status of 403 (Forbidden)";
  expect(leaver.errors.filter((e) => e !== expected)).toEqual([]);
  expect(observer.errors).toEqual([]);
});

test("adda: invite someone you waved at; joining makes a chai", async ({ browser }) => {
  const host = await join(browser, "Priya Nair");
  const guest = await join(browser, "Arjun Mehta");
  await refresh(host.page);
  await openProfile(host.page, guest.id);
  const profile = host.page.locator(".profile");
  await profile.getByRole("button", { name: "Wave to connect" }).click();
  await profile.getByRole("button", { name: "Add to my adda" }).click();
  await profile.getByRole("button", { name: /Build it and add Arjun/ }).click();
  await expect(host.page.getByText(/Invited Arjun to Priya's adda/).first()).toBeVisible();

  // The invite reaches Arjun live; he says yes from the Adda tab.
  await guest.page.waitForFunction(
    () => (window.__coii?.controller.store.get().adda?.invites.length ?? 0) === 1,
    undefined,
    {
      timeout: 8000,
    },
  );
  await guest.page.getByRole("button", { name: "Adda, 1 invite for you" }).click();
  await guest.page.getByRole("button", { name: "Join Priya's adda" }).click();
  await expect(guest.page.getByText(/You're in Priya's adda/).first()).toBeVisible();
  // The chai card that opens now has its own toasts, so the map's copy can sit hidden behind it.
  await expect(
    host.page
      .getByText(/Arjun joined Priya's adda/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 8000 });
  expect(
    sql(
      `select m.status from private.adda_members m join private.addas a on a.id = m.adda_id
        where a.owner_id = '${host.id}' and m.member_id = '${guest.id}'`,
    ),
  ).toBe("joined");
  expect(sqlNumber(`select count(*) from private.chais where '${host.id}' in (a_id, b_id)`)).toBe(
    1,
  );
  expect([...host.errors, ...guest.errors]).toEqual([]);
});

test("Decipher Club: a welcome card once after joining, never after a reload or an edit", async ({
  browser,
}) => {
  const member = await join(browser, "Welcome Tester");
  const { page } = member;
  const card = page.getByRole("complementary", { name: "Built by Decipher Club" });
  // It waits for the "You're in!" toast and the walk-in to go first.
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(
    card.getByText("A research-driven publication by builders for builders."),
  ).toBeVisible();
  await expect(card.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
    "href",
    "https://www.decipherclub.com/?utm_source=coii&utm_medium=welcome",
  );
  await expect(card.getByRole("link", { name: "Join our Telegram" })).toHaveAttribute(
    "href",
    "https://t.me/+mtMGHzBxC7BjOGY1",
  );
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toBeHidden();

  // Never again in this browser: not after a reload, not after editing your bean.
  await refresh(page);
  await page.evaluate(() => {
    const you = window.__coii?.controller.store.get().you;
    if (!you) throw new Error("no bean after the reload");
    // Your own bean as the form would send it back, with one line changed.
    return window.__coii?.controller.actions.join(
      { ...you, oneLiners: ["edited after the welcome card"] },
      null,
    );
  });
  await expect(page.getByText("Saved! Your bean walks back in.").first()).toBeVisible();
  await page.waitForTimeout(6000);
  await expect(card).toHaveCount(0);

  // Escape dismisses it too (another browser, so it's due again there).
  const other = await join(browser, "Escape Tester");
  const otherCard = other.page.getByRole("complementary", { name: "Built by Decipher Club" });
  await expect(otherCard).toBeVisible({ timeout: 10_000 });
  await other.page.keyboard.press("Escape");
  await expect(otherCard).toBeHidden();
  expect([...member.errors, ...other.errors]).toEqual([]);
});

test("P8: Verify with Telegram checks the signed login and adds the ✓", async ({ browser }) => {
  const asha = await join(browser, "Asha Telegram");
  const now = Math.floor(Date.now() / 1000);
  const username = `tgasha${Date.now().toString(36)}`;

  // A stale login is refused with its own copy, and nothing changes.
  const stale = await telegramLogin({
    id: "777001",
    username,
    auth_date: String(now - 2 * 86_400),
  });
  await asha.page.goto(`/telegram?${stale}`);
  await expect(
    asha.page.getByText("That Telegram login expired. Try again.").first(),
  ).toBeVisible();
  expect(personRow(asha.id, "telegram_verified")).toBe("f");

  const fresh = await telegramLogin({
    id: "777001",
    first_name: "Asha",
    username,
    auth_date: String(now),
  });
  await asha.page.goto(`/telegram?${fresh}`);
  await expect(asha.page.getByText(`Telegram verified: @${username}`).first()).toBeVisible();
  expect(new URL(asha.page.url()).pathname).toBe("/");
  expect(personRow(asha.id, "telegram_verified")).toBe("t");
  expect(sql(`select telegram from private.contacts where person_id = '${asha.id}'`)).toBe(
    username,
  );

  // The same Telegram account can't verify a second bean.
  const other = await join(browser, "Ravi Telegram");
  await other.page.goto(`/telegram?${fresh}`);
  await expect(
    other.page.getByText("That Telegram account already verified another bean.").first(),
  ).toBeVisible();
  // The two refusals are 400 answers from telegram-link, which the browser logs; nothing else.
  const refused =
    "Failed to load resource: the server responded with a status of 400 (Bad Request)";
  expect([...asha.errors, ...other.errors].filter((e) => e !== refused)).toEqual([]);
});

test("AC11: purge_demo removes every seed bean and its waves; real beans stay", async () => {
  const real = sqlNumber("select count(*) from private.people where source = 'self'");
  expect(sqlNumber("select count(*) from private.people where source = 'demo'")).toBe(SEED);
  sql("select private.purge_demo()");
  expect(sqlNumber("select count(*) from private.people where source = 'demo'")).toBe(0);
  expect(sqlNumber("select count(*) from private.people where source = 'self'")).toBe(real);
  expect(
    sqlNumber(
      `select count(*) from private.waves w
        where not exists (select 1 from private.people p where p.id = w.from_id)
           or not exists (select 1 from private.people p where p.id = w.to_id)`,
    ),
  ).toBe(0);
});

test("NPCs: after the purge, 30 grey roamers that count for nothing and say so", async ({
  browser,
}) => {
  // Runs after AC11's purge_demo(): only the 30 NPCs (and test people who stayed) are left.
  expect(sqlNumber("select count(*) from private.people where source = 'npc'")).toBe(30);
  expect(sqlNumber("select count(*) from private.people where source = 'demo'")).toBe(0);
  const { page, errors } = await visitor(browser);
  const counts = await page.evaluate(() => {
    const state = window.__coii?.controller.store.get();
    return { npcs: state?.npcs.length, npcPeople: state?.people.filter((p) => p.isNpc).length };
  });
  expect(counts).toEqual({ npcs: 30, npcPeople: 0 });
  // The near-empty note counts real people only (NPCs never fill the venue), and shows at most once.
  const real = sqlNumber(
    "select count(*) from private.people where source = 'self' and status = 'visible'",
  );
  await expect(page.getByText("The venue's just opening.")).toHaveCount(real < 10 ? 1 : 0);

  // Booth signs count real interest only.
  const realPerBooth = sqlNumber(
    "select count(*) from private.people where source = 'self' and status = 'visible' and 'jobs' = any (topics)",
  );
  await expect(
    page.getByRole("button", { name: /^Jobs & Hiring booth, \d+ people/ }),
  ).toHaveAccessibleName(new RegExp(`booth, ${realPerBooth} people interested`));

  // Tapping one opens the NPC card: no Wave, no handles, no menu.
  const npcId = await page.evaluate(() => window.__coii?.controller.store.get().npcs[0]?.id ?? "");
  await page.evaluate((id) => window.__coii?.controller.actions.selectPerson(id), npcId);
  const card = page.locator(".profile--npc");
  await expect(card.getByText("Hey, I'm just an NPC here 👋")).toBeVisible();
  await expect(card.getByText("NPC", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: /Wave/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /Report or block/ })).toHaveCount(0);

  // The board never lists them.
  await page.getByRole("button", { name: /Wave points board/ }).click();
  const board = page.getByRole("dialog", { name: "Wave points" });
  for (const name of ["Chai Runner", "Booth Hopper", "Gate Greeter"]) {
    await expect(board.getByText(name)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
