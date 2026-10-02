import "@/ui/board.css";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import { useActions, useApp } from "@/app/context";
import { pointsReader } from "@/app/points";
import type { AppState } from "@/app/store";
import { TOPICS, topicById } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { chaseTarget, leaderboard } from "@/match/points";
import type { BoardRow } from "@/match/points";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { firstName, pointsText } from "@/ui/meet";
import { useReducedMotion } from "@/ui/meetHooks";
import { CloseButton, Overlay } from "@/ui/Overlay";
import { topicVars } from "@/ui/PanelChrome";

/** Ranks shown below the podium. */
const LIST_TO = 20;

function rowsFor(state: AppState, topic: TopicId | null): BoardRow[] {
  const people = topic ? state.people.filter((p) => p.topics.includes(topic)) : state.people;
  return leaderboard(people, pointsReader(state));
}

/**
 * Slides rows to their new places when ranks change (FLIP), unless motion is reduced. Runs
 * after every render: it is a cheap measure of 17 rows and only animates rows that moved.
 */
function useFlip(list: RefObject<HTMLOListElement | null>, reduced: boolean): void {
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const next = new Map<string, number>();
    for (const child of el.querySelectorAll<HTMLElement>(":scope > [data-id]")) {
      const id = child.dataset["id"] ?? "";
      const top = child.offsetTop;
      next.set(id, top);
      const before = tops.current.get(id);
      if (reduced || before === undefined || before === top) continue;
      child.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
        duration: 420,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    }
    tops.current = next;
  });
}

function Hero({ titleId, onClose }: { readonly titleId: string; readonly onClose: () => void }) {
  return (
    <header className="board__hero">
      <CloseButton onClose={onClose} />
      <Icon id="trophy" size={56} />
      <h2 id={titleId} className="board__title">
        Wave points
      </h2>
      <p className="board__sub">
        <span className="board__live">Live</span>
        Every person who waves at you is one point.
      </p>
    </header>
  );
}

function TopicFilter({
  topic,
  onTopic,
}: {
  readonly topic: TopicId | null;
  readonly onTopic: (topic: TopicId | null) => void;
}) {
  return (
    <div className="board__filter" role="group" aria-label="Show the board for a booth">
      <button
        type="button"
        className="chip"
        aria-pressed={topic === null}
        onClick={() => onTopic(null)}
      >
        Everyone
      </button>
      {TOPICS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="chip"
          style={topicVars(t.id)}
          aria-pressed={topic === t.id}
          onClick={() => onTopic(topic === t.id ? null : t.id)}
        >
          <Icon id={t.icon} size={18} />
          {t.short}
        </button>
      ))}
    </div>
  );
}

/** A "+1" that plays once whenever this person just got a point. */
function Plus({ id }: { readonly id: string }) {
  const bump = useApp((s) => s.points.lastBump);
  if (bump?.id !== id) return null;
  return (
    <span key={bump.at} className="board-plus" aria-hidden="true">
      +1
    </span>
  );
}

function PodiumSpot({ row, place }: { readonly row: BoardRow; readonly place: number }) {
  const actions = useActions();
  const { person } = row;
  const topic = person.topics[0] ?? "ai";
  return (
    <li className={`podium__spot podium__spot--${place}`}>
      <button
        type="button"
        className="podium__who"
        onClick={() => actions.locate(person.id)}
        aria-label={`#${row.rank} ${person.name}, ${pointsText(row.points)}. Show on map.`}
      >
        <span className="podium__crown">
          <Icon id="crown" size={place === 1 ? 34 : 26} />
        </span>
        <span className="podium__bean rangoli-disc" style={topicVars(topic)}>
          <BeanAvatar
            avatar={person.avatar}
            topic={topic}
            size={place === 1 ? 72 : 58}
            face="happy"
          />
        </span>
        <span className="podium__name">{firstName(person.name)}</span>
        <span className="podium__points">
          {row.points}
          <Plus id={person.id} />
        </span>
      </button>
      <span className="podium__step">{row.rank}</span>
    </li>
  );
}

