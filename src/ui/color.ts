const INK = "#1e1538";
const PAPER = "#ffffff";

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio between two `#rrggbb` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Text colour for a `#rrggbb` fill: white when it meets WCAG AA (4.5:1) for small text,
 * otherwise ink, which passes on every light or mid-tone topic colour.
 */
export function textOn(background: string): string {
  return contrastRatio(background, PAPER) >= 4.5 ? PAPER : INK;
}
