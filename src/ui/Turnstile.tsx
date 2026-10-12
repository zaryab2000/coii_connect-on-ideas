import { useEffect, useEffectEvent, useRef, useState } from "react";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once, only when a join form first needs it (PRD §15). */
function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile loaded without its API")),
    );
    script.addEventListener("error", () => reject(new Error("Couldn't load the Turnstile script")));
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

interface TurnstileProps {
  readonly siteKey: string;
  /** A fresh token, or null when it expired or failed. Tokens are single-use. */
  readonly onToken: (token: string | null) => void;
}

/**
 * Cloudflare's "are you human" check for joining; usually passes without a click. Remount it
 * (change its `key`) for a fresh token after one was used up.
 */
export function Turnstile({ siteKey, onToken }: TurnstileProps) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const emit = useEffectEvent((token: string | null) => onToken(token));
  const fail = useEffectEvent(() => {
    onToken(null);
    setFailed(true);
  });

  useEffect(() => {
    let widget: string | null = null;
    let api: TurnstileApi | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !box.current) return;
        api = loaded;
        widget = loaded.render(box.current, {
          sitekey: siteKey,
          callback: (token: string) => emit(token),
          "expired-callback": () => emit(null),
          "error-callback": () => fail(),
        });
      })
      .catch(() => {
        if (!cancelled) fail();
      });
    return () => {
      cancelled = true;
      if (api && widget) api.remove(widget);
    };
  }, [siteKey]);

  return (
    <div className="turnstile">
      <div ref={box} />
      {failed ? (
        <p className="q-card__error" role="alert">
          The robot check couldn't load. Check your connection, then reload the page.
        </p>
      ) : null}
    </div>
  );
}
