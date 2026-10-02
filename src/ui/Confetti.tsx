import "@/ui/confetti.css";
import { useEffect } from "react";
import type { CSSProperties } from "react";

const COLORS = ["var(--marigold)", "var(--rani)", "var(--peacock)", "var(--leaf)", "var(--paper)"];
const GOLDEN_ANGLE = 2.399_963;
const BURST_MS = 1100;

interface Piece {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly spin: number;
  readonly color: string;
  readonly round: boolean;
  readonly delay: number;
}

/** Deterministic pieces spread around a circle, biased upwards so they arc and fall. */
function pieces(count: number, spread: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * GOLDEN_ANGLE;
    const distance = spread * (0.55 + ((i * 37) % 45) / 100);
    return {
      id: `piece-${i}`,
      x: Math.round(Math.cos(angle) * distance),
      y: Math.round(Math.sin(angle) * distance * 0.7 - spread * 0.35),
      spin: ((i * 97) % 540) - 270,
      color: COLORS[i % COLORS.length] ?? "var(--marigold)",
      round: i % 3 === 0,
      delay: (i % 4) * 25,
    };
  });
}

/**
 * A one-off burst of paper confetti from the centre of the nearest positioned parent. Decorative
 * (hidden from assistive tech); callers skip it under reduced motion.
 */
export function Confetti({
  count = 18,
  spread = 120,
  onDone,
}: {
  readonly count?: number;
  readonly spread?: number;
  readonly onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, BURST_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces(count, spread).map((piece) => (
        <span
          key={piece.id}
          className="confetti__piece"
          data-round={piece.round || undefined}
          style={
            {
              "--x": `${piece.x}px`,
              "--y": `${piece.y}px`,
              "--spin": `${piece.spin}deg`,
              "--color": piece.color,
              animationDelay: `${piece.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
