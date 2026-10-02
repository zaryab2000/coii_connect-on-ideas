import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { useActions, useApp } from "@/app/context";
import type { WaveResult } from "@/app/meet";
import type { Person } from "@/data/types";
import { useMediaQuery } from "@/ui/hooks";
import { waveToast } from "@/ui/meet";

/** The current time, refreshed every `intervalMs` (for countdowns). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Reduced motion from the OS setting or the app state. */
export function useReducedMotion(): boolean {
  const fromState = useApp((s) => s.reducedMotion);
  const fromOs = useMediaQuery("(prefers-reduced-motion: reduce)");
  return fromState || fromOs;
}

/** Waves at someone and tells you how it went (daily limit, your very first wave…). */
export function useWave(): (person: Person) => WaveResult {
  const actions = useActions();
  const firstWave = useApp((s) => (s.meet?.waved.length ?? 0) === 0);
  return useCallback(
    (person: Person) => {
      const result = actions.wave(person.id);
      const toast = waveToast(result, person.name, firstWave);
      if (toast) actions.pushToast(toast.text, toast.icon, toast.tone);
      return result;
    },
    [actions, firstWave],
  );
}

/** Opens the "Chai's on!" card for a chai from anywhere in the UI (the chai list, a profile). */
export const OpenChaiContext = createContext<((personId: string) => void) | null>(null);

export function useOpenChai(): (personId: string) => void {
  const open = useContext(OpenChaiContext);
  if (!open) throw new Error("useOpenChai must be used inside <OpenChaiContext.Provider>");
  return open;
}
