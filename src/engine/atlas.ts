import { CanvasSource, Rectangle, Texture } from "pixi.js";

import { HAIR_STYLES, SKIN_TONES } from "@/data/avatar";
import { TOPICS } from "@/data/topics";
import type { IconId } from "@/data/types";
import {
  drawAccessory,
  drawBody,
  drawFace,
  drawHair,
  drawHead,
  drawLegs,
  drawLodBean,
  drawPhone,
  drawShadow,
} from "@/engine/beanArt";
import type { FaceKind, LegPose } from "@/engine/beanArt";
import { drawBang, drawBubble, drawConfetti, drawDust, drawRing, drawStar } from "@/engine/fxArt";
import { loadIconImages } from "@/engine/icons";
import { css } from "@/engine/palette";

/** A sub-texture plus the anchor that puts the drawing origin at the particle position. */
export interface Frame {
  readonly texture: Texture;
  readonly anchorX: number;
  readonly anchorY: number;
  /** World units per texture pixel. */
  readonly scale: number;
}

export const BUBBLE_ICONS: readonly IconId[] = [
  "light_bulb",
  "handshake",
  "fire",
  "rocket",
  "sparkles",
  "red_heart",
  "hot_beverage",
  "speech_balloon",
];

export interface CrowdAtlas {
  readonly legs: Readonly<Record<LegPose, Frame>>;
  readonly body: Frame;
  readonly head: Frame;
  readonly faces: Readonly<Record<FaceKind, Frame>>;
  /** Indexed like HAIR_STYLES; null where nothing is drawn (bald). */
  readonly hair: readonly (Frame | null)[];
  /** Indexed like ACCESSORIES; index 0 ("none") is null. */
  readonly accessories: readonly (Frame | null)[];
  readonly phone: Frame;
  readonly shadow: Frame;
  /** Far-zoom one-piece beans, index `topic * SKIN_TONES.length + skin`. */
  readonly lod: readonly Frame[];
  readonly dust: Frame;
  readonly star: Frame;
  readonly confetti: Frame;
  readonly ring: Frame;
  readonly bang: Frame;
  readonly bubble: Frame;
  readonly icons: ReadonlyMap<IconId, Frame>;
}

const BEAN_SCALE = 4;
const LOD_SCALE = 1.5;
const FX_SCALE = 4;
const ICON_PX = 64;
const GAP = 6;
const BEAN_BOX = { w: 34, h: 52, ox: 17, oy: 48 };

interface Request {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly scale: number;
  readonly draw: (ctx: CanvasRenderingContext2D) => void;
  readonly resolve: (frame: Frame) => void;
  x?: number;
  y?: number;
}

class AtlasBuilder {
  private readonly requests: Request[] = [];

  add(
    box: { w: number; h: number; ox: number; oy: number },
    scale: number,
    draw: Request["draw"],
  ): Promise<Frame> {
    return new Promise((resolve) => {
      this.requests.push({ ...box, scale, draw, resolve });
    });
  }

