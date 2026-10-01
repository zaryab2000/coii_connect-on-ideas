import "@/ui/profile.css";
import { useId } from "react";

import { useActions } from "@/app/context";
import { topicById } from "@/data/topics";
import type { Person } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { Awning, LeaveButton, PanelNav, TopicChips, topicVars } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";

const DEMO_CONTACT = "Demo profile — real people coming soon";

function Badges({ person }: { readonly person: Person }) {
  return (
    <ul className="badges" aria-label="Badges">
      {person.isYou ? <li className="badge badge--you">That's you!</li> : null}
      {person.telegramVerified ? (
        <li className="badge badge--tg">
          <Glyph name="check" size={14} />
          Telegram
        </li>
      ) : null}
      {person.ticketVerified ? (
        <li className="badge badge--ticket">
          <Icon id="admission_tickets" size={16} />
          Ticket verified (demo)
        </li>
      ) : null}
      {person.isDemo ? <li className="badge badge--demo">Demo</li> : null}
    </ul>
  );
}

function ContactLink({
  person,
  kind,
  primary,
}: {
  readonly person: Person;
  readonly kind: "telegram" | "x";
  readonly primary: boolean;
}) {
  const actions = useActions();
  const handle = kind === "telegram" ? person.telegram : person.x;
  if (!handle) return null;
  const label = kind === "telegram" ? "Message on Telegram" : "X profile";
  const className = `btn ${primary ? "btn--primary" : "btn--secondary"}`;
  const icon = kind === "telegram" ? <Icon id="speech_balloon" size={22} /> : null;
  if (person.isDemo) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => actions.pushToast(DEMO_CONTACT, "sparkles", "info")}
      >
        {icon}
        {label}
      </button>
    );
  }
  const href = kind === "telegram" ? `https://t.me/${handle}` : `https://x.com/${handle}`;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {icon}
      {label}
    </a>
  );
}

function OthersActions({ person }: { readonly person: Person }) {
  const actions = useActions();
  return (
    <div className="profile__actions">
      <ContactLink person={person} kind="telegram" primary />
      <div className="profile__row">
        <ContactLink person={person} kind="x" primary={!person.telegram} />
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => actions.locate(person.id)}
        >
          <Glyph name="pin" size={20} />
          Show on map
        </button>
      </div>
    </div>
  );
}

function YourActions({ person }: { readonly person: Person }) {
  const actions = useActions();
  return (
    <div className="profile__actions">
      <div className="profile__row">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => actions.locate(person.id)}
        >
          <Glyph name="pin" size={20} />
          Show on map
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => actions.startJoin(null)}
        >
          Edit my profile
        </button>
      </div>
      <LeaveButton />
    </div>
  );
}

/** A person's card: who they are, what they're into, and how to reach them. */
export function ProfileCard({
  person,
  chrome,
}: {
  readonly person: Person;
  readonly chrome: PanelChrome;
}) {
  const nameId = useId();
  const primary = person.topics[0] ?? "ai";
  const handles = [
    person.telegram ? `@${person.telegram}` : null,
    person.x ? `X @${person.x}` : null,
  ]
    .filter((h) => h !== null)
    .join(" · ");
  return (
    <article className="panel profile" style={topicVars(primary)} aria-labelledby={nameId}>
      <header className="panel__head profile__head" data-sheet-grab>
        <Awning color={topicById(primary).css} />
        <PanelNav chrome={chrome} />
        <div className="profile__id">
          <div className="profile__bean rangoli-disc">
            <BeanAvatar avatar={person.avatar} topic={primary} size={64} face="happy" />
          </div>
          <div className="profile__who">
            <h2 id={nameId} className="profile__name">
              {person.name}
            </h2>
            {handles ? <p className="profile__handles">{handles}</p> : null}
            <Badges person={person} />
          </div>
        </div>
        <TopicChips topics={person.topics} />
      </header>
      <div className="panel__scroll profile__body">
        {person.oneLiner ? <p className="bubble">{person.oneLiner}</p> : null}
        {person.isYou ? <YourActions person={person} /> : <OthersActions person={person} />}
        <p className="safety">
          <Icon id="shield" size={18} />
          Tip: nobody legit will ask for your seed phrase or funds.
        </p>
      </div>
    </article>
  );
}
