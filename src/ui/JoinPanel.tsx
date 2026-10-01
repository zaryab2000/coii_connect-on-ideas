import "@/ui/join.css";
import { useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { topicById } from "@/data/topics";
import type { Person } from "@/data/types";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph } from "@/ui/Icon";
import { JoinForm } from "@/ui/JoinForm";
import { Awning, LeaveButton, PanelNav, TopicChips, topicVars } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";

function YouSummary({ you, onEdit }: { readonly you: Person; readonly onEdit: () => void }) {
  const actions = useActions();
  const handles = [you.telegram ? `@${you.telegram}` : null, you.x ? `X @${you.x}` : null]
    .filter((h) => h !== null)
    .join(" · ");
  return (
    <div className="you-summary">
      <div className="you-card">
        <div className="you-card__bean rangoli-disc" style={topicVars(you.topics[0] ?? "ai")}>
          <BeanAvatar avatar={you.avatar} topic={you.topics[0] ?? "ai"} size={96} face="happy" />
        </div>
        <p className="you-card__name">{you.name}</p>
        {handles ? <p className="you-card__handles">{handles}</p> : null}
        <TopicChips topics={you.topics} />
        {you.oneLiner ? <p className="bubble">{you.oneLiner}</p> : null}
      </div>
      <div className="you-summary__actions">
        <button type="button" className="btn btn--primary" onClick={() => actions.locate(you.id)}>
          <Glyph name="pin" size={20} />
          Show me on map
        </button>
        <button type="button" className="btn btn--secondary" onClick={onEdit}>
          Edit my profile
        </button>
        <LeaveButton />
      </div>
    </div>
  );
}

/** Join tab: the form when you are new (or editing), a "You're in" summary once you joined. */
export function JoinPanel({ chrome }: { readonly chrome: PanelChrome }) {
  const you = useApp((s) => s.you);
  const joinTopic = useApp((s) => s.joinTopic);
  const [editing, setEditing] = useState(joinTopic !== null);
  const titleId = useId();
  const showForm = you === null || editing;
  const title = you === null ? "Join the adda" : editing ? "Edit your bean" : "You're in";
  const blurb =
    you === null
      ? "Put your bean on the map so people into the same ideas can find you."
      : editing
        ? "Saving walks your bean back in with the new look."
        : `Your bean hangs out at ${you.topics.map((t) => topicById(t).short).join(", ")}.`;

  return (
    <section className="panel join" aria-labelledby={titleId}>
      <header className="panel__head join__band" data-sheet-grab>
        <Awning color="var(--rani)" />
        <PanelNav chrome={chrome} />
        <h2 id={titleId} className="join__title">
          {title}
        </h2>
        <p className="join__blurb">{blurb}</p>
      </header>
      <div className="panel__scroll" key={showForm ? "form" : "summary"}>
        {showForm ? (
          <JoinForm
            key={you?.id ?? "new"}
            you={you}
            presetTopic={joinTopic}
            onDone={() => setEditing(false)}
            onCancel={you ? () => setEditing(false) : null}
          />
        ) : (
          <YouSummary you={you} onEdit={() => setEditing(true)} />
        )}
      </div>
    </section>
  );
}
