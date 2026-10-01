import type { HairStyle } from "@/data/avatar";
import { INK_CSS } from "@/engine/palette";

/**
 * Canvas2D drawings of bean-person parts in world units with the feet at (0, 0) and up being
 * negative y. Parts meant to be tinted are drawn white with grey shading so the tint keeps volume.
 */
type Ctx = CanvasRenderingContext2D;

export const HEAD_Y = -33.5;
export const HEAD_R = 9.6;
const LINE = 1.5;

function finish(ctx: Ctx, fill: string, line = LINE): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK_CSS;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---- legs ------------------------------------------------------------------------------------

function leg(ctx: Ctx, x: number, lift: number, tilt: number): void {
  ctx.save();
  ctx.translate(x, -lift);
  ctx.rotate(tilt);
  roundRect(ctx, -2.3, -10, 4.6, 10, 2.2);
  finish(ctx, INK_CSS, 1);
  ctx.beginPath();
  ctx.ellipse(0.6, -1, 3.1, 1.9, 0, 0, Math.PI * 2);
  finish(ctx, "#ffffff", 1.1);
  ctx.restore();
}

export type LegPose = "stand" | "stepA" | "stepB" | "dangle";

export function drawLegs(ctx: Ctx, pose: LegPose): void {
  switch (pose) {
    case "stand":
      leg(ctx, -4.2, 0, 0);
      leg(ctx, 4.2, 0, 0);
      break;
    case "stepA":
      leg(ctx, -5.2, 1.6, 0.28);
      leg(ctx, 4.6, 0, -0.18);
      break;
    case "stepB":
      leg(ctx, -4.6, 0, 0.18);
      leg(ctx, 5.2, 1.6, -0.28);
      break;
    case "dangle":
      leg(ctx, -4.8, 1, 0.45);
      leg(ctx, 4.8, 2.4, -0.5);
      break;
  }
}

// ---- body and head ---------------------------------------------------------------------------

export function drawBody(ctx: Ctx): void {
  // nubby arms
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 10.2, -17.5, 3.2, 5.4, side * -0.35, 0, Math.PI * 2);
    finish(ctx, "#f2f2f2");
  }
  ctx.beginPath();
  ctx.moveTo(-9, -25.5);
  ctx.quadraticCurveTo(0, -27.5, 9, -25.5);
  ctx.quadraticCurveTo(11.2, -16, 10.4, -9.5);
  ctx.quadraticCurveTo(10, -7.2, 7, -7.2);
  ctx.lineTo(-7, -7.2);
  ctx.quadraticCurveTo(-10, -7.2, -10.4, -9.5);
  ctx.quadraticCurveTo(-11.2, -16, -9, -25.5);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#dcdcdc";
  ctx.fillRect(-12, -13.5, 24, 8);
  ctx.fillStyle = "#cfcfcf";
  ctx.beginPath();
  ctx.ellipse(0, -26.2, 4.2, 2.2, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = INK_CSS;
  ctx.lineJoin = "round";
  ctx.stroke();
}

export function drawHead(ctx: Ctx): void {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * (HEAD_R - 0.4), HEAD_Y + 1, 2.4, 2.9, 0, 0, Math.PI * 2);
    finish(ctx, "#ececec");
  }
  ctx.beginPath();
  ctx.arc(0, HEAD_Y, HEAD_R, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#e6e6e6";
  ctx.beginPath();
  ctx.arc(-3, HEAD_Y - 3.5, HEAD_R + 2, 0, Math.PI * 2);
  ctx.rect(-20, -60, 40, 40);
  ctx.fill("evenodd");
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, HEAD_Y, HEAD_R, 0, Math.PI * 2);
  ctx.lineWidth = LINE;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
}

// ---- faces -----------------------------------------------------------------------------------

export type FaceKind = "open" | "blink" | "happy" | "dizzy" | "wow" | "down";

