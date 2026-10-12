import "@/ui/trends.css";
import { useId, useMemo, useRef, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { topicById } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { chaseOf, risingRows, trendRows } from "@/match/trends";
import type { TrendRow } from "@/match/trends";
import { Icon } from "@/ui/Icon";
import { useReducedMotion } from "@/ui/meetHooks";
import { CloseButton, Overlay } from "@/ui/Overlay";
import { topicVars } from "@/ui/PanelChrome";
import { copyText, xPostUrl } from "@/ui/shareLinks";
import { peopleWord, raceShareText, trendsUrl, useRaceToday } from "@/ui/trends";
import type { RaceToday } from "@/ui/trends";
import { useFlip } from "@/ui/useFlip";

type Tab = "people" | "rising" | "since";

/** When this visit started: "Since you got here" counts from it before you join. */
const OPENED_AT = Date.now();

const numberFormat = new Intl.NumberFormat("en-IN");

/** The rows a tab shows: biggest crowds, or most joins in its window. */
function rowsFor(tab: Tab, today: RaceToday, people: readonly Person[], you: Person | null) {
  if (tab === "people") return today.rows;
  if (tab === "rising") return risingRows(today.rows);
  return risingRows(trendRows(people, you?.joinedAt ?? OPENED_AT));
}

function Hero({ titleId, onClose }: { readonly titleId: string; readonly onClose: () => void }) {
  const today = useRaceToday();
  const people = useApp((s) => s.people.length);
  const picks = today.rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <header className="race__hero">
      <CloseButton onClose={onClose} />
      <Icon id="fire" size={52} />
      <h2 id={titleId} className="race__title">
        Narrative race
      </h2>
      <p className="race__sub">
        <span className="race__live">Live</span>
        Which ideas Devcon 8 is lining up for · {numberFormat.format(picks)} picks from{" "}
        {numberFormat.format(people)} people
      </p>
    </header>
  );
}