function Podium({ rows }: { readonly rows: readonly BoardRow[] }) {
  const [first, second, third] = rows;
  if (!first) return null;
  return (
    <ol className="podium" aria-label="Top three">
      {second ? <PodiumSpot row={second} place={2} /> : null}
      <PodiumSpot row={first} place={1} />
      {third ? <PodiumSpot row={third} place={3} /> : null}
    </ol>
  );
}

function BoardList({ rows }: { readonly rows: readonly BoardRow[] }) {
  const actions = useActions();
  const reduced = useReducedMotion();
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, reduced);
  return (
    <ol className="board__list" ref={list} aria-label="Ranks 4 to 20">
      {rows.map((row) => {
        const { person } = row;
        const topic = person.topics[0] ?? "ai";
        return (
          <li key={person.id} data-id={person.id}>
            <button type="button" className="board-row" onClick={() => actions.locate(person.id)}>
              <span className="board-row__rank">{row.rank}</span>
              <BeanAvatar avatar={person.avatar} topic={topic} size={38} face="happy" />
              <span className="board-row__who">
                <span className="board-row__name">{person.name}</span>
                {person.oneLiners[0] ? (
                  <span className="board-row__line">{person.oneLiners[0]}</span>
                ) : (
                  <span className="board-row__line">{topicById(topic).label}</span>
                )}
              </span>
              <span className="board-row__points">
                {row.points}
                <Icon id="waving_hand" size={18} />
                <Plus id={person.id} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function GuestBar() {
  const actions = useActions();
  return (
    <div className="board__you board__you--guest">
      <p>Join to start collecting wave points.</p>
      <button type="button" className="btn btn--primary" onClick={() => actions.startJoin(null)}>
        <Icon id="waving_hand" size={22} />
        Join coii
      </button>
    </div>
  );
}

function chaseHint(rows: readonly BoardRow[], id: string): string {
  const chase = chaseTarget(rows, id);
  if (!chase) return "You're top of the board!";
  const waves = chase.need === 1 ? "wave" : "waves";
  return `${chase.need} more ${waves} to pass ${firstName(chase.person.name)}`;
}

/** Your standing (overall), who to chase next, or an invitation to join. */
function YouBar({ you, overall }: { readonly you: Person | null; readonly overall: BoardRow[] }) {
  if (!you) return <GuestBar />;
  const mine = overall.find((row) => row.person.id === you.id);
  const hint = chaseHint(overall, you.id);
  return (
    <div className="board__you">
      <BeanAvatar avatar={you.avatar} topic={you.topics[0] ?? "ai"} size={44} face="happy" />
      <p className="board__you-text">
        <strong>
          You · #{mine?.rank ?? "–"} · {pointsText(mine?.points ?? 0)}
        </strong>
        <span>{hint}</span>
      </p>
      <Plus id={you.id} />
    </div>
  );
}

/** The live wave-points leaderboard, centred over the venue. */
export function BoardOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  const [topic, setTopic] = useState<TopicId | null>(null);
  const state = useApp((s) => s);
  const rows = useMemo(() => rowsFor(state, topic), [state, topic]);
  const overall = useMemo(() => (topic ? rowsFor(state, null) : rows), [state, topic, rows]);
  return (
    <Overlay kind="board" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <div className="overlay__scroll board">
        <Hero titleId={titleId} onClose={onClose} />
        <TopicFilter topic={topic} onTopic={setTopic} />
        <Podium rows={rows.slice(0, 3)} />
        <BoardList rows={rows.slice(3, LIST_TO)} />
        <p className="board__how">
          <Glyph name="info" size={18} />
          <span>
            <strong>How to earn:</strong> add up to 3 catchy one-liners. They pop up over your bean
            and make people curious enough to wave. Each person can wave at you once.
          </span>
        </p>
      </div>
      <YouBar you={state.you} overall={overall} />
    </Overlay>
  );
}
