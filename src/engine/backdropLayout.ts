import type { Rect } from "@/sim/layout";

/**
 * A painted backdrop plate, as packed by scripts/backdrop-plates.mjs: one atlas holding the harbour that runs
 * along the bottom of the view and the sun with its clouds, in the atlas's pixels.
 */
export interface BackdropPlate {
  readonly width: number;
  readonly height: number;
  /**
   * The harbour band. `waterline` is where its skyline meets the sea, from the band's top; `pad` is how far its
   * sea carries on (fading out) past each end of the painting itself.
   */
  readonly band: Rect & { readonly waterline: number; readonly pad: number };
  readonly sun: Rect;
}

/** One cut-out of the plate: its frame's top-left at (x, y), `scale` units per plate pixel. */
export interface BackdropPiece {
  readonly frame: Rect;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** The map's size on screen (CSS px) and how much of its top the HUD covers. */
export interface BackdropScreen {
  readonly w: number;
  readonly h: number;
  readonly top: number;
}

/** Share of the sea's height above the bottom of the screen (the faded rest hangs below it). */
const SEA_SHOWN = 0.8;
/** The harbour never takes more than this share of the screen's height (on very wide screens). */
const MAX_HEIGHT = 0.42;

/**
 * Where the painting sits on screen at the default view: the harbour across the whole bottom, its sea along the
 * bottom edge, and the sun in the top-left corner under the HUD. It's scenery far behind the venue (see
 * `backdropInWorld`), so it doesn't shrink into a strip when you zoom out or blur when you zoom in.
 */
export function backdropPieces(plate: BackdropPlate, screen: BackdropScreen): BackdropPiece[] {
  const { band, sun } = plate;
  const scale = Math.min(screen.w / (band.w - 2 * band.pad), (screen.h * MAX_HEIGHT) / band.h);
  const shore = screen.h - (band.h - band.waterline) * scale * SEA_SHOWN;
  return [
    {
      frame: band,
      x: screen.w / 2 - (band.w / 2) * scale,
      y: shore - band.waterline * scale,
      scale,
    },
    { frame: sun, x: 0, y: screen.top, scale },
  ];
}

/** The camera, as far as the backdrop cares. */
export interface BackdropCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly viewW: number;
  readonly viewH: number;
}

/** The default view the painting is composed for: the world point at the screen's middle, and the zoom. */
export interface BackdropHome {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** Depth: the backdrop moves this share as far as the venue when you pan... */
const PARALLAX = 0.12;
/** ...and grows by the zoom ratio to this power when you zoom (the venue grows by the full ratio). */
const GROW = 0.12;

/**
 * Where a piece goes on the floor layer (world units) for the camera now: its spot at the default view, moved by
 * a little of the camera's pan and zoom, so the venue slides over the painting like scenery far behind it.
 */
export function backdropInWorld(
  piece: BackdropPiece,
  camera: BackdropCamera,
  home: BackdropHome,
): { x: number; y: number; scale: number } {
  const grow = (camera.zoom / home.zoom) ** GROW;
  const x =
    camera.viewW / 2 +
    (piece.x - camera.viewW / 2) * grow +
    (home.x - camera.x) * camera.zoom * PARALLAX;
  // Grows about the bottom of the screen, where the harbour stands.
  const y =
    camera.viewH + (piece.y - camera.viewH) * grow + (home.y - camera.y) * camera.zoom * PARALLAX;
  return {
    x: (x - camera.viewW / 2) / camera.zoom + camera.x,
    y: (y - camera.viewH / 2) / camera.zoom + camera.y,
    scale: (piece.scale * grow) / camera.zoom,
  };
}

/** Fully there up to this much closer than the default view, then gone by FADE_END. */
const FADE_START = 1.5;
const FADE_END = 2.4;

/**
 * How visible the backdrop is at a zoom, relative to the default view's: it's scenery for the overview, so it
 * fades away as you zoom in close on the crowd. Zoomed out, it stays.
 */
export function backdropAlpha(zoom: number, homeZoom: number): number {
  const t = (FADE_END - zoom / homeZoom) / (FADE_END - FADE_START);
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}
