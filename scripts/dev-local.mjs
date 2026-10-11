// `pnpm dev:local`: the app in backend mode against the LOCAL Supabase stack (`supabase start`
// first), with the Edge Functions served too. Uses the local URL and key from `supabase status`,
// which win over `.env.local`, so this never touches the live project.
import { spawn } from "node:child_process";

import { serveFunctions, stackStatus } from "./local-stack.mjs";

const ORIGIN = "http://localhost:5173";

const status = stackStatus();
const functions = await serveFunctions(status.API_URL, ORIGIN);
const vite = spawn("pnpm", ["exec", "vite", "--host", "--port", "5173", "--strictPort"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: status.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    // Cloudflare's public always-pass test key; the local auth server has the test secret.
    VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  },
});
const stop = () => {
  functions.stop();
  vite.kill("SIGINT");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", (code) => {
  functions.stop();
  process.exit(code ?? 0);
});
