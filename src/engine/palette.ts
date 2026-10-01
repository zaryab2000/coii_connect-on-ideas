/** "Rangoli Pop" palette shared by canvas art. CSS mirrors these in `@/ui/tokens.css`. */
export const INK = 0x1e1538;
export const INK_CSS = "#1e1538";
export const FLOOR = 0xece4ff;
export const FLOOR_LINE = 0xdfd3fb;
export const MARIGOLD = 0xffb31a;
export const MARIGOLD_DEEP = 0xff8c1a;
export const RANI = 0xff2e88;
export const PEACOCK = 0x0fa3a3;
export const WHITE = 0xffffff;
export const LEAF = 0x2f9e5b;

export function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Particles store colour as BGR with alpha in the top byte. */
export function bgr(rgb: number): number {
  return ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
}

export function particleColor(rgb: number, alpha: number): number {
  return bgr(rgb) + (((alpha * 255) | 0) << 24);
}
