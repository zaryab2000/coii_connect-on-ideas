import { memo } from "react";
import type { CSSProperties } from "react";

import { topicById } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph } from "@/ui/Icon";

interface PersonRowProps {
  readonly person: Person;
  /** Topic to leave out of the dots (the booth you are looking at). */
  readonly omitTopic?: TopicId;
  readonly onPick: (id: string) => void;
}

function topicNames(topics: readonly TopicId[]): string {
  return topics.map((t) => topicById(t).short).join(", ");
}

/** One person in a list: tap to fly the map to them and open their card. */
export const PersonRow = memo(function PersonRow({ person, omitTopic, onPick }: PersonRowProps) {
  const primary = person.topics[0] ?? "ai";
  const dots = person.topics.filter((t) => t !== omitTopic);
  const who = person.isYou ? `${person.name} (you)` : person.name;
  return (
    <li className="person-row">
      <button
        type="button"
        className="person-row__button"
        onClick={() => onPick(person.id)}
        aria-label={`${who}. ${topicNames(person.topics)}. Show on map.`}
      >
        <BeanAvatar
          className="person-row__bean"
          avatar={person.avatar}
          topic={primary}
          size={44}
          lazy
        />
        <span className="person-row__text">
          <span className="person-row__name">
            <span className="person-row__name-text">{person.name}</span>
            {person.isYou ? <span className="tag tag--you">You</span> : null}
            {person.telegramVerified ? (
              <span className="person-row__verified" title="Telegram verified">
                <Glyph name="check" size={12} />
              </span>
            ) : null}
            <span className="person-row__dots">
              {dots.map((t) => (
                <span
                  key={t}
                  className="topic-dot"
                  style={{ "--topic": topicById(t).css } as CSSProperties}
                  title={topicById(t).short}
                />
              ))}
            </span>
          </span>
          {person.oneLiners[0] ? (
            <span className="person-row__line">{person.oneLiners[0]}</span>
          ) : null}
        </span>
        <span className="person-row__go">
          <Glyph name="pin" size={20} />
        </span>
      </button>
    </li>
  );
});
