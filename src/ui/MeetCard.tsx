import "@/ui/profile.css";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useActions, useApp } from "@/app/context";
import type { MeetView } from "@/app/store";
import { topicById } from "@/data/topics";
import type { Person } from "@/data/types";
import type { Card } from "@/match/hand";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { CardFace } from "@/ui/CardBack";
import { useCardSwipe } from "@/ui/cardSwipe";
import { Confetti } from "@/ui/Confetti";
import { Glyph, Icon } from "@/ui/Icon";
import { cardState, firstName } from "@/ui/meet";
import type { CardState } from "@/ui/meet";
import { useOpenChai, useReducedMotion, useWave } from "@/ui/meetHooks";
import { IntentChips, OneLiners, topicVars } from "@/ui/PanelChrome";

/** The back turns edge-on in this long; then the front springs in. Matches meet.css. */
const FLIP_OUT_MS = 160;

type Flip = "none" | "out" | "in";

function CardBadges({ person }: { readonly person: Person }) {
  if (!person.telegramVerified && !person.isDemo) return null;
  return (
    <ul className="badges" aria-label="Badges">
      {person.telegramVerified ? (
        <li className="badge badge--tg">
          <Glyph name="check" size={14} />
          Telegram
        </li>
      ) : null}
      {person.isDemo ? <li className="badge badge--demo">Demo</li> : null}
    </ul>
  );
}

