import { DECIPHER, decipherUrl, telegramInvite } from "@/content/decipher";
import type { DecipherSpot } from "@/content/decipher";
import { Icon } from "@/ui/Icon";

/** "Subscribe" (the website, tagged with this spot) and "Join our Telegram" once there's an invite. */
export function DecipherLinks({
  spot,
  primary,
}: {
  readonly spot: DecipherSpot;
  /** Subscribe as the main button (the welcome card); About keeps its own Join as the main one. */
  readonly primary: boolean;
}) {
  const telegram = telegramInvite();
  return (
    <>
      <a
        className={`btn ${primary ? "btn--primary" : "btn--secondary"}`}
        href={decipherUrl(spot)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon id="page_facing_up" size={22} />
        {DECIPHER.subscribe}
      </a>
      {telegram ? (
        <a className="btn btn--secondary" href={telegram} target="_blank" rel="noopener noreferrer">
          <Icon id="speech_balloon" size={22} />
          {DECIPHER.telegram}
        </a>
      ) : null}
    </>
  );
}
