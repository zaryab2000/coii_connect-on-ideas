import { useEffect, useRef } from "react";

import { widgetAttributes } from "@/backend/telegram";

/**
 * Telegram's own Login Widget (script + iframe); it sends you back to /telegram when done.
 * Used to verify your username, and to claim an invited bean with it.
 */
export function TelegramWidget() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = box.current;
    if (!host) return undefined;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    for (const [name, value] of Object.entries(widgetAttributes(location.origin))) {
      script.setAttribute(name, value);
    }
    host.append(script);
    return () => host.replaceChildren();
  }, []);
  return <div ref={box} className="telegram-widget" />;
}
