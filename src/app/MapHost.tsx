import { useEffect, useRef } from "react";

import type { EngineApi } from "@/engine/types";

/** Attaches the singleton venue engine's canvas; never creates or destroys the engine itself. */
export function MapHost({ engine }: { readonly engine: EngineApi }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    engine.mount(el);
    return () => engine.unmount();
  }, [engine]);
  return <div ref={ref} className="map-host" />;
}
