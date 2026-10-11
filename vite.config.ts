import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { venueResponse } from "./api/venue.js";

const srcDir = decodeURIComponent(new URL("./src/", import.meta.url).pathname);
const functionsDir = decodeURIComponent(new URL("./supabase/functions/", import.meta.url).pathname);
const scriptsDir = decodeURIComponent(new URL("./scripts/", import.meta.url).pathname);
const apiDir = decodeURIComponent(new URL("./api/", import.meta.url).pathname);

/**
 * Serves `/api/venue` from the same code Vercel runs (api/venue.js), so the dev server and
 * `vite preview` behave like the deployed site. There is no CDN locally: every request reaches
 * Supabase.
 */
function venueApi(env: Record<string, string>): Plugin {
  const handle: Connect.NextHandleFunction = (req, res, next) => {
    // Node's request type isn't fully typed here (no @types/node); these two fields are enough.
    const { method, url } = req as unknown as { method?: string; url?: string };
    if (method !== "GET" || url?.split("?")[0] !== "/api/venue") {
      next();
      return;
    }
    venueResponse({ url: env["VITE_SUPABASE_URL"], key: env["VITE_SUPABASE_PUBLISHABLE_KEY"] })
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(await response.text());
      })
      .catch(next);
  };
  return {
    name: "coii-venue-api",
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), venueApi(loadEnv(mode, ".", "VITE_"))],
  resolve: {
    alias: {
      "@/": srcDir,
      // Tests only: the Edge Functions' shared code, the build scripts and the Vercel Functions.
      "@functions/": functionsDir,
      "@scripts/": scriptsDir,
      "@api/": apiDir,
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ["src/**/*.test.ts", "api/**/*.test.ts"],
    environment: "node",
  },
}));
