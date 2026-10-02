import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const srcDir = decodeURIComponent(new URL("./src/", import.meta.url).pathname);
const functionsDir = decodeURIComponent(new URL("./supabase/functions/", import.meta.url).pathname);
const scriptsDir = decodeURIComponent(new URL("./scripts/", import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/": srcDir,
      // Tests only: the Edge Functions' shared code and the build scripts.
      "@functions/": functionsDir,
      "@scripts/": scriptsDir,
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
