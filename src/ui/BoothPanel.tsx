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

const numberFormat = new Intl.NumberFormat("en-IN");

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
