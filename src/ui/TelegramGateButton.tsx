import { useActions } from "@/app/context";
import { browserSessionStore, rememberTelegramReturn } from "@/app/telegramReturn";
import type { TelegramReturnSurface } from "@/app/telegramReturn";
import { Icon } from "@/ui/Icon";

export function TelegramGateButton({
  personId,
  surface,
  onBeforeOpen,
}: {
  readonly personId: string;
  readonly surface: TelegramReturnSurface;
  readonly onBeforeOpen?: () => void;
}) {
  const actions = useActions();
  return (
    <button
      type="button"
      className="btn btn--primary"
      onClick={() => {
        rememberTelegramReturn(browserSessionStore(), { personId, surface });
        onBeforeOpen?.();
        actions.openOverlay("you");
      }}
    >
      <Icon id="speech_balloon" size={22} />
      Verify your Telegram to message them
    </button>
  );
}
