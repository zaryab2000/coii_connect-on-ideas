import { useCallback, useEffect, useRef, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { MapHost } from "@/app/MapHost";
import type { EngineApi } from "@/engine/types";
import { useHeightVar, useMediaQuery } from "@/ui/hooks";
import { Hud } from "@/ui/Hud";
import { PhoneSheets, SidePanel } from "@/ui/Panels";
import type { QueryState } from "@/ui/Panels";
import type { PeopleQuery } from "@/ui/people";
import { DEFAULT_QUERY } from "@/ui/PeopleList";
import { TabBar } from "@/ui/TabBar";
import { Toasts } from "@/ui/Toasts";

const DESKTOP = "(min-width: 768px)";

function popoverIsOpen(): boolean {
  try {
    return document.querySelector(":popover-open") !== null;
  } catch {
    return false;
  }
}

/** Esc closes the open panel, unless a popover (which handles Esc itself) is open. */
function useEscapeCloses(): void {
  const actions = useActions();
  const panel = useApp((s) => s.panel);
  useEffect(() => {
    if (panel === "none") return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (popoverIsOpen()) return;
      actions.closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, actions]);
}

/** Pauses the venue while a phone sheet covers most of it, to save battery. */
function usePauseWhileCovered(engine: EngineApi, covered: boolean): void {
  useEffect(() => {
    if (!covered) return undefined;
    engine.pause();
    return () => engine.resume();
  }, [engine, covered]);
}

/** App shell: the live map fills the screen; UI sits on top (phone) or beside it (desktop). */
export function App({ engine }: { readonly engine: EngineApi }) {
  const isDesktop = useMediaQuery(DESKTOP);
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reducedMotion = useApp((s) => s.reducedMotion) || prefersReduced;
  const ready = useApp((s) => s.ready);
  const panel = useApp((s) => s.panel);
  const framed = useApp((s) => s.framed);
  const [query, setQuery] = useState<PeopleQuery>(DEFAULT_QUERY);
  const queryState: QueryState = { query, onQuery: setQuery };
  const appRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  useHeightVar(hudRef, appRef, "--hud-h");
  useEscapeCloses();
  usePauseWhileCovered(engine, !isDesktop && (panel === "people" || panel === "join"));

  const onSheetHeight = useCallback((height: number) => {
    appRef.current?.style.setProperty("--sheet-h", `${Math.round(height)}px`);
  }, []);
  const lift = !isDesktop && framed && (panel === "profile" || panel === "booth");

  return (
    <div
      ref={appRef}
      className="app"
      data-layout={isDesktop ? "desktop" : "phone"}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-lift={lift || undefined}
      data-sheet={(!isDesktop && panel !== "none") || undefined}
    >
      <main className="stage">
        <div className="map-layer">
          <MapHost engine={engine} />
        </div>
        {ready ? null : (
          <p className="map-loading" role="status">
            Opening the adda…
          </p>
        )}
        <Hud ref={hudRef} />
        <Toasts />
      </main>
      {isDesktop ? (
        <SidePanel query={queryState} />
      ) : (
        <>
          <PhoneSheets
            query={queryState}
            onSheetHeight={onSheetHeight}
            reducedMotion={reducedMotion}
          />
          <TabBar />
        </>
      )}
    </div>
  );
}
