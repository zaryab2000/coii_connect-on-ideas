import "@/ui/ideas.css";
import { useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { IDEA_KINDS, IDEA_LINKS, IDEA_MAX, ideaCounter, ideaFits, IDEAS } from "@/app/ideas";
import type { IdeaKind } from "@/app/ideas";
import { Icon } from "@/ui/Icon";
import { CloseButton, Overlay } from "@/ui/Overlay";

function KindPicker({
  kind,
  onKind,
}: {
  readonly kind: IdeaKind;
  readonly onKind: (kind: IdeaKind) => void;
}) {
  const name = useId();
  return (
    <fieldset className="ideas__kinds" role="radiogroup">
      <legend className="ideas__legend">{IDEAS.kindLegend}</legend>
      <div className="ideas__chips">
        {IDEA_KINDS.map((k) => (
          <label key={k.id} className="idea-kind">
            <input
              type="radio"
              name={name}
              value={k.id}
              checked={kind === k.id}
              onChange={() => onKind(k.id)}
            />
            {k.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The form a joined person sends an idea with; `onSent` swaps in the thank-you. */
function IdeaForm({ onSent }: { readonly onSent: () => void }) {
  const actions = useActions();
  const fieldId = useId();
  const counterId = useId();
  const [kind, setKind] = useState<IdeaKind>("feature");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fits = ideaFits(body);
  const send = async (): Promise<void> => {
    if (!fits || sending) return;
    setSending(true);
    setProblem(null);
    const outcome = await actions.sendIdea(kind, body);
    setSending(false);
    if (outcome.ok) onSent();
    else setProblem(outcome.text);
  };
  return (
    <form
      className="ideas__form"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <KindPicker kind={kind} onKind={setKind} />
      <label htmlFor={fieldId} className="ideas__label">
        {IDEAS.label}
      </label>
      <textarea
        id={fieldId}
        className="ideas__text"
        rows={4}
        maxLength={IDEA_MAX + 100}
        placeholder={IDEAS.placeholder}
        value={body}
        aria-describedby={counterId}
        aria-invalid={body !== "" && !fits ? true : undefined}
        onChange={(e) => setBody(e.target.value)}
      />
      <p
        id={counterId}
        className="ideas__counter"
        data-off={(body !== "" && !fits) || undefined}
        aria-live="polite"
      >
        {ideaCounter(body)}
      </p>
      {problem ? (
        <p className="ideas__problem" role="alert">
          {problem}
        </p>
      ) : null}
      <button type="submit" className="btn btn--primary" disabled={!fits || sending}>
        <Icon id="rocket" size={20} />
        {sending ? IDEAS.sending : IDEAS.send}
      </button>
    </form>
  );
}

function Sent({
  onAgain,
  onClose,
}: {
  readonly onAgain: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="ideas__sent" role="status">
      <span className="ideas__tick" aria-hidden="true">
        ✅
      </span>
      <p>{IDEAS.sent}</p>
      <div className="ideas__sent-actions">
        <button type="button" className="btn btn--quiet" onClick={onAgain}>
          {IDEAS.again}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function JoinFirst() {
  const actions = useActions();
  return (
    <div className="ideas__join">
      <p>{IDEAS.joinFirst}</p>
      <button type="button" className="btn btn--primary" onClick={() => actions.startJoin(null)}>
        <Icon id="waving_hand" size={20} />
        {IDEAS.join}
      </button>
    </div>
  );
}

/** For developers, joined or not: the repo's issue form and its pull requests. */
function DevLinks() {
  return (
    <section className="ideas__dev" aria-label="For developers">
      <p className="ideas__dev-lead">{IDEAS.devHeading}</p>
      <a
        className="btn btn--secondary"
        href={IDEA_LINKS.issue}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon id="laptop" size={20} />
        {IDEAS.issue}
      </a>
      <a className="ideas__pulls" href={IDEA_LINKS.pulls} target="_blank" rel="noopener noreferrer">
        {IDEAS.pulls}
      </a>
    </section>
  );
}

/** "Got an idea for coii?": send an idea (joined people), or build it yourself (anyone). */
export function IdeasOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  const joined = useApp((s) => s.you !== null);
  const [sent, setSent] = useState(false);
  let body = <JoinFirst />;
  if (joined) {
    body = sent ? (
      <Sent onAgain={() => setSent(false)} onClose={onClose} />
    ) : (
      <IdeaForm onSent={() => setSent(true)} />
    );
  }
  return (
    <Overlay kind="ideas" labelledBy={titleId} leaving={leaving} onClose={onClose}>
      <div className="overlay__scroll ideas">
        <header className="ideas__head">
          <CloseButton onClose={onClose} />
          <Icon id="light_bulb" size={44} />
          <h2 id={titleId} className="ideas__title">
            {IDEAS.heading}
          </h2>
          <p className="ideas__sub">{IDEAS.sub}</p>
        </header>
        <div className="ideas__body">
          {body}
          <DevLinks />
        </div>
      </div>
    </Overlay>
  );
}
