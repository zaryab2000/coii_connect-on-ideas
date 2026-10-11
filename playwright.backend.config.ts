import { defineConfig } from "@playwright/test";

/**
 * The app in backend mode against the LOCAL Supabase stack. Run it with
 * `pnpm test:e2e:backend`, which resets the database, serves the Edge Functions and passes the
 * local URL and key in. It never reads `.env.local` values: these env values win over it.
 */
const url = process.env["COII_E2E_SUPABASE_URL"] ?? "";
const key = process.env["COII_E2E_SUPABASE_PUBLISHABLE_KEY"] ?? "";
if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
  throw new Error(
    "The backend e2e suite only runs against the local stack: use pnpm test:e2e:backend",
  );
}

export default defineConfig({
  testDir: "e2e/backend",
  // Venue polling runs once a minute, so "another browser sees it" checks wait up to 70 s.
  timeout: 360_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5175",
    channel: "chrome",
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      // Cloudflare's public always-pass test key; the local auth server has the test secret.
      VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
  },
});
