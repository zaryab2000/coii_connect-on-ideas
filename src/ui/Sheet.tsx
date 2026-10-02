import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";

import { rubberBand, settleSheet } from "@/ui/sheetPhysics";

export type SheetSize = "auto" | "tall" | "peek";

/** Share of the viewport a peeking sheet shows before it is dragged up. */
const PEEK_SHARE = 0.46;
const DRAG_SLOP = 4;
const INTERACTIVE = "button:not(.sheet__handle), a, input, select, textarea, label";

interface DragState {
  readonly pointerId: number;
  readonly startY: number;
  readonly base: number;
  samples: { y: number; t: number }[];
  moved: boolean;
}

interface DragOptions {
  readonly peekOffset: number | null;
  readonly expanded: boolean;
  readonly setExpanded: (expanded: boolean) => void;
  readonly onClose: () => void;
}

function currentOffset(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform;
  return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
}

function releaseVelocity(samples: readonly { y: number; t: number }[]): number {
  const last = samples.at(-1);
  const first = samples.find((s) => last !== undefined && last.t - s.t <= 100);
  if (!last || !first || last.t === first.t) return 0;
  return (last.y - first.y) / (last.t - first.t);
}

/** Where an interrupted drag returns to: wherever the sheet was resting before. */
function restingStop(options: DragOptions): "full" | "peek" {
  return options.expanded || options.peekOffset === null ? "full" : "peek";
}

/** Swipe-down to dismiss (and up/down between detents) on the handle and `[data-sheet-grab]`. */
function useSheetDrag(ref: RefObject<HTMLElement | null>, options: DragOptions) {
  const drag = useRef<DragState | null>(null);
  const lastDragEnd = useRef(Number.NEGATIVE_INFINITY);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    const el = ref.current;
    const target = e.target as Element;
    if (!el || drag.current || e.button !== 0) return;
    if (!target.closest("[data-sheet-grab], .sheet__handle") || target.closest(INTERACTIVE)) return;
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      base: currentOffset(el),
      samples: [{ y: e.clientY, t: e.timeStamp }],
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.pointerId !== e.pointerId) return;
    const dy = e.clientY - state.startY;
    if (!state.moved) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      state.moved = true;
      el.setPointerCapture(e.pointerId);
      el.style.transition = "none";
    }
    const y = state.base + dy;
    el.style.transform = `translate3d(0, ${y < 0 ? rubberBand(-y) : y}px, 0)`;
    state.samples.push({ y: e.clientY, t: e.timeStamp });
    if (state.samples.length > 8) state.samples.shift();
  };

  const finish = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean): void => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!state.moved) return;
    lastDragEnd.current = e.timeStamp;
    el.style.transition = "";
    const settled = settleSheet({
      y: state.base + e.clientY - state.startY,
      velocity: releaseVelocity(state.samples),
      height: el.offsetHeight,
      peekOffset: options.peekOffset,
    });
    const stop = cancelled ? restingStop(options) : settled;
    if (stop === "close") {
      el.style.transform = "translate3d(0, 100%, 0)";
      options.onClose();
      return;
    }
    el.style.transform = "";
    options.setExpanded(stop === "full");
  };

  const onHandleClick = (e: { timeStamp: number }): void => {
    if (e.timeStamp - lastDragEnd.current < 300) return;
    options.setExpanded(!options.expanded);
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => finish(e, false),
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => finish(e, true),
    },
    onHandleClick,
  };
}

/** Moves focus into the sheet on open and hands it back on close if it is still ours. */
function useSheetFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const previous = document.activeElement;
    el.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      const ours = active === null || active === document.body || el.contains(active);
      if (ours && previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref]);
}

interface SheetProps {
  readonly label: string;
  readonly size: SheetSize;
  /** Modal sheets dim the map and close on a backdrop tap. */
  readonly modal: boolean;
  readonly leaving: boolean;
  readonly onClose: () => void;
  /** Reports the visible height (px) so the map and toasts can make room. */
  readonly onVisibleHeight: (height: number) => void;
  readonly children: ReactNode;
}

/**
 * Phone bottom sheet that sits above the tab bar. Drag the handle or header down to dismiss;
 * a "peek" sheet opens half-way and can be dragged (or its handle tapped) to expand.
 */
export function Sheet({
  label,
  size,
  modal,
  leaving,
  onClose,
  onVisibleHeight,
  children,
}: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [peekOffset, setPeekOffset] = useState(0);
  const isPeek = size === "peek";
  const { handlers, onHandleClick } = useSheetDrag(ref, {
    peekOffset: isPeek ? peekOffset : null,
    expanded,
    setExpanded,
    onClose,
  });
  useSheetFocus(ref);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || leaving) return undefined;
    const measure = (): void => {
      const height = el.offsetHeight;
      const offset = isPeek ? Math.max(0, height - Math.round(window.innerHeight * PEEK_SHARE)) : 0;
      setPeekOffset(offset);
      onVisibleHeight(isPeek && !expanded ? height - offset : height);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isPeek, expanded, leaving, onVisibleHeight]);

  return (
    <div className="sheet-layer" data-leaving={leaving || undefined} inert={leaving}>
      {modal ? <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" /> : null}
      <section
        ref={ref}
        className="sheet"
        data-size={size}
        data-expanded={(isPeek && expanded) || undefined}
        style={{ "--peek-offset": `${peekOffset}px` } as CSSProperties}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        {...handlers}
      >
        {isPeek ? (
          <button
            type="button"
            className="sheet__handle"
            aria-label={expanded ? "Show less" : "Show more"}
            aria-expanded={expanded}
            onClick={onHandleClick}
          />
        ) : (
          <span className="sheet__handle" aria-hidden="true" />
        )}
        {children}
      </section>
    </div>
  );
}
