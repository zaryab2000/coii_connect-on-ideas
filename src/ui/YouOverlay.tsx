import "@/ui/join.css";
import { useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { pointsReader } from "@/app/points";
import { topicById } from "@/data/topics";
import type { Person, TopicId } from "@/data/types";
import { rankOf } from "@/match/points";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { JoinForm } from "@/ui/JoinForm";
import { pointsText } from "@/ui/meet";
import { CloseButton, Overlay } from "@/ui/Overlay";
import {
  Awning,
  IntentChips,
  LeaveButton,
  OneLiners,
  TopicChips,
  topicVars,
} from "@/ui/PanelChrome";

function YouCard({ you }: { readonly you: Person }) {
  const handles = [you.telegram ? `@${you.telegram}` : null, you.x ? `X @${you.x}` : null]
    .filter((h) => h !== null)
    .join(" · ");
  return (
    <div className="you-card">
      <div className="you-card__bean rangoli-disc" style={topicVars(you.topics[0] ?? "ai")}>
        <BeanAvatar avatar={you.avatar} topic={you.topics[0] ?? "ai"} size={150} face="happy" />
      </div>
      <p className="you-card__name">{you.name}</p>
      {handles ? <p className="you-card__handles">{handles}</p> : null}
      <TopicChips topics={you.topics} />
      <IntentChips intents={you.intent} />
      <OneLiners lines={you.oneLiners} />
    </div>
  );
}

/** Your wave points and rank, opening the live board. */
function YourPoints({ you }: { readonly you: Person }) {
  const actions = useActions();
  const points = useApp((s) => pointsReader(s)(you));
  const rank = useApp((s) => rankOf(s.people, pointsReader(s), you));
  return (
    <button type="button" className="you-points" onClick={() => actions.openOverlay("board")}>
      <Icon id="trophy" size={36} />
      <span className="you-points__text">
        <strong>{pointsText(points)}</strong>
        <span>#{rank} on the board · see it live</span>
      </span>
    </button>
  );
}

/** Your profile once you've joined: the card people see, plus what you can do with it. */
function YouSummary({ you, onEdit }: { readonly you: Person; readonly onEdit: () => void }) {
  const actions = useActions();
  return (
    <div className="you-summary">
      <YouCard you={you} />
      <div className="you-summary__actions">
        <YourPoints you={you} />
        <button type="button" className="btn btn--primary" onClick={() => actions.locate(you.id)}>
          <Glyph name="pin" size={20} />
          Show me on map
        </button>
        <button type="button" className="btn btn--secondary" onClick={onEdit}>
          Edit my profile
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            actions.openPanel("meet");
            actions.closeOverlay();
          }}
        >
          <Icon id="sparkles" size={20} />
          See today's 3
        </button>
        <LeaveButton />
      </div>
    </div>
  );
}

function joinCopy(you: Person | null, editing: boolean): { title: string; blurb: string } {
  if (you === null) {
    return {
      title: "Join coii",
      blurb: "Put your bean on the map so people into the same ideas can find you.",
    };
  }
  if (editing)
    return { title: "Edit your bean", blurb: "Saving walks your bean back in with the new look." };
  const booths = you.topics.map((t) => topicById(t).short).join(", ");
  return { title: "You're in", blurb: `Your bean hangs out at ${booths}.` };
}

interface YouBodyProps {
  readonly you: Person | null;
  readonly editing: boolean;
  readonly setEditing: (editing: boolean) => void;
  readonly presetTopic: TopicId | null;
}

function YouBody({ you, editing, setEditing, presetTopic }: YouBodyProps) {
  const showForm = you === null || editing;
  return (
    <div className="overlay__scroll join__scroll" key={showForm ? "form" : "summary"}>
      {showForm ? (
        <JoinForm
          key={you?.id ?? "new"}
          you={you}
          presetTopic={presetTopic}
          onDone={() => setEditing(false)}
          onCancel={you ? () => setEditing(false) : null}
        />
      ) : (
        <YouSummary you={you} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

/**
 * Your own profile as a big centred overlay: the join form when you're new, a summary once
 * you've joined, and the same form (with the character studio) when you edit.
 */
export function YouOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const you = useApp((s) => s.you);
  const joinTopic = useApp((s) => s.joinTopic);
  const [editing, setEditing] = useState(joinTopic !== null);
  const titleId = useId();
  const { title, blurb } = joinCopy(you, editing);

  return (
    <Overlay kind="you" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <header className="join__band">
        <Awning color="var(--rani)" />
        <CloseButton onClose={onClose} />
        <h2 id={titleId} className="join__title">
          {title}
        </h2>
        <p className="join__blurb">{blurb}</p>
      </header>
      <YouBody you={you} editing={editing} setEditing={setEditing} presetTopic={joinTopic} />
    </Overlay>
  );
}
