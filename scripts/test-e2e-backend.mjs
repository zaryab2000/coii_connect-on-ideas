// Runs the app in backend mode against the local Supabase stack (`supabase start` first) and
// drives it with Playwright: join, wave, chai, report, leave, adda (e2e/backend/). Resets the
// database to the 1,500-bean seed first; pass --no-reset to keep the current data. Extra
// arguments go to Playwright.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { requireTurnstile, resetDatabase, serveFunctions, stackStatus } from "./local-stack.mjs";

/** The port playwright.backend.config.ts serves the app on; the functions must allow it. */
const ORIGIN = "http://localhost:5175";

const args = process.argv.slice(2);
const keepData = args.includes("--no-reset");
const playwrightArgs = args.filter((arg) => arg !== "--no-reset");

await requireTurnstile();
if (!keepData) resetDatabase();
const status = stackStatus();
// The tests check rows with psql inside the local database container (the tables live in a
// schema the API doesn't expose, on purpose).
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync("supabase/config.toml", "utf8"),
)?.[1];
if (!projectId) throw new Error("supabase/config.toml has no project_id");

let code = 1;
let functions = null;
try {
  functions = await serveFunctions(status, ORIGIN);
  const tests = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.backend.config.ts", ...playwrightArgs],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        COII_E2E_SUPABASE_URL: status.API_URL,
        COII_E2E_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        COII_E2E_DB_CONTAINER: `supabase_db_${projectId}`,
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
