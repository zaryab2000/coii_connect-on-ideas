import { CoiiEngine } from "@/engine/engine";

/**
 * The venue engine is a module-level singleton created outside React, so StrictMode double
 * mounts and re-renders never create a second WebGL context. React only attaches the canvas.
 * Only `main.tsx` imports this module (components receive the engine as a prop), so an edit to
 * engine code has no hot-update boundary and Vite performs a full page reload.
 */
export const engine = new CoiiEngine();