function blush(ctx: Ctx, y: number): void {
  ctx.fillStyle = "rgba(255, 110, 150, 0.5)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 6, y, 1.9, 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dotEyes(ctx: Ctx, y: number, r: number): void {
  for (const side of [-1, 1]) {
    ctx.fillStyle = INK_CSS;
    ctx.beginPath();
    ctx.arc(side * 3.6, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(side * 3.6 + r * 0.35, y - r * 0.35, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
}

function stroke(ctx: Ctx, width: number): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = INK_CSS;
  ctx.lineCap = "round";
  ctx.stroke();
}

export function drawFace(ctx: Ctx, kind: FaceKind): void {
  const ey = HEAD_Y - 0.6;
  blush(ctx, HEAD_Y + 3);
  switch (kind) {
    case "open":
      dotEyes(ctx, ey, 1.55);
      ctx.beginPath();
      ctx.arc(0, HEAD_Y + 2.4, 2.4, 0.25, Math.PI - 0.25);
      stroke(ctx, 1.1);
      break;
    case "blink":
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 3.6 - 1.6, ey);
        ctx.lineTo(side * 3.6 + 1.6, ey);
        stroke(ctx, 1.1);
      }
      ctx.beginPath();
      ctx.arc(0, HEAD_Y + 2.4, 2.4, 0.25, Math.PI - 0.25);
      stroke(ctx, 1.1);
      break;
    case "happy":
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * 3.6, ey + 1, 1.8, Math.PI + 0.3, -0.3);
        stroke(ctx, 1.2);
      }
      ctx.beginPath();
      ctx.arc(0, HEAD_Y + 1.8, 3.2, 0.15, Math.PI - 0.15);
      ctx.closePath();
      ctx.fillStyle = INK_CSS;
      ctx.fill();
      break;
    case "dizzy":
      for (const side of [-1, 1]) {
        const cx = side * 3.6;
        ctx.beginPath();
        ctx.moveTo(cx - 1.5, ey - 1.5);
        ctx.lineTo(cx + 1.5, ey + 1.5);
        ctx.moveTo(cx + 1.5, ey - 1.5);
        ctx.lineTo(cx - 1.5, ey + 1.5);
        stroke(ctx, 1.1);
      }
      ctx.beginPath();
      ctx.moveTo(-2.6, HEAD_Y + 3.6);
      ctx.quadraticCurveTo(-1.3, HEAD_Y + 2.4, 0, HEAD_Y + 3.6);
      ctx.quadraticCurveTo(1.3, HEAD_Y + 4.8, 2.6, HEAD_Y + 3.6);
      stroke(ctx, 1);
      break;
    case "wow":
      dotEyes(ctx, ey - 0.3, 2.05);
      ctx.beginPath();
      ctx.ellipse(0, HEAD_Y + 3.6, 1.5, 1.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK_CSS;
      ctx.fill();
      break;
    case "down":
      dotEyes(ctx, ey + 1.6, 1.35);
      ctx.beginPath();
      ctx.arc(0, HEAD_Y + 3.6, 1.6, 0.3, Math.PI - 0.3);
      stroke(ctx, 1);
      break;
  }
}

// ---- hair and headwear ------------------------------------------------------------------------

const R = HEAD_R;
const HY = HEAD_Y;

function hairCap(ctx: Ctx, fringe: "even" | "side" | "spiky"): void {
  ctx.beginPath();
  ctx.moveTo(-R - 1.2, HY + 2.2);
  if (fringe === "spiky") {
    const spikes = 7;
    for (let i = 0; i <= spikes; i++) {
      const angle = Math.PI + (i / spikes) * Math.PI;
      const rr = i % 2 === 0 ? R + 1.2 : R + 5;
      ctx.lineTo(Math.cos(angle) * rr, HY + Math.sin(angle) * rr);
    }
  } else {
    ctx.arc(0, HY, R + 1.3, Math.PI * 1.02, Math.PI * 1.98);
  }
  ctx.lineTo(R + 1.2, HY + 2.2);
  if (fringe === "side") {
    ctx.quadraticCurveTo(R - 2, HY - 4.5, 2, HY - 5.2);
    ctx.quadraticCurveTo(-5, HY - 6.4, -R + 0.5, HY - 1);
  } else {
    ctx.quadraticCurveTo(R - 1.5, HY - 3.2, 5, HY - 4.2);
    ctx.quadraticCurveTo(2.5, HY - 2.4, 0, HY - 4.2);
    ctx.quadraticCurveTo(-2.5, HY - 2.6, -5, HY - 4.4);
    ctx.quadraticCurveTo(-R + 1.5, HY - 3.2, -R - 1.2, HY + 2.2);
  }
  ctx.closePath();
  finish(ctx, "#ffffff");
}

function longLocks(ctx: Ctx): void {
  for (const side of [-1, 1]) {
    roundRect(ctx, side > 0 ? R - 2.6 : -R - 2.6, HY - 2, 5.2, 13.5, 2.6);
    finish(ctx, "#e8e8e8");
  }
}

