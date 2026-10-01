import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useActions } from "@/app/context";
import { intentById } from "@/data/intents";
import { topicById } from "@/data/topics";
import type { IntentId, TopicId } from "@/data/types";
import { textOn } from "@/ui/color";
import { Glyph, Icon } from "@/ui/Icon";
import { capitalize } from "@/ui/meet";

/** Navigation a panel shows in its header; differs between the phone sheet and the side panel. */
export interface PanelChrome {
  readonly back: { readonly label: string; readonly onBack: () => void } | null;
  readonly onClose: (() => void) | null;
}

/** Striped stall awning with a scalloped edge, like the booths on the map. */
export function Awning({ color }: { readonly color: string }) {
  return (
    <div className="awning" style={{ "--stripe": color } as CSSProperties} aria-hidden="true" />
  );
}

/** Back and close buttons for a panel header. */
export function PanelNav({ chrome }: { readonly chrome: PanelChrome }) {
  if (!chrome.back && !chrome.onClose) return null;
  return (
    <div className="panel-nav">
      {chrome.back ? (
        <button type="button" className="nav-btn nav-btn--back" onClick={chrome.back.onBack}>
          <Glyph name="back" size={18} />
          <span>{chrome.back.label}</span>
        </button>
      ) : null}
      {chrome.onClose ? (
        <button
          type="button"
          className="nav-btn nav-btn--close"
          onClick={chrome.onClose}
          aria-label="Close"
        >
          <Glyph name="close" size={18} />
        </button>
      ) : null}
    </div>
  );
}

/** CSS variables that colour an element by topic (fill plus legible text). */
export function topicVars(topic: TopicId): CSSProperties {
  const { css } = topicById(topic);
  return { "--topic": css, "--on-topic": textOn(css) } as CSSProperties;
}

/** Topic chips in topic colours; tapping one opens that booth. */
export function TopicChips({ topics }: { readonly topics: readonly TopicId[] }) {
  const actions = useActions();
  return (
    <ul className="topic-chips" aria-label="Topics">
      {topics.map((id) => {
        const topic = topicById(id);
        return (
          <li key={id}>
            <button
              type="button"
              className="topic-chip"
              style={topicVars(id)}
              onClick={() => actions.openBooth(id)}
              aria-label={`${topic.label}. Open booth.`}
            >
              <Icon id={topic.icon} size={18} />
              <span>{topic.short}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** What someone is here for ("Hiring", "Looking for a role"); shown publicly. */
export function IntentChips({ intents }: { readonly intents: readonly IntentId[] }) {
  if (intents.length === 0) return null;
  return (
    <ul className="intent-chips" aria-label="Here for">
      {intents.map((id) => {
        const intent = intentById(id);
        return (
          <li key={id} className="intent-chip">
            <Icon id={intent.icon} size={18} />
            {capitalize(intent.phrase)}
          </li>
        );
      })}
    </ul>
  );
}

/** "Leave adda" with an inline confirm step. */
export function LeaveButton() {
  const actions = useActions();
  const [confirming, setConfirming] = useState(false);
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) stayRef.current?.focus();
  }, [confirming]);
  if (!confirming) {
    return (
      <button type="button" className="btn btn--quiet" onClick={() => setConfirming(true)}>
        Leave adda
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-labelledby="leave-question">
      <p id="leave-question" className="confirm__text">
        Leave the adda? Your bean walks out and this browser forgets your profile.
      </p>
      <div className="confirm__actions">
        <button type="button" className="btn btn--danger" onClick={() => actions.leave()}>
          Yes, leave
        </button>
        <button
          ref={stayRef}
          type="button"
          className="btn btn--secondary"
          onClick={() => setConfirming(false)}
        >
          Stay
        </button>
      </div>
    </div>
  );
}
