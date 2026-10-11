// `pnpm test:csp` (pre-release tracker P9): builds the app for production against the LOCAL
// Supabase stack, serves it with `vite preview` under the same headers as Vercel (vercel.json,
// Supabase origin swapped for the local one), and walks the main flows in Chrome: the map, join
// (Turnstile), Meet and realtime, the board, adda, privacy, Google sign-in and the Telegram
// button. Fails on any Content-Security-Policy violation. Needs `supabase start` and internet.
import { spawn, spawnSync } from "node:child_process";

import { chromium } from "@playwright/test";

import { requireTurnstile, serveFunctions, stackStatus } from "./local-stack.mjs";

const PORT = 5176;
const ORIGIN = `http://localhost:${PORT}`;
const status = stackStatus();
const env = {
  ...process.env,
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

await requireTurnstile();
console.log("$ vite build (backend mode, local stack)");
if (spawnSync("pnpm", ["exec", "vite", "build"], { stdio: "inherit", env }).status !== 0) {
  process.exit(1);
}

const functions = await serveFunctions(status.API_URL, ORIGIN);
const preview = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
  env,
});

/** Every CSP violation a page reports, from the DOM event and the console. */
async function watch(context) {
  await context.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      window.cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI || "(inline)"}`),
    );
  });
  const page = await context.newPage();
  const logged = [];
  page.on("console", (m) => {
    // Only CSP reports. (The analytics script 404s off Vercel; that isn't a policy problem.)
    if (/Content Security Policy/i.test(m.text())) logged.push(m.text());
  });
  page.on("pageerror", (e) => logged.push(`page error: ${e.message}`));
  return { page, logged };
}

async function violations({ page, logged }) {
  const events = await page.evaluate(() => window.cspViolations ?? []).catch(() => []);
  return [...events, ...logged];
}

async function waitForApp(page) {
  await page.waitForSelector("canvas", { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector(".map-loading"), undefined, {
    timeout: 30_000,
  });
}

const found = [];
let browser;
try {
  /* oxlint-disable eslint/no-await-in-loop -- polls until the preview server answers */
  for (let i = 0; i < 30; i++) {
    const up = await fetch(ORIGIN).then(
      (r) => r.ok,
      () => false,
    );
    if (up) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  /* oxlint-enable eslint/no-await-in-loop */
  const csp = (await fetch(ORIGIN)).headers.get("content-security-policy") ?? "";
  if (!csp.includes("connect-src")) throw new Error("vite preview didn't send the CSP header");
  console.log(`CSP in force: ${csp}`);

  browser = await chromium.launch({ channel: "chrome" });

  // 1. A visitor: the map, the board, the privacy notice.
  const visitor = await watch(await browser.newContext());
  await visitor.page.goto(ORIGIN);
  await waitForApp(visitor.page);
  await visitor.page.getByRole("button", { name: /Wave points board/ }).click();
  await visitor.page.keyboard.press("Escape");
  await visitor.page.goto(`${ORIGIN}/privacy`);
  await visitor.page.getByRole("dialog", { name: "Privacy" }).waitFor();
  found.push(...(await violations(visitor)).map((v) => `visitor: ${v}`));

  // 2. Join through Turnstile, then Meet (deal-hand), realtime and adda.
  const member = await watch(await browser.newContext());
  await member.page.goto(`${ORIGIN}/join`);
  await waitForApp(member.page);
  const form = member.page.getByRole("dialog", { name: "Join coii" });
  await form.getByLabel("Your name").fill("Csp Check");
  await form.getByLabel("Telegram username").fill(`cspcheck_${Date.now().toString(36)}`);
  await form.locator(".topic-picker").first().getByRole("button", { name: "Privacy" }).click();
  await form.getByText("Your bean, name, topics and one-liners are public.").click();
  await form.locator('input[name="cf-turnstile-response"]').waitFor({ state: "attached" });
  await member.page.waitForFunction(
    () => document.querySelector('input[name="cf-turnstile-response"]')?.value,
    undefined,
    { timeout: 20_000 },
  );
  await form.getByRole("button", { name: "Walk into coii" }).click();
  await form.waitFor({ state: "detached", timeout: 20_000 });
  await member.page.getByRole("button", { name: /^Meet/ }).first().click();
  await member.page.waitForTimeout(3000);
  await member.page.getByRole("button", { name: /^Adda/ }).first().click();
  await member.page.waitForTimeout(1000);
  // The Telegram button loads Telegram's widget (script + iframe) once you have a bean.
  await member.page.goto(`${ORIGIN}/join`);
  await member.page.getByRole("button", { name: /Verify with Telegram/ }).click();
  await member.page.locator('iframe[src*="oauth.telegram.org"]').waitFor({ timeout: 15_000 });
  await member.page.waitForTimeout(1500);
  found.push(...(await violations(member)).map((v) => `member: ${v}`));

  // 3. "Sign in with Google" leaves for Supabase Auth; nothing may be blocked before it does.
  const google = await watch(await browser.newContext());
  await google.page.goto(`${ORIGIN}/join`);
  await waitForApp(google.page);
  const leaving = google.page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"));
  await google.page.getByRole("button", { name: "Already joined? Sign in with Google" }).click();
  await leaving;
  found.push(...google.logged.map((v) => `google: ${v}`));
} finally {
  await browser?.close();
  preview.kill("SIGINT");
  functions.stop();
}

if (found.length > 0) {
  console.error(`\n${found.length} CSP problem(s):\n${found.join("\n")}`);
  process.exit(1);
}
console.log(
  "\nNo CSP violations: map, board, privacy, join (Turnstile), Meet, adda, Google, Telegram.",
);
