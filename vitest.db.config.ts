import { defineConfig } from "vitest/config";

const srcDir = decodeURIComponent(new URL("./src/", import.meta.url).pathname);
const functionsDir = decodeURIComponent(new URL("./supabase/functions/", import.meta.url).pathname);

/** Integration tests against the local Supabase stack. Run with `pnpm test:db`. */
export default defineConfig({
  resolve: { alias: { "@/": srcDir, "@functions/": functionsDir } },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
