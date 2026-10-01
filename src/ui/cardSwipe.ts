import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import { swipeDecision, swipeThreshold } from "@/ui/meet";
import type { SwipeVerdict } from "@/ui/meet";

/** Movement before a press becomes a horizontal drag (or is handed to vertical scrolling). */
const SLOP = 10;

interface SwipeDrag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  samples: { x: number; t: number }[];
  dragging: boolean;
  dx: number;
}

interface SwipeOptions {
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  readonly onSwipe: (verdict: "wave" | "skip") => void;
}

function releaseVelocity(samples: readonly { x: number; t: number }[]): number {
  const last = samples.at(-1);
  const first = samples.find((s) => last !== undefined && last.t - s.t <= 100);
  if (!last || !first || last.t === first.t) return 0;
  return (last.x - first.x) / (last.t - first.t);
}

/** Moves the card with the finger and labels which way it would commit. */
function follow(el: HTMLElement, dx: number): void {
  el.style.transform = `translate3d(${dx}px, 0, 0) rotate(${dx / 22}deg)`;
  const verdict = Math.abs(dx) >= swipeThreshold(el.offsetWidth) ? (dx > 0 ? "wave" : "skip") : "";
  if (el.dataset["swipe"] !== verdict) el.dataset["swipe"] = verdict;
}

/** Springs the card home, or throws it off to the left for a skip. */
function settle(el: HTMLElement, verdict: SwipeVerdict, reducedMotion: boolean): void {
  delete el.dataset["swipe"];
  el.style.userSelect = "";
  if (verdict === "skip") {
    el.style.transition = "transform 240ms var(--ease-out), opacity 240ms var(--ease-out)";
    el.style.transform = reducedMotion ? "" : "translate3d(-115%, 0, 0) rotate(-12deg)";
    el.style.opacity = "0";
    return;
  }
  el.style.transition = reducedMotion
    ? "transform 160ms var(--ease-out)"
    : "transform 500ms var(--spring-settle)";
  el.style.transform = "";
}

/**
 * Swipe a card right to wave or left to skip. Vertical moves are left to the scroll container
 * (the card sets `touch-action: pan-y`); buttons on the card do the same things.
 */
export function useCardSwipe(ref: RefObject<HTMLElement | null>, options: SwipeOptions) {
  const drag = useRef<SwipeDrag | null>(null);
  const justSwiped = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!options.enabled || drag.current || e.button !== 0 || !e.isPrimary) return;
    justSwiped.current = false;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      samples: [{ x: e.clientX, t: e.timeStamp }],
      dragging: false,
      dx: 0,
    };
  };

  const startDrag = (el: HTMLElement, state: SwipeDrag, e: ReactPointerEvent<HTMLElement>) => {
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) drag.current = null;
    if (!drag.current || Math.abs(dx) < SLOP) return;
    state.dragging = true;
    el.setPointerCapture(e.pointerId);
    el.style.transition = "none";
    el.style.userSelect = "none";
    window.getSelection()?.removeAllRanges();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.pointerId !== e.pointerId) return;
    if (!state.dragging) startDrag(el, state, e);
    if (!state.dragging) return;
    state.dx = e.clientX - state.startX;
    follow(el, state.dx);
    state.samples.push({ x: e.clientX, t: e.timeStamp });
    if (state.samples.length > 8) state.samples.shift();
  };

  const finish = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean): void => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!state.dragging) return;
    const width = el.offsetWidth;
    const velocity = releaseVelocity(state.samples);
    const verdict = cancelled ? null : swipeDecision({ dx: state.dx, velocity, width });
    settle(el, verdict, options.reducedMotion);
    justSwiped.current = true;
    if (verdict) options.onSwipe(verdict);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
    /** A drag that ended on a button must not also press it. */
    onClickCapture: (e: { stopPropagation(): void; preventDefault(): void }) => {
      if (!justSwiped.current) return;
      justSwiped.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}
