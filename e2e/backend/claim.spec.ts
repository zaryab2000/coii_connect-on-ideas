import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  closeBrowsers,
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
 * Claim your bean (docs-internal/prd/claim-your-bean.md §9) against the local stack. Invited beans
 * are added the way the owner adds them, with `private.invite_bean` as `postgres`.
 */
test.describe.configure({ mode: "serial" });
test.afterEach(closeBrowsers);

/** PostgREST refusals (a join that hit an invited handle) are 400s the browser logs. */
const REFUSED = "Failed to load resource: the server responded with a status of 400 (Bad Request)";

interface Invited {
  readonly id: string;
  readonly token: string;
  readonly name: string;
}

let invites = 0;

/** A short, unique handle: X handles are at most 15 characters. */
function shortHandle(prefix: string): string {
  invites += 1;
  return `${prefix}${Date.now().toString(36).slice(-7)}${invites}`;
}

/** A SQL text literal, or null. */
function text(v: string | undefined): string {
  return v === undefined ? "null" : `'${v}'`;
}

function invite(name: string, handles: { telegram?: string; x?: string }): Invited {
  const row = sql(
    `select person_id || ' ' || claim_url from private.invite_bean(
       '${name}', array['privacy','core'], array['building'], array['building private rails'],
       ${text(handles.telegram)}, ${text(handles.x)})`,
  );
  const [id = "", url = ""] = row.split(" ");
  expect(url).toMatch(/^https:\/\/coii\.decipherclub\.com\/claim\/[A-Za-z0-9_-]{43}$/);
  return { id, token: url.slice(url.lastIndexOf("/") + 1), name };
}

