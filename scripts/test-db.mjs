// Runs the database integration tests against the local Supabase stack (`supabase start` first).
// Starts from a known state (fresh schema + demo seed; pass --no-reset to keep the current data),
// reads the local URL and keys from `supabase status`, serves the Edge Functions locally with a
// fake bot token, runs vitest, and stops the functions again.
import { spawnSync } from "node:child_process";

import {
  requireTurnstile,
  resetDatabase,
  serveFunctions,
  stackStatus,
  TEST_BOT_TOKEN,
} from "./local-stack.mjs";

const ORIGIN = "http://localhost:5173";

const args = process.argv.slice(2);
const keepData = args.includes("--no-reset");
const vitestArgs = args.filter((arg) => arg !== "--no-reset");

await requireTurnstile();
if (!keepData) resetDatabase();
const status = stackStatus();

let code = 1;
let functions = null;
try {
  functions = await serveFunctions(status, ORIGIN);
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
  functions?.stop();
}
process.exit(code);
