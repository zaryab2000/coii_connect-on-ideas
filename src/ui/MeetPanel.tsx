import "@/ui/meet.css";
import { useId } from "react";
import type { CSSProperties } from "react";

import { useActions, useApp } from "@/app/context";
import type { MeetView } from "@/app/store";
import type { Person } from "@/data/types";
import type { Chai } from "@/match/storage";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { CardFace } from "@/ui/CardBack";
import { Glyph, Icon } from "@/ui/Icon";
import {
  CHAI_STATUS_LABEL,
  formatCountdown,
  handDone,
  inboundText,
  wavesLeftText,
} from "@/ui/meet";
import { CardSlot } from "@/ui/MeetCard";
import { useNow, useOpenChai } from "@/ui/meetHooks";
import { Awning, PanelNav } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";

const HAND_SIZE = 3;

/** "4h 12m" until the next hand, ticking on its own. */
function Countdown({ to }: { readonly to: number }) {
  const now = useNow(20_000);
  return <span className="countdown">{formatCountdown(to - now)}</span>;
}

function MeetHeader({
  meet,
  chrome,
  titleId,
}: {
  readonly meet: MeetView | null;
  readonly chrome: PanelChrome;
  readonly titleId: string;
}) {
  return (
    <header className="panel__head meet__band" data-sheet-grab>
      <Awning color="var(--marigold)" />
      <PanelNav chrome={chrome} />
      <h2 id={titleId} className="meet__title">
        Your Adda 3
      </h2>
      {meet ? (
        <div className="meet__stats">
          <p className="meet-stat">
            <Glyph name="clock" size={18} />
            <span>
              new picks in <Countdown to={meet.resetAt} />
            </span>
          </p>
          <p className="meet-stat" data-empty={meet.wavesLeft === 0 || undefined}>
            <Icon id="waving_hand" size={18} />
            <span>{wavesLeftText(meet.wavesLeft)}</span>
          </p>
        </div>
      ) : (
        <p className="meet__blurb">Three people worth meeting, fresh every morning at 06:00.</p>
      )}
    </header>
  );
}

/** Not joined yet: a fanned hand of locked cards and the way in. */
function LockedHand() {
  const actions = useActions();
  return (
    <div className="meet-locked">
      <div className="meet-fan" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="meet-fan__card" style={{ "--i": i - 1 } as CSSProperties}>
            <CardFace index={null} locked />
          </span>
        ))}
      </div>
      <p className="meet-locked__title">Your daily picks are waiting</p>
      <p className="meet-locked__hint">
        Every day you get three people worth meeting, with the reason you two should talk. Wave at
        the ones you like. If they wave back, chai's on.
      </p>
      <button
        type="button"
        className="btn btn--primary btn--big"
        onClick={() => actions.startJoin(null)}
      >
        Join to get your daily picks
      </button>
    </div>
  );
}

function TribeButton() {
  const actions = useActions();
  const tribe = useApp((s) => s.tribe);
  const light = (): void => {
    if (!tribe) actions.toggleTribe();
    actions.closePanel();
  };
  return (
    <button type="button" className="btn btn--wave" onClick={light}>
      <Icon id="light_bulb" size={22} />
      {tribe ? "See My tribe on the map" : "Light up My tribe"}
    </button>
  );
}

function HandDone({ meet }: { readonly meet: MeetView }) {
  return (
    <div className="meet-done" role="status">
      <Icon id="sparkles" size={44} />
      <p className="meet-done__title">That's today's Adda 3</p>
      <p className="meet-done__hint">
        New picks in <Countdown to={meet.resetAt} />. Till then, see who shares your topics on the
        map.
      </p>
      <TribeButton />
    </div>
  );
}

function EmptyHand() {
  return (
    <div className="meet-done">
      <Icon id="seedling" size={44} />
      <p className="meet-done__title">No picks yet</p>
      <p className="meet-done__hint">More people arrive every day. Check back after 06:00.</p>
      <TribeButton />
    </div>
  );
}

function Hand({ meet, you }: { readonly meet: MeetView; readonly you: Person }) {
  if (meet.hand.length === 0) return <EmptyHand />;
  const done = handDone(meet);
  return (
    <>
      <ol className="meet-hand" aria-label="Today's picks">
        {meet.hand.map((card, index) => (
          <CardSlot key={card.personId} card={card} index={index} meet={meet} you={you} />
        ))}
      </ol>
      {meet.hand.length < HAND_SIZE && !done ? (
        <p className="empty-note">More people arrive every day.</p>
      ) : null}
      {done ? <HandDone meet={meet} /> : null}
    </>
  );
}

function ChaiRow({ chai }: { readonly chai: Chai }) {
  const openChai = useOpenChai();
  const person = useApp((s) => s.people.find((p) => p.id === chai.personId) ?? null);
  if (!person) return null;
  const status = CHAI_STATUS_LABEL[chai.status];
  return (
    <li>
      <button
        type="button"
        className="chai-row"
        onClick={() => openChai(person.id)}
        aria-label={`${person.name}, ${status}${chai.demo ? ", demo" : ""}. Open chai card.`}
      >
        <BeanAvatar
          className="chai-row__bean"
          avatar={person.avatar}
          topic={person.topics[0] ?? "ai"}
          size={44}
          face="happy"
        />
        <span className="chai-row__name">{person.name}</span>
        {chai.demo ? <span className="tag tag--demo">demo</span> : null}
        <span className="chai-pill" data-status={chai.status}>
          {status}
          {chai.status === "met" ? <Glyph name="check" size={14} /> : null}
        </span>
      </button>
    </li>
  );
}

function ChaiList({ chais }: { readonly chais: readonly Chai[] }) {
  const headingId = useId();
  const newest = chais.toSorted((a, b) => b.at - a.at);
  return (
    <section className="meet-chais" aria-labelledby={headingId}>
      <h3 id={headingId} className="list-heading">
        Your chais
      </h3>
      {newest.length === 0 ? (
        <p className="empty-note">
          When someone you waved at waves back, chai's on. They show up here.
        </p>
      ) : (
        <ul className="chai-rows">
          {newest.map((chai) => (
            <ChaiRow key={chai.personId} chai={chai} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MeetBody({ meet, you }: { readonly meet: MeetView; readonly you: Person }) {
  return (
    <>
      {meet.inbound > 0 ? (
        <p className="meet-inbound">
          <Icon id="locked" size={24} />
          <span>{inboundText(meet.inbound)}</span>
        </p>
      ) : null}
      <Hand meet={meet} you={you} />
      <p className="meet-private">
        <Icon id="shield" size={18} />
        Waves are private. Nobody sees yours unless they wave back.
      </p>
      <ChaiList chais={meet.chais} />
    </>
  );
}

/** Meet tab: today's Adda 3 (flip, wave, skip), the hidden-wave teaser and your chais. */
export function MeetPanel({ chrome }: { readonly chrome: PanelChrome }) {
  const meet = useApp((s) => s.meet);
  const you = useApp((s) => s.you);
  const titleId = useId();
  return (
    <section className="panel meet" aria-labelledby={titleId}>
      <MeetHeader meet={meet} chrome={chrome} titleId={titleId} />
      <div className="panel__scroll meet__body">
        {meet && you ? <MeetBody meet={meet} you={you} /> : <LockedHand />}
      </div>
    </section>
  );
}
