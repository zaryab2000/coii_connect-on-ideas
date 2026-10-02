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
import { generateDemo } from "@/data/generateDemo";
import { loadYou } from "@/data/localUser";
import { demoSource } from "@/data/source";
import { engine } from "@/engine";

const params = new URLSearchParams(location.search);
const count = Math.min(4000, Math.max(10, Number(params.get("n")) || 1500));
const crowd = generateDemo({ seed: 2026, count, reserve: 300, now: Date.now() });
const you = loadYou();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

engine.setReducedMotion(reducedMotion);
engine.setPeople(you ? [...crowd.people, you] : crowd.people);
const controller = createController(engine, { people: crowd.people, you, reducedMotion });
if (!params.has("still"))
  controller.startArrivals(demoSource(crowd.reserve, { minDelayMs: 6000, maxDelayMs: 14000 }));

if (import.meta.env.DEV || params.has("debug")) {
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