function Tabs({ tab, onTab }: { readonly tab: Tab; readonly onTab: (tab: Tab) => void }) {
  const joined = useApp((s) => s.you !== null);
  const tabs: readonly [Tab, string][] = [
    ["people", "Most people"],
    ["rising", "Rising fastest · 24h"],
    ["since", joined ? "Since you joined" : "Since you got here"],
  ];
  return (
    <div className="race__tabs" role="group" aria-label="Rank booths by">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className="chip"
          aria-pressed={tab === id}
          onClick={() => onTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** "+1 Asha" on a booth's bar when someone joins it while the race is open. */
function Plus({ topic, openedAt }: { readonly topic: TopicId; readonly openedAt: number }) {
  const arrival = useApp((s) => s.lastArrival);
  if (!arrival || arrival.at < openedAt || !arrival.topics.includes(topic)) return null;
  return (
    <span key={arrival.at} className="race-plus" aria-hidden="true">
      +1 {arrival.name}
    </span>
  );
}

interface RowProps {
  readonly row: TrendRow;
  readonly tab: Tab;
  readonly max: number;
  readonly hot: boolean;
  readonly openedAt: number;
}

function rowLabel(row: TrendRow, tab: Tab, hot: boolean): string {
  const info = topicById(row.topic);
  const when = tab === "since" ? "new" : "today";
  const fire = hot ? ", rising fastest" : "";
  return `#${row.rank} ${info.label}: ${row.count} ${peopleWord(row.count)}, ${row.recent} ${when}${fire}. Open booth.`;
}

function deltaText(row: TrendRow, tab: Tab): string {
  return tab === "people" ? `▲ ${row.recent} today` : `of ${numberFormat.format(row.count)}`;
}

function RaceRow({ row, tab, max, hot, openedAt }: RowProps) {
  const actions = useActions();
  const info = topicById(row.topic);
  const value = tab === "people" ? row.count : row.recent;
  return (
    <li data-id={row.topic}>
      <button
        type="button"
        className="race-row"
        style={topicVars(row.topic)}
        onClick={() => actions.openBooth(row.topic)}
        aria-label={rowLabel(row, tab, hot)}
      >
        <span className="race-row__rank" data-first={row.rank === 1 || undefined}>
          {row.rank === 1 ? <Icon id="crown" size={20} /> : row.rank}
        </span>
        <Icon id={info.icon} size={26} />
        <span className="race-row__name">{info.short}</span>
        <span className="race-row__track">
          <span
            className="race-row__fill"
            style={{ width: `${(value / Math.max(1, max)) * 100}%` }}
          >
            {hot ? (
              <span className="race-row__hot">
                <Icon id="fire" size={14} />
                Hottest
              </span>
            ) : null}
          </span>
          <Plus topic={row.topic} openedAt={openedAt} />
        </span>
        <span className="race-row__count">
          {numberFormat.format(value)}
          <span className="race-row__mini" aria-hidden="true">
            {tab === "people" ? `▲${row.recent}` : `/${row.count}`}
          </span>
        </span>
        <span className="race-row__delta" data-quiet={row.recent === 0 || undefined}>
          {deltaText(row, tab)}
        </span>
      </button>
    </li>
  );
}

function RaceList({ tab, today }: { readonly tab: Tab; readonly today: RaceToday }) {
  const people = useApp((s) => s.people);
  const you = useApp((s) => s.you);
  const reduced = useReducedMotion();
  const list = useRef<HTMLOListElement>(null);
  const [openedAt] = useState(() => Date.now());
  const rows = useMemo(() => rowsFor(tab, today, people, you), [tab, today, people, you]);
  const max = Math.max(...rows.map((r) => (tab === "people" ? r.count : r.recent)));
  useFlip(list, reduced);
  return (
    <ol className="race__list" ref={list} aria-label="Booths in the race">
      {rows.map((row) => (
        <RaceRow
          key={row.topic}
          row={row}
          tab={tab}
          max={max}
          hot={row.topic === today.hot}
          openedAt={openedAt}
        />
      ))}
    </ol>
  );
}

function chaseText(rows: readonly TrendRow[], topic: TopicId): string {
  const chase = chaseOf(rows, topic);
  const name = topicById(topic).short;
  if (!chase?.ahead) return `${name} leads the race!`;
  const passes = topicById(chase.ahead.topic).short;
  return `${name} is #${chase.row.rank}. ${chase.need} more ${peopleWord(chase.need)} and it passes ${passes}.`;
}

function useShareRace(today: RaceToday): () => void {
  const actions = useActions();
  return () => {
    const text = raceShareText(today);
    if (typeof navigator.share === "function") {
      navigator.share({ title: "Narrative race · coii", text, url: trendsUrl() }).catch(() => {});
      return;
    }
    void copyText(`${text} ${trendsUrl()}`);
    window.open(xPostUrl(text, trendsUrl()), "_blank", "noopener,noreferrer");
    actions.pushToast("Race copied, and X is open to post it.", "fire", "success");
  };
}

/** Your booth's place and who it chases, with a nudge to invite people to it. */
function YourRace({ today }: { readonly today: RaceToday }) {
  const actions = useActions();
  const you = useApp((s) => s.you);
  const share = useShareRace(today);
  const topic = you?.topics[0] ?? null;
  return (
    <div className="race__you">
      <p className="race__you-text">
        {topic ? (
          <>
            <span className="race__you-dot" style={topicVars(topic)} />
            {chaseText(today.rows, topic)}
          </>
        ) : (
          "Back your favourite idea: join coii and your booths get a +1."
        )}
      </p>
      <div className="race__you-actions">
        <button type="button" className="btn btn--secondary" onClick={share}>
          Share the race
        </button>
        {topic ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => actions.openInvite(topic)}
          >
            Invite to {topicById(topic).short}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => actions.startJoin(null)}
          >
            <Icon id="waving_hand" size={20} />
            Join coii
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The narrative race: which booths Devcon 8 is lining up behind and which are picking up speed,
 * live as people join. Rows slide when one booth passes another; tapping one opens its booth.
 */
export function TrendsOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  const [tab, setTab] = useState<Tab>("people");
  const today = useRaceToday();
  return (
    <Overlay kind="trends" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <div className="overlay__scroll race">
        <Hero titleId={titleId} onClose={onClose} />
        <Tabs tab={tab} onTab={setTab} />
        <RaceList tab={tab} today={today} />
        <p className="race__how">
          <Icon id="fire" size={18} />
          <span>
            <strong>Hottest</strong> is the booth growing fastest today, not the biggest. Someone
            into three topics counts once in each.
          </span>
        </p>
      </div>
      <YourRace today={today} />
    </Overlay>
  );
}
