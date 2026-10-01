import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const srcDir = decodeURIComponent(new URL("./src/", import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/": srcDir,
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
