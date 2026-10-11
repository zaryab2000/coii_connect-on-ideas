import "@/ui/invite.css";
import { useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { joinUrl } from "@/app/joinLink";
import { TOPICS } from "@/data/topics";
import type { TopicId } from "@/data/types";
import { Icon } from "@/ui/Icon";
import { CloseButton, Overlay } from "@/ui/Overlay";
import {
  copyText,
  linkedInPostUrl,
  telegramPostUrl,
  whatsAppPostUrl,
  xPostUrl,
} from "@/ui/shareLinks";

/** The post text that goes with a join link. */
export const INVITE_TEXT =
  "Join me on coii, the live map of who's into what at Devcon 8, Mumbai. Put your bean on it and let's meet:";

const SITES = [
  { name: "X", url: xPostUrl },
  { name: "LinkedIn", url: linkedInPostUrl },
  { name: "Telegram", url: telegramPostUrl },
  { name: "WhatsApp", url: whatsAppPostUrl },
] as const;

function BoothPicker({
  topic,
  onChange,
}: {
  readonly topic: TopicId | null;
  readonly onChange: (topic: TopicId | null) => void;
}) {
  const id = useId();
  return (
    <div className="invite__booth">
      <label htmlFor={id}>Start them at a booth</label>
      <select
        id={id}
        value={topic ?? ""}
        onChange={(e) => onChange((e.target.value || null) as TopicId | null)}
      >
        <option value="">Any booth</option>
        {TOPICS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function openTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

function ShareRow({ link }: { readonly link: string }) {
  const native = typeof navigator.share === "function";
  return (
    <div className="share-actions">
      {native ? (
        <button
          type="button"
          className="btn btn--wave btn--big"
          onClick={() => {
            navigator.share({ title: "Join coii", text: INVITE_TEXT, url: link }).catch(() => {});
          }}
        >
          <Icon id="waving_hand" size={24} />
          Share the link
        </button>
      ) : null}
      <div className="share-actions__row">
        {SITES.map((site) => (
          <button
            key={site.name}
            type="button"
            className="btn btn--secondary"
            onClick={() => openTab(site.url(INVITE_TEXT, link))}
          >
            Share on {site.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A link anyone can pass around: opening it lands straight on the join form, over the live
 * venue. Picking a booth makes the link preselect it.
 */
export function InviteOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const actions = useActions();
  const titleId = useId();
  const linkId = useId();
  const preset = useApp((s) => s.inviteTopic);
  const [topic, setTopic] = useState<TopicId | null>(preset);
  const link = joinUrl(topic);
  const copy = (): void => {
    void copyText(link).then((ok) =>
      actions.pushToast(
        ok ? "Link copied. Paste it anywhere." : "Couldn't copy: select the link and copy it.",
        "waving_hand",
        ok ? "success" : "info",
      ),
    );
  };
  return (
    <Overlay kind="invite" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <div className="share invite">
        <header className="share__head">
          <h2 id={titleId} className="share__title">
            Invite people to coii
          </h2>
          <p className="share__hint">Whoever opens this link lands right on the join form.</p>
          <CloseButton onClose={onClose} />
        </header>
        <div className="invite__link">
          <label htmlFor={linkId} className="visually-hidden">
            Join link
          </label>
          <input id={linkId} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn--primary" onClick={copy}>
            Copy link
          </button>
        </div>
        <BoothPicker topic={topic} onChange={setTopic} />
        <ShareRow link={link} />
        <p className="share__caption">“{INVITE_TEXT}” + link</p>
      </div>
    </Overlay>
  );
}
