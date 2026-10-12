import { execFileSync } from "node:child_process";

import { expect } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

const CONTAINER = process.env["COII_E2E_DB_CONTAINER"] ?? "";

/** One SQL statement in the local database, as `postgres`; returns psql's unaligned output. */
export function sql(query: string): string {
  if (!CONTAINER) throw new Error("COII_E2E_DB_CONTAINER is missing: run pnpm test:e2e:backend");
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-c", query],
    {
      encoding: "utf8",
    },
  ).trim();
}

export function sqlNumber(query: string): number {
  return Number(sql(query));
}

/** Errors the page logged; every backend test ends by expecting none. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

const open: BrowserContext[] = [];

/**
 * Closes every browser this test opened. Each one runs the WebGL venue; left open, they slow
 * later tests to a crawl.
 */
export async function closeBrowsers(): Promise<void> {
  await Promise.all(open.splice(0).map((context) => context.close()));
}

/** Opens the venue in a fresh browser (its own storage, so its own session). */
export async function visitor(browser: Browser): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext();
  open.push(context);
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__coii?.controller.store.get().mode === "backend");
  return { page, errors };
}

let handles = 0;

/** A unique Telegram username for this run. */
export function uniqueHandle(prefix: string): string {
  handles += 1;
  return `${prefix}_${Date.now().toString(36)}${handles}`;
}

export interface Member {
  readonly page: Page;
  readonly errors: string[];
  readonly id: string;
  readonly name: string;
  readonly telegram: string;
}

/** Joins through the real form, Turnstile test widget included; returns the new bean. */
export async function join(browser: Browser, name: string, topic = "Privacy"): Promise<Member> {
  const { page, errors } = await visitor(browser);
  const telegram = uniqueHandle(name.toLowerCase().replaceAll(/[^a-z]/g, ""));
  await page.goto("/join");
  const form = page.getByRole("dialog", { name: "Join coii" });
  await form.getByLabel("Your name").fill(name);
  await form.getByLabel("Telegram username").fill(telegram);
  await form.locator(".topic-picker").first().getByRole("button", { name: topic }).click();
  await form.getByText("Your bean, name, topics and one-liners are public.").click();
  // The always-pass test widget fills in its token after a moment.
  await expect(form.locator('input[name="cf-turnstile-response"]')).not.toHaveValue("", {
    timeout: 20_000,
  });
  await form.getByRole("button", { name: "Walk into coii" }).click();
  const id = await page.waitForFunction(() => window.__coii?.controller.store.get().you?.id);
  return { page, errors, id: (await id.jsonValue()) ?? "", name, telegram };
}

/** Opens someone's profile panel, as tapping them on the map or in a list does. */
export async function openProfile(page: Page, personId: string): Promise<void> {
  await page.evaluate((id) => window.__coii?.controller.actions.locate(id), personId);
}

/** Waits until this page's venue does (or doesn't) include someone, e.g. after a poll. */
export async function waitForPresence(
  page: Page,
  personId: string,
  present: boolean,
  timeout = 75_000,
): Promise<void> {
  await page.waitForFunction(
    ([id, want]) =>
      (window.__coii?.controller.store.get().people.some((p) => p.id === id) ?? false) === want,
    [personId, present] as const,
    { timeout, polling: 500 },
  );
}

/** Reloads the page (a fresh delta brings everyone who joined meanwhile) and waits for it. */
export async function refresh(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => {
    const state = window.__coii?.controller.store.get();
    return state?.mode === "backend" && (state.you === null || state.meet !== null);
  });
}

/** Closes any "Chai's on!" cards (they open as a modal for every new chai). */
export async function closeChaiCards(page: Page): Promise<void> {
  const card = page.getByRole("dialog", { name: /Chai's on/ });
  for (let i = 0; i < 5 && (await card.isVisible()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}

/** One column of someone's `private.people` row. */
export function personRow(personId: string, column: string): string {
  return sql(`select ${column} from private.people where id = '${personId}'`);
}

/** What Telegram's widget would send back, signed with the local stack's test bot token. */
export async function telegramLogin(fields: Record<string, string>): Promise<string> {
  const encoder = new TextEncoder();
  const check = Object.keys(fields)
    .toSorted()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = await crypto.subtle.digest("SHA-256", encoder.encode("local-test-bot-token"));
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(check));
  const hash = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new URLSearchParams({ ...fields, hash }).toString();
}
