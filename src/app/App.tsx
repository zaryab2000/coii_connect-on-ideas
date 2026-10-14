import { Analytics } from "@vercel/analytics/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, RefObject } from "react";

import { useActions, useApp } from "@/app/context";
import { MapHost } from "@/app/MapHost";
import type { Overlay, Panel } from "@/app/store";
import type { EngineApi } from "@/engine/types";
import { AboutOverlay } from "@/ui/AboutOverlay";
import { BoardOverlay } from "@/ui/BoardOverlay";
import { ChaiOverlay } from "@/ui/ChaiCard";
import { ClaimOverlay } from "@/ui/ClaimOverlay";
import { DecipherWelcome } from "@/ui/DecipherWelcome";
import { DropAddaOverlay } from "@/ui/DropAddaOverlay";
import { useHeightVar, useMediaQuery, usePresence } from "@/ui/hooks";
import { Hud } from "@/ui/Hud";
import { IdeasOverlay } from "@/ui/IdeasOverlay";
import { InviteOverlay } from "@/ui/InviteOverlay";
import { OpenChaiContext } from "@/ui/meetHooks";
import { OVERLAY_EXIT_MS } from "@/ui/Overlay";
import { PhoneSheets, SidePanel } from "@/ui/Panels";
import type { QueryState } from "@/ui/Panels";
import type { PeopleQuery } from "@/ui/people";
import { DEFAULT_QUERY } from "@/ui/PeopleList";
import { PrivacyOverlay } from "@/ui/PrivacyOverlay";
import { ShareAddaOverlay } from "@/ui/ShareAddaOverlay";
import { TabBar } from "@/ui/TabBar";
import { Toasts } from "@/ui/Toasts";
import { TrendsOverlay } from "@/ui/TrendsOverlay";
import { YouOverlay } from "@/ui/YouOverlay";

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

/**
 * Tells the engine how much of the map the HUD covers at the top, so framing stays below it, and the phone's
 * tab bar at the bottom, so the backdrop sits above it.
 */
function useHudInset(
  engine: EngineApi,
  hud: RefObject<HTMLElement | null>,
  tabBar: RefObject<HTMLElement | null>,
  phone: boolean,
): void {
  useEffect(() => {
    const el = hud.current;
    if (!el) return undefined;
    const bar = phone ? tabBar.current : null;
    const update = (): void =>
      engine.setInsets(el.offsetTop + el.offsetHeight + 8, bar?.offsetHeight ?? 0);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (bar) observer.observe(bar);
    return () => observer.disconnect();
  }, [engine, hud, tabBar, phone]);
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
  return panel === "people" || panel === "meet" || panel === "adda";
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
  readonly tabBar: RefObject<HTMLElement | null>;
  readonly query: QueryState;
  readonly onSheetHeight: (height: number) => void;
}

function PanelArea({ flags, tabBar, query, onSheetHeight }: PanelAreaProps) {
  if (flags.isDesktop) return <SidePanel query={query} />;
  return (
    <>
      <PhoneSheets
        query={query}
        onSheetHeight={onSheetHeight}
        reducedMotion={flags.reducedMotion}
      />
      <TabBar ref={tabBar} />
    </>
  );
}

type OverlayKind = Exclude<Overlay, "none">;

interface OverlayProps {
  readonly leaving: boolean;
  readonly onClose: () => void;
}

/** Which component draws each overlay. */
const OVERLAYS: Readonly<Record<OverlayKind, ComponentType<OverlayProps>>> = {
  about: AboutOverlay,
  you: YouOverlay,
  board: BoardOverlay,
  share: ShareAddaOverlay,
  drop: DropAddaOverlay,
  invite: InviteOverlay,
  trends: TrendsOverlay,
  privacy: PrivacyOverlay,
  claim: ClaimOverlay,
  ideas: IdeasOverlay,
};

function OverlayFor({ kind, ...rest }: OverlayProps & { readonly kind: OverlayKind }) {
  const Component = OVERLAYS[kind];
  return <Component {...rest} />;
}

/** About, your profile or the board, centred over everything; fades out when closed or swapped. */
function Overlays() {
  const actions = useActions();
  const overlay = useApp((s) => s.overlay);
  const items = usePresence<OverlayKind>(overlay === "none" ? null : overlay, OVERLAY_EXIT_MS);
  const onClose = (): void => actions.closeOverlay();
  return items.map(({ key, value, leaving }) => (
    <OverlayFor key={key} kind={value} leaving={leaving} onClose={onClose} />
  ));
}

/** App shell: the live map fills the screen; UI sits on top (phone) or beside it (desktop). */
export function App({ engine }: { readonly engine: EngineApi }) {
  const flags = useLayoutFlags();
  const ready = useApp((s) => s.ready);
  const [query, setQuery] = useState<PeopleQuery>(DEFAULT_QUERY);
  const appRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLElement>(null);
  useHeightVar(hudRef, appRef, "--hud-h");
  useHudInset(engine, hudRef, tabBarRef, !flags.isDesktop);
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
          <DecipherWelcome />
        </main>
        <PanelArea
          tabBar={tabBarRef}
          flags={flags}
          query={{ query, onQuery: setQuery }}
          onSheetHeight={onSheetHeight}
        />
        <Overlays />
        <ChaiOverlay viewing={viewingChai} onClose={closeChai} />
        {/* Cookie-free visit counts on Vercel (named on the privacy page); dev builds skip it. */}
        {import.meta.env.PROD ? <Analytics /> : null}
      </div>
    </OpenChaiContext.Provider>
  );
}