function curlyCloud(ctx: Ctx): void {
  ctx.beginPath();
  const puffs = 9;
  for (let i = 0; i <= puffs; i++) {
    const angle = Math.PI * 0.92 + (i / puffs) * Math.PI * 1.16;
    const cx = Math.cos(angle) * (R + 1.6);
    const cy = HY + Math.sin(angle) * (R + 1.6);
    ctx.moveTo(cx + 3.6, cy);
    ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
  }
  finish(ctx, "#ffffff", 1.2);
  ctx.beginPath();
  ctx.arc(0, HY - 1, R + 0.4, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function capHat(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(R - 0.5, HY - 3.2, 7.6, 2, -0.06, 0, Math.PI * 2);
  finish(ctx, "#d8d8d8");
  ctx.beginPath();
  ctx.arc(0, HY - 2.2, R + 1.4, Math.PI, Math.PI * 2);
  ctx.closePath();
  finish(ctx, "#ffffff");
  ctx.beginPath();
  ctx.arc(0, HY - R - 3.4, 1.4, 0, Math.PI * 2);
  finish(ctx, "#ffffff", 1);
}

function beanie(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(-R - 1.4, HY - 2);
  ctx.bezierCurveTo(-R - 1, HY - R - 7, R + 1, HY - R - 7, R + 1.4, HY - 2);
  ctx.closePath();
  finish(ctx, "#ffffff");
  roundRect(ctx, -R - 2, HY - 4.6, 2 * R + 4, 4.6, 2.2);
  finish(ctx, "#dedede");
  ctx.beginPath();
  ctx.arc(0, HY - R - 6.2, 2.6, 0, Math.PI * 2);
  finish(ctx, "#ffffff", 1.1);
}

function headscarf(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(0, HY + 1.6, R + 2.6, R + 5.2, 0, 0, Math.PI * 2);
  ctx.moveTo(0.4 + 7.3, HY + 1);
  ctx.arc(0.4, HY + 1, 7.3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill("evenodd");
  ctx.lineWidth = LINE;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
}

function turban(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(-R - 1.8, HY - 1.2);
  ctx.bezierCurveTo(-R - 3, HY - R - 9, R + 3, HY - R - 9, R + 1.8, HY - 1.2);
  ctx.quadraticCurveTo(0, HY - 5.5, -R - 1.8, HY - 1.2);
  ctx.closePath();
  finish(ctx, "#ffffff");
  ctx.beginPath();
  ctx.moveTo(-R + 0.5, HY - 6);
  ctx.quadraticCurveTo(0, HY - 13, R - 1, HY - 9.5);
  ctx.moveTo(-R + 2.5, HY - 10.5);
  ctx.quadraticCurveTo(1, HY - 17, R - 3, HY - 14);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(30, 21, 56, 0.45)";
  ctx.stroke();
}

/** Draws a hair style or headwear; returns false for styles with nothing to draw (bald). */
export function drawHair(ctx: Ctx, style: HairStyle): boolean {
  switch (style) {
    case "short":
      hairCap(ctx, "even");
      return true;
    case "spiky":
      hairCap(ctx, "spiky");
      return true;
    case "sidepart":
      hairCap(ctx, "side");
      return true;
    case "long":
      longLocks(ctx);
      hairCap(ctx, "even");
      return true;
    case "bun":
      ctx.beginPath();
      ctx.arc(0, HY - R - 2.6, 4.4, 0, Math.PI * 2);
      finish(ctx, "#f0f0f0");
      hairCap(ctx, "even");
      return true;
    case "ponytail":
      ctx.beginPath();
      ctx.ellipse(-R - 2.4, HY + 3, 3.2, 6.6, 0.35, 0, Math.PI * 2);
      finish(ctx, "#ececec");
      hairCap(ctx, "side");
      return true;
    case "curly":
      curlyCloud(ctx);
      return true;
    case "cap":
      capHat(ctx);
      return true;
    case "beanie":
      beanie(ctx);
      return true;
    case "headscarf":
      headscarf(ctx);
      return true;
    case "turban":
      turban(ctx);
      return true;
    case "bald":
      return false;
  }
}

// ---- accessories, props, shadow, low-detail ---------------------------------------------------

export function drawAccessory(ctx: Ctx, kind: "glasses" | "sunglasses" | "headphones"): void {
  const ey = HY - 0.6;
  if (kind === "headphones") {
    ctx.beginPath();
    ctx.arc(0, HY, R + 2.4, Math.PI * 1.08, Math.PI * 1.92);
    stroke(ctx, 2.2);
    for (const side of [-1, 1]) {
      roundRect(ctx, side * (R + 1.2) - 2.4, HY - 2.6, 4.8, 6.4, 2);
      finish(ctx, "#ff2e88", 1.1);
    }
    return;
  }
  for (const side of [-1, 1]) {
    if (kind === "glasses") {
      ctx.beginPath();
      ctx.arc(side * 3.7, ey, 2.7, 0, Math.PI * 2);
      stroke(ctx, 0.9);
    } else {
      roundRect(ctx, side * 3.7 - 3, ey - 2.2, 6, 4.2, 1.8);
      ctx.fillStyle = INK_CSS;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(side * 3.7 - 1.8, ey - 1.4, 1.4, 0.9);
    }
  }
  ctx.beginPath();
  ctx.moveTo(-1, ey);
  ctx.lineTo(1, ey);
  stroke(ctx, 0.9);
}

export function drawPhone(ctx: Ctx): void {
  roundRect(ctx, 4.2, -28.5, 4.8, 7.6, 1.2);
  finish(ctx, INK_CSS, 0.8);
  ctx.fillStyle = "#3fe0d0";
  ctx.fillRect(5, -27.6, 3.2, 5.4);
}

export function drawShadow(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 3.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
}

/** One-piece far-zoom bean: shirt-coloured body and skin head, no face details. */
export function drawLodBean(ctx: Ctx, shirt: string, skin: string): void {
  roundRect(ctx, -6, -9, 4.6, 9, 2);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  roundRect(ctx, 1.4, -9, 4.6, 9, 2);
  ctx.fill();
  roundRect(ctx, -10.5, -26, 21, 19, 8);
  finish(ctx, shirt, 2);
  ctx.beginPath();
  ctx.arc(0, HY, R + 0.5, 0, Math.PI * 2);
  finish(ctx, skin, 2);
}
