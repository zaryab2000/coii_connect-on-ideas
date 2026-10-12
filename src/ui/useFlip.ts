import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Slides rows to their new places when ranks change (FLIP), unless motion is reduced. Runs
 * after every render: it is a cheap measure of a few rows and only animates rows that moved.
 */
export function useFlip(list: RefObject<HTMLOListElement | null>, reduced: boolean): void {
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const next = new Map<string, number>();
    for (const child of el.querySelectorAll<HTMLElement>(":scope > [data-id]")) {
      const id = child.dataset["id"] ?? "";
      const top = child.offsetTop;
      next.set(id, top);
      const before = tops.current.get(id);
      if (reduced || before === undefined || before === top) continue;
      child.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
        duration: 420,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    }
    tops.current = next;
  });
}
