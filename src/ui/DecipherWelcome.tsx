import "@/ui/decipher.css";
import { useEffect, useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { DECIPHER } from "@/content/decipher";
import { DecipherLinks } from "@/ui/DecipherLinks";
import { Glyph } from "@/ui/Icon";

/** Long enough for the "You're in!" toast to clear and your bean to start walking in first. */
export const WELCOME_DELAY_MS = 4000;

/**
 * "Built by Decipher Club": a small card in the toast corner, once, after your first join or a
 * claim (docs-internal/prd/decipher-club-plugs.md §3.1). Waits for any overlay to close; ✕ or
 * Escape dismisses it.
 */
export function DecipherWelcome() {
  const actions = useActions();
  const due = useApp((s) => s.decipherWelcome && s.overlay === "none");
  const [ready, setReady] = useState(false);
  const headingId = useId();

  useEffect(() => {
    if (!due) return undefined;
    const timer = window.setTimeout(() => setReady(true), WELCOME_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [due]);

  const shown = due && ready;
  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") actions.dismissWelcome();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, actions]);

  if (!shown) return null;
  return (
    <aside className="decipher-welcome" aria-labelledby={headingId}>
      <button
        type="button"
        className="nav-btn nav-btn--close decipher-welcome__close"
        onClick={() => actions.dismissWelcome()}
      >
        <Glyph name="close" size={16} />
        <span className="visually-hidden">{DECIPHER.dismiss}</span>
      </button>
      <h2 id={headingId} className="decipher-welcome__heading">
        {DECIPHER.heading}
      </h2>
      <p className="decipher-welcome__line">{DECIPHER.line}</p>
      <div className="decipher-welcome__links">
        <DecipherLinks spot="welcome" primary />
      </div>
    </aside>
  );
}
