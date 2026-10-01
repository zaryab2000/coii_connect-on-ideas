import {
  ACCESSORIES,
  ACCESSORY_WEIGHTS,
  HAIR_COLORS,
  HAIR_STYLE_WEIGHTS,
  hairStyleAt,
  hairTint,
  SKIN_TONES,
} from "@/data/avatar";
import { topicById } from "@/data/topics";
import type { Avatar, TopicId } from "@/data/types";
import { drawAccessory, drawBody, drawFace, drawHair, drawHead, drawLegs } from "@/engine/beanArt";
import type { FaceKind } from "@/engine/beanArt";
import { css } from "@/engine/palette";

type Draw = (ctx: CanvasRenderingContext2D) => void;

const BOX_W = 34;
const BOX_H = 52;
const FEET_X = 17;
const FEET_Y = 48;

function layer(
  draw: Draw,
  width: number,
  height: number,
  scale: number,
  tint: string | null,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const paint = (): void => {
    ctx.save();
    ctx.translate((width - BOX_W * scale) / 2 + FEET_X * scale, FEET_Y * scale);
    ctx.scale(scale, scale);
    draw(ctx);
    ctx.restore();
  };
  paint();
  if (tint) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-in";
    paint();
    ctx.globalCompositeOperation = "source-over";
  }
  return canvas;
}

/**
 * Draws a person's bean (same art as the live map) into a canvas element sized `cssSize` CSS px.
 * Tinted parts are multiplied with their colour, exactly like the WebGL particles.
 */
export function renderAvatar(
  canvas: HTMLCanvasElement,
  avatar: Avatar,
  topic: TopicId,
  cssSize: number,
  face: FaceKind = "open",
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = Math.round(cssSize * dpr);
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  const scale = size / BOX_H;
  const accessory = ACCESSORIES[avatar.accessory];
  const layers: [Draw, string | null][] = [
    [(c) => drawLegs(c, "stand"), null],
    [drawBody, topicById(topic).css],
    [drawHead, css(SKIN_TONES[avatar.skin] ?? 0xd9a066)],
    [(c) => drawFace(c, face), null],
    [
      (c) => void drawHair(c, hairStyleAt(avatar.hair)),
      css(hairTint(avatar.hair, avatar.hairColor)),
    ],
  ];
  if (accessory && accessory !== "none") layers.push([(c) => drawAccessory(c, accessory), null]);
  for (const [draw, tint] of layers) ctx.drawImage(layer(draw, size, size, scale, tint), 0, 0);
}

function weightedIndex(weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** A fresh random look for the join form's 🎲 button. */
export function randomAvatar(skin?: number): Avatar {
  return {
    skin: skin ?? Math.floor(Math.random() * SKIN_TONES.length),
    hair: weightedIndex(HAIR_STYLE_WEIGHTS),
    hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
    accessory: weightedIndex(ACCESSORY_WEIGHTS),
  };
}
