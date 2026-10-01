import "@/ui/toast.css";
import { useEffect } from "react";

import { useActions, useApp } from "@/app/context";
import { usePresence } from "@/ui/hooks";
import { Icon } from "@/ui/Icon";

const VISIBLE_MS = 3500;
const EXIT_MS = 220;

/** One toast at a time, oldest first; each dismisses itself after a few seconds or on tap. */
export function Toasts() {
  const actions = useActions();
  const current = useApp((s) => s.toasts[0] ?? null);
  const items = usePresence(current, EXIT_MS);

  useEffect(() => {
    if (!current) return undefined;
    const timer = window.setTimeout(() => actions.dismissToast(current.id), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [current, actions]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map(({ key, value, leaving }) => (
        <button
          key={key}
          type="button"
          className="toast"
          data-tone={value.tone}
          data-leaving={leaving || undefined}
          tabIndex={-1}
          onClick={() => actions.dismissToast(value.id)}
        >
          {value.icon ? (
            <span className="toast__icon">
              <Icon id={value.icon} size={24} />
            </span>
          ) : null}
          <span className="toast__text">{value.text}</span>
        </button>
      ))}
    </div>
  );
}
