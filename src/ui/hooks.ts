import { useEffect, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export interface Presence<T> {
  readonly key: number;
  readonly value: T;
  readonly leaving: boolean;
}

/**
 * Keeps a value mounted for `exitMs` after it is replaced or cleared, so it can animate out.
 * A replacement gets a fresh key (it mounts and animates in separately) unless `isSame` says it
 * is the same thing with new details, in which case it updates in place.
 */
export function usePresence<T>(
  value: T | null,
  exitMs: number,
  isSame: (a: T, b: T) => boolean = Object.is,
): readonly Presence<T>[] {
  const [state, setState] = useState<{ items: readonly Presence<T>[]; next: number }>(() => ({
    items: value === null ? [] : [{ key: 0, value, leaving: false }],
    next: 1,
  }));
  const [tracked, setTracked] = useState(value);
  if (tracked !== value) {
    setTracked(value);
    const live = state.items.find((item) => !item.leaving);
    if (value !== null && live && isSame(live.value, value)) {
      const items = state.items.map((item) => (item === live ? { ...item, value } : item));
      setState({ items, next: state.next });
    } else {
      const kept = state.items.map((item) => (item.leaving ? item : { ...item, leaving: true }));
      const items = value === null ? kept : [...kept, { key: state.next, value, leaving: false }];
      setState({ items, next: state.next + 1 });
    }
  }
  const leavingKeys = state.items
    .filter((item) => item.leaving)
    .map((item) => item.key)
    .join(",");
  useEffect(() => {
    if (leavingKeys === "") return undefined;
    const timer = window.setTimeout(
      () => setState((s) => ({ ...s, items: s.items.filter((item) => !item.leaving) })),
      exitMs,
    );
    return () => window.clearTimeout(timer);
  }, [leavingKeys, exitMs]);
  return state.items;
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Writes an element's border-box height to a CSS custom property on `target`. */
export function useHeightVar(
  source: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  name: string,
): void {
  useEffect(() => {
    const el = source.current;
    const host = target.current;
    if (!el || !host) return undefined;
    const observer = new ResizeObserver(() => {
      host.style.setProperty(name, `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      host.style.removeProperty(name);
    };
  }, [source, target, name]);
}
