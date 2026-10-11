// Shared by the test runners that need the local Supabase stack (`supabase start` first):
// pnpm test:db (vitest against the API) and pnpm test:e2e:backend (the app in backend mode).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Local-only fake; the real token lives in the project's secret store. */
export const TEST_BOT_TOKEN = "local-test-bot-token";

/** Runs a command, echoing it; exits with its status if it fails. */
export function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Joining needs Cloudflare's Turnstile test endpoint (the local auth server verifies the test
 * token there), so these tests need internet access.
 */
export async function requireTurnstile() {
  try {
    await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    console.error(
      "Can't reach challenges.cloudflare.com: the local auth server needs it to accept the " +
        "Turnstile test token. Connect to the internet and try again.",
    );
    process.exit(1);
  }
}

/** Fresh schema plus the default 1,500-bean demo seed (supabase/seed.sql may hold a smaller one). */
export function resetDatabase() {
  run("pnpm", ["db:seed"]);
  run("supabase", ["db", "reset"]);
}

/** URLs and keys of the running local stack. */
export function stackStatus() {
  try {
    return JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
  } catch (error) {
    console.error("Couldn't read the local Supabase stack. Run `supabase start` first.\n", error);
    process.exit(1);
  }
}

/**
 * Serves the Edge Functions locally with the fake bot token and these allowed origins. Resolves
 * once they answer; `stop()` shuts them down. `status` is `stackStatus()`.
 */
export async function serveFunctions(status, origins) {
  const apiUrl = status.API_URL;
  const dir = mkdtempSync(join(tmpdir(), "coii-functions-"));
  const envFile = join(dir, "functions.env");
  writeFileSync(envFile, `TELEGRAM_BOT_TOKEN=${TEST_BOT_TOKEN}\nALLOWED_ORIGINS=${origins}\n`);
  const child = spawn("supabase", ["functions", "serve", "--env-file", envFile], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));
  const stop = () => {
    child.kill("SIGINT");
    rmSync(dir, { recursive: true, force: true });
  };
  /* oxlint-disable eslint/no-await-in-loop -- polls once a second until the functions answer */
  // Ready once our runtime answers: a POST from an allowed origin with the local anon key (no
  // user) gets the function's own 401 `coii:not_signed_in`. A runtime left over from
  // `supabase start` (without this env file) refuses the origin with a 403 instead. (Locally the
  // gateway sets `Access-Control-Allow-Origin: *` itself, so that header can't tell them apart.)
  const origin = origins.split(",")[0];
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${apiUrl}/functions/v1/deal-hand`, {
        method: "POST",
        headers: {
          Origin: origin,
          apikey: status.ANON_KEY,
          Authorization: `Bearer ${status.ANON_KEY}`,
        },
      });
      if (res.status === 401 && (await res.text()).includes("coii:not_signed_in")) return { stop };
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  /* oxlint-enable eslint/no-await-in-loop */
  stop();
  throw new Error(`Edge Functions didn't start:\n${log}`);
}
