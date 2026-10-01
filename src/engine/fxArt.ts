import { INK_CSS } from "@/engine/palette";

/** Canvas2D drawings for effects, centred on (0, 0) in world units. */
type Ctx = CanvasRenderingContext2D;

function outline(ctx: Ctx, width: number): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = INK_CSS;
  ctx.lineJoin = "round";
  ctx.stroke();
}

export function drawDust(ctx: Ctx): void {
  ctx.beginPath();
  for (const [x, y, r] of [
    [-3.5, 1, 3.6],
    [3, 0.5, 4],
    [0, -2.2, 4.2],
  ] as const) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.globalAlpha = 0.45;
  outline(ctx, 1);
  ctx.globalAlpha = 1;
}

export function drawStar(ctx: Ctx): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 5 : 2.2;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffc93c";
  ctx.fill();
  outline(ctx, 1);
}

export function drawConfetti(ctx: Ctx): void {
  ctx.beginPath();
  ctx.roundRect(-2.2, -1.3, 4.4, 2.6, 0.8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

export function drawRing(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

export function drawBang(ctx: Ctx): void {
  ctx.beginPath();
  ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffb31a";
  ctx.fill();
  outline(ctx, 1.2);
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  ctx.roundRect(-0.9, -3.6, 1.8, 4.4, 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 2.6, 1, 0, Math.PI * 2);
  ctx.fill();
}

export function drawYouTag(ctx: Ctx, font: string): void {
  ctx.beginPath();
  ctx.roundRect(-12, -6.5, 24, 11, 5.5);
  ctx.moveTo(-3, 4.5);
  ctx.lineTo(0, 8.5);
  ctx.lineTo(3, 4.5);
  ctx.fillStyle = "#ff2e88";
  ctx.fill();
  outline(ctx, 1.2);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 8px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("YOU", 0, -0.6);
}

export function drawBubble(ctx: Ctx): void {
  ctx.beginPath();
  ctx.roundRect(-8.5, -9, 17, 13.5, 5);
  ctx.moveTo(-4, 4.5);
  ctx.lineTo(-6, 8.5);
  ctx.lineTo(0, 4.5);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  outline(ctx, 1.1);
}
