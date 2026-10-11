import { defineConfig, devices } from "@playwright/test";

/**
 * GitHub's runners have no GPU, so Chrome draws the 1,500-bean WebGL venue in software and the
 * suite runs about four times slower there: more time per test, and one retry.
 */
const ci = Boolean(process.env["CI"]);

/** Smoke tests against the real app in the system Chrome (no browser download needed). */
export default defineConfig({
  testDir: "e2e",
  testIgnore: "backend/**",
  timeout: ci ? 120_000 : 45_000,
  retries: ci ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
    // Demo mode, always: empty values beat `.env.local`, so this suite never reaches a database
    // (docs/prd/database.md §15). The backend suite is playwright.backend.config.ts.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_TURNSTILE_SITE_KEY: "" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
