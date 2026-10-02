import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { useActions, useApp } from "@/app/context";
import { MapHost } from "@/app/MapHost";
import type { Panel } from "@/app/store";
import type { EngineApi } from "@/engine/types";
import { ChaiOverlay } from "@/ui/ChaiCard";
import { useHeightVar, useMediaQuery } from "@/ui/hooks";
import { Hud } from "@/ui/Hud";
import { OpenChaiContext } from "@/ui/meetHooks";
import { PhoneSheets, SidePanel } from "@/ui/Panels";
import type { QueryState } from "@/ui/Panels";
import type { PeopleQuery } from "@/ui/people";
import { DEFAULT_QUERY } from "@/ui/PeopleList";
import { TabBar } from "@/ui/TabBar";
import { Toasts } from "@/ui/Toasts";

const DESKTOP = "(min-width: 768px)";

/** A popover or modal dialog is open; it handles Esc itself. */
function overlayIsOpen(): boolean {
  if (document.querySelector("dialog[open]") !== null) return true;
  try {
    return document.querySelector(":popover-open") !== null;
  } catch {
    return false;
  }
}

/** Esc closes the open panel, unless a popover or dialog (which handle Esc) is open. */
function useEscapeCloses(): void {
  const actions = useActions();
  const panel = useApp((s) => s.panel);
  useEffect(() => {
    if (panel === "none") return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (overlayIsOpen()) return;
      actions.closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, actions]);
}

/** Tells the engine how much of the map's top the HUD covers, so framing stays below it. */
function useHudInset(engine: EngineApi, hud: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = hud.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => engine.setInsets(el.offsetTop + el.offsetHeight + 8));
    observer.observe(el);
    return () => observer.disconnect();
  }, [engine, hud]);
}

/** Pauses the venue while a phone sheet covers most of it, to save battery. */
function usePauseWhileCovered(engine: EngineApi, covered: boolean): void {
  useEffect(() => {
    if (!covered) return undefined;
    engine.pause();
    return () => engine.resume();
  }, [engine, covered]);
}

interface LayoutFlags {
  readonly isDesktop: boolean;
  readonly reducedMotion: boolean;
  /** Phone: lift the map so the framed person or booth sits above the open sheet. */
  readonly lift: boolean;
  /** Phone: a sheet is open. */
  readonly sheet: boolean;
  /** Phone: a tall sheet covers most of the map. */
  readonly covered: boolean;
}

/** Panels that open as a tall phone sheet over most of the map. */
function isTall(panel: Panel): boolean {
  return panel === "people" || panel === "join" || panel === "meet";
}

function useLayoutFlags(): LayoutFlags {
  const isDesktop = useMediaQuery(DESKTOP);
  const prefersReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reducedState = useApp((s) => s.reducedMotion);
  const panel = useApp((s) => s.panel);
  const framed = useApp((s) => s.framed);
  const phone = !isDesktop;
  return {
    isDesktop,
    reducedMotion: reducedState || prefersReduced,
    lift: phone && framed && (panel === "profile" || panel === "booth"),
    sheet: phone && panel !== "none",
    covered: phone && isTall(panel),
  };
}

interface PanelAreaProps {
  readonly flags: LayoutFlags;
  readonly query: QueryState;
  readonly onSheetHeight: (height: number) => void;
}

function PanelArea({ flags, query, onSheetHeight }: PanelAreaProps) {
  if (flags.isDesktop) return <SidePanel query={query} />;
  return (
    <>
      <PhoneSheets
        query={query}
        onSheetHeight={onSheetHeight}
        reducedMotion={flags.reducedMotion}
      />
      <TabBar />
    </>
  );
}

/** App shell: the live map fills the screen; UI sits on top (phone) or beside it (desktop). */
export function App({ engine }: { readonly engine: EngineApi }) {
  const flags = useLayoutFlags();
  const ready = useApp((s) => s.ready);
  const [query, setQuery] = useState<PeopleQuery>(DEFAULT_QUERY);
  const appRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  useHeightVar(hudRef, appRef, "--hud-h");
  useHudInset(engine, hudRef);
  useEscapeCloses();
  usePauseWhileCovered(engine, flags.covered);
  const onSheetHeight = useCallback((height: number) => {
    appRef.current?.style.setProperty("--sheet-h", `${Math.round(height)}px`);
  }, []);
  const [viewingChai, setViewingChai] = useState<string | null>(null);
  const closeChai = useCallback(() => setViewingChai(null), []);

  return (
    <OpenChaiContext.Provider value={setViewingChai}>
      <div
        ref={appRef}
        className="app"
        data-layout={flags.isDesktop ? "desktop" : "phone"}
        data-motion={flags.reducedMotion ? "reduced" : "full"}
        data-lift={flags.lift || undefined}
        data-sheet={flags.sheet || undefined}
      >
        <main className="stage">
          <div className="map-layer">
            <MapHost engine={engine} />
          </div>
          {ready ? null : (
            <p className="map-loading" role="status">
              Opening the venue…
            </p>
          )}
          <Hud ref={hudRef} />
          <Toasts />
        </main>
        <PanelArea
          flags={flags}
          query={{ query, onQuery: setQuery }}
          onSheetHeight={onSheetHeight}
        />
        <ChaiOverlay viewing={viewingChai} onClose={closeChai} />
      </div>
    </OpenChaiContext.Provider>
  );
}
