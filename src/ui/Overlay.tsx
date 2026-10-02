import "@/ui/overlay.css";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject, SyntheticEvent } from "react";

import { Glyph } from "@/ui/Icon";

/** How long a closing overlay takes to fade out. */
export const OVERLAY_EXIT_MS = 200;

/** Opens a dialog as a modal on mount (focus moves in) and closes it on unmount (focus returns). */
export function useModal(): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);
  return ref;
}

/** Esc, the browser's own dialog cancel, and a click on the backdrop all close a modal. */
export function modalCloseHandlers(onClose: () => void) {
  return {
    onKeyDown(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    },
    onCancel(e: SyntheticEvent): void {
      e.preventDefault();
      onClose();
    },
    onClick(e: MouseEvent): void {
      if (e.target === e.currentTarget) onClose();
    },
  };
}

export function CloseButton({ onClose }: { readonly onClose: () => void }) {
  return (
    <button type="button" className="nav-btn nav-btn--close overlay__close" onClick={onClose}>
      <Glyph name="close" size={18} />
      <span className="visually-hidden">Close</span>
    </button>
  );
}

interface OverlayProps {
  /** Picks the card size: About reads like a page, You is a roomy two-column studio. */
  readonly kind: "about" | "you" | "board";
  readonly labelledBy: string;
  readonly leaving: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * A big card centred over the whole app. The backdrop only tints the venue, so the crowd keeps
 * moving behind it; tapping the backdrop or pressing Esc closes it.
 */
export function Overlay({ kind, labelledBy, leaving, onClose, children }: OverlayProps) {
  const ref = useModal();
  return (
    <dialog
      ref={ref}
      className={`overlay overlay--${kind}`}
      aria-labelledby={labelledBy}
      data-leaving={leaving || undefined}
      inert={leaving}
      tabIndex={-1}
      {...modalCloseHandlers(onClose)}
    >
      <div className="overlay__card">{children}</div>
    </dialog>
  );
}
