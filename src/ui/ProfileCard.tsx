import "@/ui/profile.css";
import { useId } from "react";

import { useActions, useApp } from "@/app/context";
import { pointsReader } from "@/app/points";
import { topicById } from "@/data/topics";
import type { Person } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { contactUnlocked, firstName, pointsText } from "@/ui/meet";
import { Awning, IntentChips, OneLiners, PanelNav, TopicChips, topicVars } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";
import { WaveButton } from "@/ui/WaveButton";

const DEMO_CONTACT = "Demo profile — real people coming soon";

function Badges({ person }: { readonly person: Person }) {
  return (
    <ul className="badges" aria-label="Badges">
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

function useUnlocked(personId: string): boolean {
  return useApp((s) => contactUnlocked(s.meet, personId));
}

function ShowOnMap({ id }: { readonly id: string }) {
  const actions = useActions();
  return (
    <button type="button" className="btn btn--secondary" onClick={() => actions.locate(id)}>
      <Glyph name="pin" size={20} />
      Show on map
    </button>
  );
}

/** Before you wave: where the contact buttons will appear, and why waving first. */
function LockedContact({ person }: { readonly person: Person }) {
  return (
    <div className="contact-lock">
      <Icon id="locked" size={26} />
      <p>
        <strong>Telegram and X unlock when you wave.</strong> {firstName(person.name)} gets +1 wave
        point, and only finds out it was you if they wave back.
      </p>
    </div>
  );
}

function OthersActions({ person }: { readonly person: Person }) {
  const unlocked = useUnlocked(person.id);
  return (
    <div className="profile__actions">
      <WaveButton person={person} />
      {unlocked ? (
        <div className="contact-open">
          <ContactLink person={person} kind="telegram" primary />
          <div className="profile__row">
            <ContactLink person={person} kind="x" primary={!person.telegram} />
            <ShowOnMap id={person.id} />
          </div>
        </div>
      ) : (
        <>
          <LockedContact person={person} />
          <ShowOnMap id={person.id} />
        </>
      )}
    </div>
  );
}

/** Handles once unlocked; until then a hint that a wave reveals them. */
function Handles({ person }: { readonly person: Person }) {
  const unlocked = useUnlocked(person.id);
  if (!unlocked) {
    return (
      <p className="profile__handles profile__handles--locked">
        <Icon id="locked" size={14} />
        Wave to see their handles
      </p>
    );
  }
  const handles = [
    person.telegram ? `@${person.telegram}` : null,
    person.x ? `X @${person.x}` : null,
  ]
    .filter((h) => h !== null)
    .join(" · ");
  return handles ? <p className="profile__handles">{handles}</p> : null;
}

function PointsBadge({ person }: { readonly person: Person }) {
  const points = useApp((s) => pointsReader(s)(person));
  return (
    <p className="points-badge" aria-label={pointsText(points)}>
      <Icon id="waving_hand" size={18} />
      <strong>{points}</strong>
      <span aria-hidden="true">wave {points === 1 ? "point" : "points"}</span>
    </p>
  );
}

/** Someone else's card: who they are, what they're into, and how to reach them. */
export function ProfileCard({
  person,
  chrome,
}: {
  readonly person: Person;
  readonly chrome: PanelChrome;
}) {
  const nameId = useId();
  const primary = person.topics[0] ?? "ai";
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
            <Handles person={person} />
            <Badges person={person} />
            <PointsBadge person={person} />
          </div>
        </div>
        <TopicChips topics={person.topics} />
        <IntentChips intents={person.intent} />
      </header>
      <div className="panel__scroll profile__body">
        <OneLiners lines={person.oneLiners} />
        <OthersActions person={person} />
        <p className="safety">
          <Icon id="shield" size={18} />
          Tip: nobody legit will ask for your seed phrase or funds.
        </p>
      </div>
    </article>
  );
}
