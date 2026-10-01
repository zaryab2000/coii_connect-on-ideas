import { MapHost } from "@/app/MapHost";
import type { EngineApi } from "@/engine/types";

/** App shell: the live map fills the screen; UI layers sit on top (phone) or beside it (desktop). */
export function App({ engine }: { readonly engine: EngineApi }) {
  return (
    <div className="app">
      <main className="app-map">
        <MapHost engine={engine} />
      </main>
    </div>
  );
}
