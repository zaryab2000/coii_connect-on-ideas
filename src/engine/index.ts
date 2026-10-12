// A strict Content-Security-Policy (vercel.json) forbids eval; this swaps Pixi's generated
// shader, uniform and particle code for eval-free versions. Must load before Pixi renders.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect module by design
import "pixi.js/unsafe-eval";
import { CoiiEngine } from "@/engine/engine";

/**
 * The venue engine is a module-level singleton created outside React, so StrictMode double
 * mounts and re-renders never create a second WebGL context. React only attaches the canvas.
 * Only `main.tsx` imports this module (components receive the engine as a prop), so an edit to
 * engine code has no hot-update boundary and Vite performs a full page reload.
 */
export const engine = new CoiiEngine();