async function openLink(page: Page, token: string): Promise<Locator> {
  await page.goto(`/claim/${token}`);
  await page.waitForFunction(() => window.__coii?.controller.store.get().mode === "backend");
  // The token leaves the address before anything else runs.
  expect(new URL(page.url()).pathname).toBe("/");
  return page.getByRole("dialog", { name: /You're already on coii/ });
}

/** Ticks consent in `scope` and, when this browser has no session yet, waits for Turnstile. */
async function consent(page: Page, scope: Locator): Promise<void> {
  await scope.getByRole("checkbox").last().check({ force: true });
  const needsCheck = await page.evaluate(
    () => window.__coii?.controller.store.get().account === null,
  );
  if (!needsCheck) return;
  await expect(scope.locator('input[name="cf-turnstile-response"]').last()).not.toHaveValue("", {
    timeout: 20_000,
  });
}

async function youAre(page: Page, personId: string): Promise<void> {
  await page.waitForFunction(
    (id) => window.__coii?.controller.store.get().you?.id === id,
    personId,
    { timeout: 15_000 },
  );
}

/** Starts a join with `fill` filling the handle, up to the panel that offers the invited bean. */
async function joinInto(page: Page, name: string, fill: (form: Locator) => Promise<void>) {
  await page.goto("/join");
  const form = page.getByRole("dialog", { name: "Join coii" });
  await form.getByLabel("Your name").fill(name);
  await fill(form);
  await form.locator(".topic-picker").first().getByRole("button", { name: "Privacy" }).click();
  await form.getByText("Your bean, name, topics and one-liners are public.").click();
  await expect(form.locator('input[name="cf-turnstile-response"]')).not.toHaveValue("", {
    timeout: 20_000,
  });
  await form.getByRole("button", { name: "Walk into coii" }).click();
  const panel = form.getByRole("region", { name: "You're already on coii!" });
  await expect(panel).toBeVisible();
  return panel;
}

test("claim link: a visitor claims an invited bean once, and every map sees it claimed", async ({
  browser,
}) => {
  const observer = await visitor(browser);
  const kiran = invite("Kiran Claim", { telegram: shortHandle("kiranc") });
  await refresh(observer.page);
  await waitForPresence(observer.page, kiran.id, true);
  const before = await observer.page.evaluate(
    (id) => window.__coii?.controller.store.get().people.find((p) => p.id === id),
    kiran.id,
  );
  expect(before).toMatchObject({ isInvited: true, telegram: null, x: null });

  const { page, errors } = await visitor(browser);
  const screen = await openLink(page, kiran.token);
  await expect(screen.getByText(/The coii team added you as Kiran Claim/)).toBeVisible();
  // Claiming without consent is refused before anything is sent.
  await screen.getByRole("button", { name: "Claim my bean" }).click();
  await expect(screen.getByRole("alert")).toBeVisible();
  await consent(page, screen);
  await screen.getByRole("button", { name: "Claim my bean" }).click();
  await youAre(page, kiran.id);
  await expect(page.getByText("Your bean is yours now!").first()).toBeVisible();
  // Straight into editing, with the nudge to save the bean with Google.
  await expect(page.getByRole("button", { name: "Save my bean with Google" })).toBeVisible();

  expect(personRow(kiran.id, "source")).toBe("self");
  expect(personRow(kiran.id, "user_id")).not.toBe("");
  expect(personRow(kiran.id, "consent_at")).not.toBe("");
  expect(
    sql(`select used_at is not null from private.claim_tokens where person_id = '${kiran.id}'`),
  ).toBe("t");

  // Other maps pick the claim up on their next poll.
  await observer.page.waitForFunction(
    (id) =>
      window.__coii?.controller.store
        .get()
        .people.some((p) => p.id === id && p.isInvited !== true) ?? false,
    kiran.id,
    { timeout: 75_000, polling: 500 },
  );

  // The link is spent: another browser is told it was claimed.
  const late = await visitor(browser);
  const spent = await openLink(late.page, kiran.token);
  await expect(spent.getByText(/This bean has already been claimed/)).toBeVisible();
  expect([...errors, ...observer.errors, ...late.errors]).toEqual([]);
});

test("after a claim, the Decipher Club welcome card waits until Edit profile closes", async ({
  browser,
}) => {
  const meera = invite("Meera Welcome", { telegram: shortHandle("meeraw") });
  const { page, errors } = await visitor(browser);
  const screen = await openLink(page, meera.token);
  await consent(page, screen);
  await screen.getByRole("button", { name: "Claim my bean" }).click();
  await youAre(page, meera.id);
  const card = page.getByRole("complementary", { name: "Built by Decipher Club" });
  const edit = page.getByRole("dialog", { name: "Edit your bean" });
  await expect(edit).toBeVisible();
  // Never on top of Edit profile, however long it stays open.
  await page.waitForTimeout(6000);
  await expect(card).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(edit).toBeHidden();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
    "href",
    "https://www.decipherclub.com/?utm_source=coii&utm_medium=welcome",
  );
  expect(errors).toEqual([]);
});

test("claim link: broken, expired and already-have-a-bean links say why", async ({ browser }) => {
  const { page, errors } = await visitor(browser);
  const broken = await openLink(page, "garbage");
  await expect(broken.getByText(/This claim link doesn't work/)).toBeVisible();

  const old = invite("Old Link", { x: shortHandle("oldl") });
  sql(`update private.claim_tokens set expires_at = now() - interval '1 minute'
        where person_id = '${old.id}'`);
  const expired = await openLink(page, old.token);
  await expect(expired.getByText(/This claim link has expired/)).toBeVisible();

  const member = await join(browser, "Has Bean");
  const fresh = invite("Fresh Link", { x: shortHandle("fresh") });
  const ready = await openLink(member.page, fresh.token);
  await expect(ready.getByText(/You already have a bean here \(Has Bean\)/)).toBeVisible();
  await expect(ready.getByRole("button", { name: "Claim my bean" })).toHaveCount(0);
  expect(personRow(fresh.id, "source")).toBe("invited");
  expect([...errors, ...member.errors]).toEqual([]);
});

test("joining with an invited X handle offers the bean; a pasted link claims it", async ({
  browser,
}) => {
  const x = shortHandle("meena");
  const meena = invite("Meena Invited", { x });
  const { page, errors } = await visitor(browser);
  const panel = await joinInto(page, "Meena", (form) => form.getByLabel("X handle").fill(`@${x}`));
  // An X match can't be claimed with Telegram.
  await expect(panel.getByRole("button", { name: "Claim with Telegram" })).toHaveCount(0);
  expect(sqlNumber(`select count(*) from private.people where name = 'Meena'`)).toBe(0);

  await panel.getByRole("button", { name: "I have a claim link" }).click();
  await panel.getByLabel("Your claim link").fill("not a link");
  await panel.getByRole("button", { name: "Open my claim link" }).click();
  await expect(panel.getByText(/doesn't look like a claim link/)).toBeVisible();
  await panel
    .getByLabel("Your claim link")
    .fill(`https://coii.decipherclub.com/claim/${meena.token}`);
  await panel.getByRole("button", { name: "Open my claim link" }).click();

  const screen = page.getByRole("dialog", { name: /You're already on coii/ });
  await consent(page, screen);
  await screen.getByRole("button", { name: "Claim my bean" }).click();
  await youAre(page, meena.id);
  expect(personRow(meena.id, "source")).toBe("self");
  expect(errors.filter((e) => e !== REFUSED)).toEqual([]);
});

test("joining with an invited Telegram username: logging in with Telegram claims the bean", async ({
  browser,
}) => {
  const username = shortHandle("tgclaim");
  const ana = invite("Ana Telegram", { telegram: username });
  const { page, errors } = await visitor(browser);
  const panel = await joinInto(page, "Ana", (form) =>
    form.getByLabel("Telegram username").fill(username),
  );
  await panel.getByRole("button", { name: "Claim with Telegram" }).click();
  await consent(page, panel);
  await panel.getByRole("button", { name: "Continue with Telegram" }).click();
  // Consent rides along to Telegram and back; then the signed login claims the bean.
  await page.waitForFunction(() => sessionStorage.getItem("coii:telegram-claim:v1") !== null);
  const login = await telegramLogin({
    id: "777101",
    username: username.toUpperCase(),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });
  await page.goto(`/telegram?${login}`);
  await youAre(page, ana.id);
  await expect(page.getByText("Your bean is yours now!").first()).toBeVisible();
  expect(personRow(ana.id, "source")).toBe("self");
  expect(personRow(ana.id, "telegram_verified")).toBe("t");
  expect(sql(`select telegram_user_id from private.contacts where person_id = '${ana.id}'`)).toBe(
    "777101",
  );
  // Telegram's own widget script may log while it loads; only refusals are expected otherwise.
  expect(errors.filter((e) => e !== REFUSED && !e.includes("telegram.org"))).toEqual([]);
});

test("an invited bean can't be waved at and stays off the board", async ({ browser }) => {
  const member = await join(browser, "Wave Tester");
  const lone = invite("Lone Invitee", { x: shortHandle("lone") });
  // Even with points somehow on the row, the board leaves invited beans out.
  sql(`update private.people set wave_points = 999 where id = '${lone.id}'`);
  await refresh(member.page);
  await waitForPresence(member.page, lone.id, true);

  await openProfile(member.page, lone.id);
  const profile = member.page.locator(".profile");
  await expect(profile.getByText("Not claimed yet")).toBeVisible();
  await expect(profile.getByText("Added by the coii team.", { exact: false })).toBeVisible();
  await expect(profile.getByRole("button", { name: "Wave to connect" })).toHaveCount(0);
  // You have a bean, so "This is me" isn't offered.
  await expect(profile.getByRole("button", { name: "This is me" })).toHaveCount(0);

  // Even a wave sent past the UI (no button is shown) comes back "unclaimed" and writes nothing.
  // The toast for it belongs to the Wave button's hook, so it isn't asserted here.
  const result = await member.page.evaluate(
    (id) => window.__coii?.controller.actions.wave(id),
    lone.id,
  );
  expect(result).toBe("unclaimed");
  expect(sqlNumber(`select count(*) from private.waves where to_id = '${lone.id}'`)).toBe(0);

  await member.page.keyboard.press("Escape");
  await member.page.getByRole("button", { name: /Wave points board/ }).click();
  const board = member.page.getByRole("dialog", { name: "Wave points" });
  await expect(board).toBeVisible();
  await expect(board.getByText("Lone Invitee")).toHaveCount(0);

  // A visitor without a bean is offered the claim from the card.
  const stranger = await visitor(browser);
  await waitForPresence(stranger.page, lone.id, true);
  await openProfile(stranger.page, lone.id);
  await stranger.page.locator(".profile").getByRole("button", { name: "This is me" }).click();
  await expect(stranger.page.getByRole("dialog", { name: "Is this you?" })).toBeVisible();
  expect([...member.errors, ...stranger.errors]).toEqual([]);
});
