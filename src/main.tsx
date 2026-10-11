import "@fontsource/baloo-2/700.css";
import "@fontsource/baloo-2/800.css";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/600.css";
import "@/ui/tokens.css";
import "@/ui/base.css";
import "@/ui/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import { ControllerContext } from "@/app/context";
import { createController } from "@/app/controller";
import type { AppController } from "@/app/controller";
import { isPrivacyLink, readJoinLink, withoutJoinLink } from "@/app/joinLink";
import { backendConfig } from "@/backend/config";
import type { BackendConfig } from "@/backend/config";
import { generateDemo } from "@/data/generateDemo";
import { loadYou } from "@/data/localUser";
import { demoSource } from "@/data/source";
import { engine } from "@/engine";

const params = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
engine.setReducedMotion(reducedMotion);

/** Demo mode: a generated crowd with live arrivals and simulated waves, all in this browser. */
function startDemo(): AppController {
  const count = Math.min(4000, Math.max(10, Number(params.get("n")) || 1500));
  const crowd = generateDemo({ seed: 2026, count, reserve: 300, now: Date.now() });
  const you = loadYou();
  engine.setPeople(you ? [...crowd.people, you] : crowd.people);
  const controller = createController(engine, { people: crowd.people, you, reducedMotion });
  if (!params.has("still")) {
    controller.startArrivals(demoSource(crowd.reserve, { minDelayMs: 6000, maxDelayMs: 14000 }));
    controller.startDemoWaves();
  }
  return controller;
}

/** Backend mode: the shared database. Loaded on demand, so demo mode never ships supabase-js. */
async function startBackend(config: BackendConfig): Promise<AppController> {
  const { bootBackend } = await import("@/backend/boot");
  return bootBackend(config, engine, reducedMotion);
}

function render(controller: AppController): void {
  const joinLink = readJoinLink(location.pathname, location.search);
  if (joinLink) {
    controller.openJoinLink(joinLink.topic);
    history.replaceState(
      null,
      "",
      withoutJoinLink(location.pathname, location.search, location.hash),
    );
  }
  if (isPrivacyLink(location.pathname)) {
    controller.actions.openOverlay("privacy");
    history.replaceState(null, "", `/${location.search}${location.hash}`);
  }
  if (import.meta.env.DEV) {
    Object.assign(window, { __coii: { engine, controller } });
  }
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error('index.html is missing the <div id="root"> mount point');
  createRoot(rootEl).render(
    <StrictMode>
      <ControllerContext.Provider value={controller}>
        <App engine={engine} />
      </ControllerContext.Provider>
    </StrictMode>,
  );
}

const config = backendConfig(import.meta.env);
if (config) {
  startBackend(config)
    .then(render)
    .catch((error: unknown) => {
      console.error("coii couldn't start", error);
      const status = document.getElementById("boot-status");
      if (status) status.textContent = "coii couldn't start. Reload the page to try again.";
    });
} else {
  render(startDemo());
}