  build(width: number): HTMLCanvasElement {
    const sorted = this.requests.toSorted((a, b) => b.h * b.scale - a.h * a.scale);
    let x = GAP;
    let y = GAP;
    let shelf = 0;
    for (const req of sorted) {
      const pw = Math.ceil(req.w * req.scale);
      const ph = Math.ceil(req.h * req.scale);
      if (x + pw + GAP > width) {
        x = GAP;
        y += shelf + GAP;
        shelf = 0;
      }
      req.x = x;
      req.y = y;
      x += pw + GAP;
      shelf = Math.max(shelf, ph);
    }
    const height = 2 ** Math.ceil(Math.log2(y + shelf + GAP));
    if (height > 4096) {
      throw new Error(
        `Crowd atlas needs ${height}px of height; keep it at or below 4096 for phones`,
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable, so the crowd art cannot be drawn");
    for (const req of sorted) {
      ctx.save();
      ctx.translate((req.x ?? 0) + req.ox * req.scale, (req.y ?? 0) + req.oy * req.scale);
      ctx.scale(req.scale, req.scale);
      req.draw(ctx);
      ctx.restore();
    }
    const source = new CanvasSource({
      resource: canvas,
      autoGenerateMipmaps: true,
      scaleMode: "linear",
      resolution: 1,
    });
    for (const req of sorted) {
      const pw = Math.ceil(req.w * req.scale);
      const ph = Math.ceil(req.h * req.scale);
      req.resolve({
        texture: new Texture({ source, frame: new Rectangle(req.x ?? 0, req.y ?? 0, pw, ph) }),
        anchorX: (req.ox * req.scale) / pw,
        anchorY: (req.oy * req.scale) / ph,
        scale: 1 / req.scale,
      });
    }
    return canvas;
  }
}

function centered(size: number): { w: number; h: number; ox: number; oy: number } {
  return { w: size, h: size, ox: size / 2, oy: size / 2 };
}

function record<K extends string>(
  keys: readonly K[],
  make: (key: K) => Promise<Frame>,
): Promise<Record<K, Frame>> {
  return Promise.all(keys.map(async (key) => [key, await make(key)] as const)).then(
    (entries) => Object.fromEntries(entries) as Record<K, Frame>,
  );
}

/** Draws every crowd and effect sprite into one mip-mapped canvas texture. */
export async function buildCrowdAtlas(): Promise<CrowdAtlas> {
  const icons = await loadIconImages([...BUBBLE_ICONS, "waving_hand", "dizzy", "party_popper"]);
  const b = new AtlasBuilder();
  const bean = (draw: Request["draw"]): Promise<Frame> => b.add(BEAN_BOX, BEAN_SCALE, draw);

  const legs = record(["stand", "stepA", "stepB", "dangle"] as const, (pose) =>
    bean((c) => drawLegs(c, pose)),
  );
  const faces = record(["open", "blink", "happy", "dizzy", "wow", "down"] as const, (kind) =>
    bean((c) => drawFace(c, kind)),
  );
  const hair = Promise.all(
    HAIR_STYLES.map((style) =>
      style === "bald" ? Promise.resolve(null) : bean((c) => void drawHair(c, style)),
    ),
  );
  const accessories = Promise.all([
    Promise.resolve(null),
    bean((c) => drawAccessory(c, "glasses")),
    bean((c) => drawAccessory(c, "sunglasses")),
    bean((c) => drawAccessory(c, "headphones")),
  ]);
  const lod = Promise.all(
    TOPICS.flatMap((topic) =>
      SKIN_TONES.map((skin) =>
        b.add(BEAN_BOX, LOD_SCALE, (c) => drawLodBean(c, topic.css, css(skin))),
      ),
    ),
  );
  const iconFrames = Promise.all(
    [...icons.entries()].map(async ([id, image]) => {
      const frame = await b.add(centered(16), ICON_PX / 16, (c) =>
        c.drawImage(image, -8, -8, 16, 16),
      );
      return [id, frame] as const;
    }),
  );

  const frames = {
    body: bean(drawBody),
    head: bean(drawHead),
    phone: bean(drawPhone),
    shadow: b.add({ w: 24, h: 10, ox: 12, oy: 5 }, BEAN_SCALE, drawShadow),
    dust: b.add(centered(18), FX_SCALE, drawDust),
    star: b.add(centered(14), FX_SCALE, drawStar),
    confetti: b.add(centered(6), FX_SCALE, drawConfetti),
    ring: b.add({ w: 34, h: 14, ox: 17, oy: 7 }, FX_SCALE, drawRing),
    bang: b.add(centered(14), FX_SCALE, drawBang),
    bubble: b.add({ w: 20, h: 20, ox: 10, oy: 10 }, FX_SCALE, drawBubble),
  };

  b.build(2048);

  return {
    legs: await legs,
    faces: await faces,
    hair: await hair,
    accessories: await accessories,
    lod: await lod,
    icons: new Map(await iconFrames),
    body: await frames.body,
    head: await frames.head,
    phone: await frames.phone,
    shadow: await frames.shadow,
    dust: await frames.dust,
    star: await frames.star,
    confetti: await frames.confetti,
    ring: await frames.ring,
    bang: await frames.bang,
    bubble: await frames.bubble,
  };
}