/** Their topics; the ones you share are filled in the topic colour. */
function CardTopics({ person, you }: { readonly person: Person; readonly you: Person }) {
  return (
    <ul className="card-topics" aria-label="Topics">
      {person.topics.map((id) => {
        const topic = topicById(id);
        const shared = you.topics.includes(id);
        return (
          <li
            key={id}
            className="card-topic"
            data-shared={shared || undefined}
            style={topicVars(id)}
          >
            <Icon id={topic.icon} size={16} />
            {topic.short}
            {shared ? <span className="visually-hidden"> (you both)</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function Reasons({ reasons }: { readonly reasons: readonly string[] }) {
  return (
    <div className="why">
      <h4 className="why__title">Why you two</h4>
      <ul className="why__list">
        {reasons.map((reason) => (
          <li key={reason}>
            <Icon id="sparkles" size={16} />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stamp({ state }: { readonly state: CardState }) {
  if (state === "waved") {
    return (
      <span className="stamp stamp--waved" role="status">
        Waved
        <Icon id="waving_hand" size={22} />
      </span>
    );
  }
  if (state === "chai") {
    return (
      <span className="stamp stamp--chai" role="status">
        Chai's on!
        <Icon id="hot_beverage" size={22} />
      </span>
    );
  }
  return null;
}

function ShowOnMap({ id, quiet }: { readonly id: string; readonly quiet: boolean }) {
  const actions = useActions();
  return (
    <button
      type="button"
      className={quiet ? "btn btn--quiet meet-card__map" : "btn btn--secondary"}
      onClick={() => actions.locate(id)}
    >
      <Glyph name="pin" size={20} />
      Show on map
    </button>
  );
}

function CardActions({ state, person }: { readonly state: CardState; readonly person: Person }) {
  const actions = useActions();
  const wave = useWave();
  const openChai = useOpenChai();
  if (state === "open") {
    return (
      <div className="meet-card__actions">
        <div className="meet-card__row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => actions.skip(person.id)}
          >
            Skip
          </button>
          <button type="button" className="btn btn--wave" onClick={() => wave(person)}>
            <Icon id="waving_hand" size={24} />
            Wave
          </button>
        </div>
        <ShowOnMap id={person.id} quiet />
      </div>
    );
  }
  if (state === "waved") {
    return (
      <div className="meet-card__actions">
        <p className="meet-card__note">
          +1 wave point for {firstName(person.name)}, and their contact is unlocked. They only find
          out it was you if they wave back.
        </p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => actions.locate(person.id)}
        >
          <Icon id="speech_balloon" size={22} />
          See how to reach them
        </button>
      </div>
    );
  }
  return (
    <div className="meet-card__actions">
      <button type="button" className="btn btn--wave" onClick={() => openChai(person.id)}>
        <Icon id="hot_beverage" size={24} />
        Open chai card
      </button>
      <ShowOnMap id={person.id} quiet />
    </div>
  );
}

interface FrontProps {
  readonly card: Card;
  readonly person: Person;
  readonly you: Person;
  readonly state: CardState;
  readonly label: string;
  readonly entering: boolean;
}

/** The face of a card: who they are, why you two should talk, and wave / skip. */
function CardFront({ card, person, you, state, label, entering }: FrontProps) {
  const ref = useRef<HTMLElement>(null);
  const nameId = useId();
  const actions = useActions();
  const wave = useWave();
  const reducedMotion = useReducedMotion();
  const swipe = useCardSwipe(ref, {
    enabled: state === "open",
    reducedMotion,
    onSwipe: (verdict) => (verdict === "wave" ? wave(person) : actions.skip(person.id)),
  });
  useEffect(() => {
    if (entering) ref.current?.focus({ preventScroll: true });
  }, [entering]);
  const primary = person.topics[0] ?? "ai";
  return (
    <article
      ref={ref}
      tabIndex={-1}
      className="meet-card"
      data-enter={entering || undefined}
      data-state={state}
      style={topicVars(primary)}
      aria-labelledby={nameId}
      {...swipe}
    >
      <header className="meet-card__head">
        <span className="meet-card__index">{label}</span>
        {card.wildcard ? <span className="meet-card__wild">Wildcard</span> : null}
        <div className="meet-card__bean rangoli-disc">
          <BeanAvatar avatar={person.avatar} topic={primary} size={60} face="happy" />
        </div>
        <div className="meet-card__who">
          <h3 id={nameId} className="meet-card__name">
            {person.name}
          </h3>
          <CardBadges person={person} />
        </div>
      </header>
      <Stamp state={state} />
      <span className="swipe-hint swipe-hint--wave" aria-hidden="true">
        Wave
      </span>
      <span className="swipe-hint swipe-hint--skip" aria-hidden="true">
        Skip
      </span>
      <div className="meet-card__body">
        <IntentChips intents={person.intent} />
        <CardTopics person={person} you={you} />
        <OneLiners lines={person.oneLiners} className="meet-card__lines" />
        <Reasons reasons={card.reasons} />
        <CardActions state={state} person={person} />
      </div>
    </article>
  );
}

/** Flip state for one card: the back turns away, then the front springs in. */
function useFlip(): [Flip, () => void] {
  const [flip, setFlip] = useState<Flip>("none");
  useEffect(() => {
    if (flip !== "out") return undefined;
    const timer = window.setTimeout(() => setFlip("in"), FLIP_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [flip]);
  return [flip, () => setFlip("out")];
}

interface SlotProps {
  readonly card: Card;
  readonly index: number;
  readonly meet: MeetView;
  readonly you: Person;
}

/** One of today's cards: face down until tapped, then flipped; folds away when skipped. */
export function CardSlot({ card, index, meet, you }: SlotProps) {
  const actions = useActions();
  const person = useApp((s) => s.people.find((p) => p.id === card.personId) ?? null);
  const reducedMotion = useReducedMotion();
  const [flip, startFlip] = useFlip();
  const [burst, setBurst] = useState(false);
  const endBurst = useCallback(() => setBurst(false), []);
  if (!person) return null;
  const state = cardState(meet, card.personId);
  const label = `${index + 1} of ${meet.hand.length}`;
  const reveal = (): void => {
    if (state !== "hidden") return;
    if (meet.revealed.length === 0 && !reducedMotion) setBurst(true);
    actions.revealCard(card.personId);
    startFlip();
  };
  const skipped = state === "skipped";
  return (
    <li className="meet-slot" data-state={state} inert={skipped} aria-hidden={skipped || undefined}>
      <div className="meet-slot__inner">
        {state === "hidden" || flip === "out" ? (
          <button
            type="button"
            className="meet-back"
            data-flip={flip === "out" || undefined}
            aria-label={`Reveal card ${label}`}
            onClick={reveal}
          >
            <CardFace index={index + 1} locked={false} />
          </button>
        ) : (
          <CardFront
            card={card}
            person={person}
            you={you}
            state={state}
            label={label}
            entering={flip === "in"}
          />
        )}
      </div>
      {burst ? <Confetti onDone={endBurst} /> : null}
    </li>
  );
}
