import "@/ui/booth.css";
import { useCallback, useId, useMemo } from "react";

import { useActions, useApp } from "@/app/context";
import { topicById } from "@/data/topics";
import type { TopicId } from "@/data/types";
import { Glyph, Icon } from "@/ui/Icon";
import { Awning, PanelNav, topicVars } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";
import { peopleInTopic } from "@/ui/people";
import { PeopleRows } from "@/ui/PeopleRows";
import { useRaceToday } from "@/ui/trends";

const numberFormat = new Intl.NumberFormat("en-IN");

/** This booth's place in the narrative race; opens the race. */
function RaceLine({ topic }: { readonly topic: TopicId }) {
  const actions = useActions();
  const { rows, hot } = useRaceToday();
  const row = rows.find((r) => r.topic === topic);
  if (!row) return null;
  return (
    <button type="button" className="booth__race" onClick={() => actions.openOverlay("trends")}>
      <Icon id={hot === topic ? "fire" : "trophy"} size={18} />#{row.rank} in the narrative race
      {row.recent > 0 ? ` · ▲ ${row.recent} today` : ""}
    </button>
  );
}

/** A booth: its topic, how many people are into it, and who they are (newest first). */
export function BoothPanel({
  topic,
  chrome,
}: {
  readonly topic: TopicId;
  readonly chrome: PanelChrome;
}) {
  const actions = useActions();
  const people = useApp((s) => s.people);
  const highlighted = useApp((s) => s.highlight.includes(topic));
  const youHaveIt = useApp((s) => s.you?.topics.includes(topic) ?? false);
  const members = useMemo(() => peopleInTopic(people, topic), [people, topic]);
  const info = topicById(topic);
  const titleId = useId();
  const locate = useCallback((id: string) => actions.locate(id), [actions]);
  const count = members.length;

  return (
    <article className="panel booth" style={topicVars(topic)} aria-labelledby={titleId}>
      <header className="panel__head booth__band" data-sheet-grab>
        <Awning color={info.css} />
        <PanelNav chrome={chrome} />
        <div className="booth__title">
          <span className="booth__icon">
            <Icon id={info.icon} size={40} />
          </span>
          <div>
            <h2 id={titleId} className="booth__name">
              {info.label}
            </h2>
            <p className="booth__count">
              <strong>{numberFormat.format(count)}</strong>{" "}
              {count === 1 ? "person interested" : "people interested"}
            </p>
            <RaceLine topic={topic} />
          </div>
        </div>
      </header>
      <div className="panel__scroll">
        <div className="booth__actions">
          <button
            type="button"
            className="btn btn--secondary btn--toggle"
            aria-pressed={highlighted}
            onClick={() => actions.toggleHighlight(topic)}
          >
            {highlighted ? <Glyph name="check" size={20} /> : <Icon id="light_bulb" size={20} />}
            Highlight on map
          </button>
          {youHaveIt ? (
            <p className="booth__yours">
              <Icon id="red_heart" size={18} />
              You're into this
            </p>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => actions.startJoin(topic)}
            >
              Join this booth
            </button>
          )}
        </div>
        <h3 className="list-heading">Who's into this</h3>
        {count > 0 ? (
          <PeopleRows
            people={members}
            resetKey={topic}
            omitTopic={topic}
            onPick={locate}
            label={`People into ${info.label}`}
          />
        ) : (
          <p className="empty-note">Nobody here yet. Be the first to join this booth.</p>
        )}
      </div>
    </article>
  );
}
