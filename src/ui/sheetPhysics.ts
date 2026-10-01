export type SheetStop = "full" | "peek" | "close";

export interface SettleInput {
  /** Current downward offset in px (0 = fully open). */
  readonly y: number;
  /** Release velocity in px/ms, positive = downward. */
  readonly velocity: number;
  /** Sheet height in px; offsetting by it hides the sheet. */
  readonly height: number;
  /** Offset of the peek detent, or null when the sheet has none. */
  readonly peekOffset: number | null;
}

/** How far ahead a flick carries the sheet, in ms of travel at release velocity. */
const PROJECT_MS = 220;
/** Fraction of the gap between the lowest open stop and closed that must be crossed to close. */
const CLOSE_FRACTION = 0.3;

/**
 * Where a released sheet should settle: project the release velocity forward, close when that
 * passes 30% of the way from the lowest open stop to closed, otherwise snap to the nearest
 * open stop.
 */
export function settleSheet({ y, velocity, height, peekOffset }: SettleInput): SheetStop {
  const projected = y + velocity * PROJECT_MS;
  const lowest = peekOffset ?? 0;
  if (projected > lowest + (height - lowest) * CLOSE_FRACTION) return "close";
  if (peekOffset === null) return "full";
  return Math.abs(projected) <= Math.abs(projected - peekOffset) ? "full" : "peek";
}

/** Rubber-band resistance when dragging past the fully open position. */
export function rubberBand(overshoot: number): number {
  return -Math.sqrt(Math.max(0, overshoot)) * 4;
}
