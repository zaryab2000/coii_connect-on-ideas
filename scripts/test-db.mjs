// Runs the database integration tests against the local Supabase stack (`supabase start` first).
// Starts from a known state (fresh schema + demo seed; pass --no-reset to keep the current data),
// reads the local URL and keys from `supabase status`, serves the Edge Functions locally with a
// fake bot token, runs vitest, and stops the functions again.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Local-only fake; the real token lives in the project's secret store. */
const TEST_BOT_TOKEN = "local-test-bot-token";
const ORIGIN = "http://localhost:5173";

const args = process.argv.slice(2);
const keepData = args.includes("--no-reset");
const vitestArgs = args.filter((arg) => arg !== "--no-reset");

/** Runs a command, echoing it; exits with its status if it fails. */
function run(command, commandArgs) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Joining needs Cloudflare's Turnstile test endpoint (the local auth server verifies the test
// token there), so these tests need internet access.
try {
  await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
} catch {
  console.error(
    "Can't reach challenges.cloudflare.com: the local auth server needs it to accept the " +
      "Turnstile test token. Connect to the internet and run `pnpm test:db` again.",
  );
  process.exit(1);
}

if (!keepData) {
  // Always the default 1,500-bean seed: supabase/seed.sql may hold a smaller remote one.
  run("pnpm", ["db:seed"]);
  run("supabase", ["db", "reset"]);
}

let status;
try {
  status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
} catch (error) {
  console.error("Couldn't read the local Supabase stack. Run `supabase start` first.\n", error);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "coii-functions-"));
const envFile = join(dir, "functions.env");
writeFileSync(envFile, `TELEGRAM_BOT_TOKEN=${TEST_BOT_TOKEN}\nALLOWED_ORIGINS=${ORIGIN}\n`);

const functions = spawn("supabase", ["functions", "serve", "--env-file", envFile], {
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
functions.stdout.on("data", (chunk) => (log += chunk));
functions.stderr.on("data", (chunk) => (log += chunk));

/** Polls once a second until the functions answer; sequential on purpose. */
async function waitForFunctions() {
  /* oxlint-disable eslint/no-await-in-loop */
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${status.API_URL}/functions/v1/deal-hand`, { method: "OPTIONS" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  /* oxlint-enable eslint/no-await-in-loop */
  throw new Error(`Edge Functions didn't start:\n${log}`);
}

let code = 1;
try {
  await waitForFunctions();
  const tests = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.db.config.ts", ...vitestArgs],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        COII_TEST_SUPABASE_URL: status.API_URL,
        COII_TEST_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        COII_TEST_SUPABASE_SECRET_KEY: status.SECRET_KEY,
        COII_TEST_TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN,
        COII_TEST_ORIGIN: ORIGIN,
      },
    },
  );
  code = tests.status ?? 1;
} catch (error) {
  console.error(error);
} finally {
  functions.kill("SIGINT");
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
